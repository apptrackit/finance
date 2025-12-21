import { AccountRepository } from '../repositories/account.repository'
import { MarketDataRepository } from '../repositories/market-data.repository'
import { fetchPriceFromYahoo } from '../utils/yahoo-finance.util'
import { getExchangeRates } from '../utils/exchange-rate.util'

export class StartupSyncService {
  constructor(
    private db: D1Database,
    private accountRepo: AccountRepository,
    private marketDataRepo: MarketDataRepository
  ) {}

  async getSyncStatus(): Promise<{
    investmentSymbols: { symbol: string; hasCachedPrice: boolean; fetchedAt?: number }[];
    currencies: { currency: string; hasCachedRates: boolean; rateCount?: number }[];
    summary: {
      totalInvestments: number;
      cachedInvestments: number;
      totalCurrencies: number;
      cachedCurrencies: number;
      needsSync: boolean;
    };
  }> {
    console.log('[Startup Sync] Checking sync status...')

    // Get all distinct investment symbols
    const symbols = await this.accountRepo.getDistinctInvestmentSymbols()
    const investmentSymbols = []
    let cachedInvestments = 0

    for (const symbol of symbols) {
      const cachedPrice = await this.marketDataRepo.getStockPrice(symbol)
      investmentSymbols.push({
        symbol,
        hasCachedPrice: !!cachedPrice,
        fetchedAt: cachedPrice?.fetchedAt
      })
      if (cachedPrice) cachedInvestments++
    }

    // Get all unique currencies, filtering out non-currencies
    const allCurrencies = await this.accountRepo.getDistinctCurrencies()
    const currencies = allCurrencies.filter(c => 
      c.length === 3 && !['BTC', 'ETH', 'SHARE'].includes(c)
    )
    
    const currencyStatus = []
    let cachedCurrencies = 0

    for (const currency of currencies) {
      // Check if we have rates for this currency (as base or target)
      const ratesAsBase = await this.marketDataRepo.getAllExchangeRates(currency)
      const ratesAsTarget = await this.marketDataRepo.getAllExchangeRates('USD')
      
      const hasRatesAsBase = Object.keys(ratesAsBase).length > 0
      const hasRatesAsTarget = !!ratesAsTarget[currency]
      const hasRates = hasRatesAsBase || hasRatesAsTarget
      
      currencyStatus.push({
        currency,
        hasCachedRates: hasRates,
        rateCount: hasRatesAsBase ? Object.keys(ratesAsBase).length : (hasRatesAsTarget ? 1 : 0)
      })
      if (hasRates) cachedCurrencies++
    }

    return {
      investmentSymbols,
      currencies: currencyStatus,
      summary: {
        totalInvestments: symbols.length,
        cachedInvestments,
        totalCurrencies: currencies.length,
        cachedCurrencies,
        needsSync: cachedInvestments < symbols.length || cachedCurrencies < currencies.length
      }
    }
  }

  async syncMarketData(): Promise<void> {
    console.log('[Startup Sync] Starting market data synchronization...')

    try {
      // Sync investment account prices
      await this.syncInvestmentPrices()
      
      // Sync currency exchange rates
      await this.syncExchangeRates()

      console.log('[Startup Sync] Market data synchronization completed successfully')
    } catch (error) {
      console.error('[Startup Sync] Error during synchronization:', error)
      // Don't throw - allow app to start even if sync fails
    }
  }

  private async syncInvestmentPrices(): Promise<void> {
    console.log('[Startup Sync] Checking investment account prices...')

    // Get all distinct investment symbols
    const symbols = await this.accountRepo.getDistinctInvestmentSymbols()

    if (symbols.length === 0) {
      console.log('[Startup Sync] No investment accounts found')
      return
    }

    console.log(`[Startup Sync] Found ${symbols.length} unique investment symbol(s): ${symbols.join(', ')}`)

    let successCount = 0
    let errorCount = 0
    
    // Check each symbol for cached price
    for (const symbol of symbols) {
      const cachedPrice = await this.marketDataRepo.getStockPrice(symbol)
      
      if (!cachedPrice) {
        console.log(`[Startup Sync] Missing cache for ${symbol}, fetching...`)
        
        try {
          // Use current date for fetching latest price
          const today = new Date().toISOString().split('T')[0]
          const price = await fetchPriceFromYahoo(symbol, today, this.db)
          
          if (price && price > 0) {
            await this.marketDataRepo.saveStockPrice(symbol, price, Date.now())
            console.log(`[Startup Sync] ✓ Cached price for ${symbol}: ${price}`)
            successCount++
          } else {
            console.warn(`[Startup Sync] ✗ Could not fetch valid price for ${symbol} (returned ${price})`)
            errorCount++
          }
        } catch (error: any) {
          console.error(`[Startup Sync] ✗ Error fetching price for ${symbol}:`, error.message || error)
          errorCount++
          // Continue with other symbols
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000))
      } else {
        console.log(`[Startup Sync] Cache exists for ${symbol} (price: ${cachedPrice.price}, fetched: ${new Date(cachedPrice.fetchedAt).toISOString()})`)
        successCount++
      }
    }
    
    console.log(`[Startup Sync] Investment prices summary: ${successCount} cached, ${errorCount} failed`)
  }

  private async syncExchangeRates(): Promise<void> {
    console.log('[Startup Sync] Checking currency exchange rates...')

    // Get all unique currencies used in accounts, filtering out non-currencies
    const allCurrencies = await this.accountRepo.getDistinctCurrencies()
    const currencies = allCurrencies.filter(c => 
      c.length === 3 && !['BTC', 'ETH', 'SHARE'].includes(c)
    )

    if (currencies.length === 0) {
      console.log('[Startup Sync] No real currencies found in accounts')
      return
    }

    console.log(`[Startup Sync] Found ${currencies.length} unique currency/currencies: ${currencies.join(', ')}`)

    // For each currency, check if we have rates (either as base or target)
    const currenciesToFetch: string[] = []
    
    for (const currency of currencies) {
      const ratesAsBase = await this.marketDataRepo.getAllExchangeRates(currency)
      const ratesAsTarget = await this.marketDataRepo.getAllExchangeRates('USD')
      
      const hasRatesAsBase = Object.keys(ratesAsBase).length > 0
      const hasRatesAsTarget = !!ratesAsTarget[currency]
      
      if (!hasRatesAsBase && !hasRatesAsTarget) {
        currenciesToFetch.push(currency)
      }
    }

    if (currenciesToFetch.length === 0) {
      console.log('[Startup Sync] All exchange rates are already cached')
      return
    }

    console.log(`[Startup Sync] Need to fetch rates for: ${currenciesToFetch.join(', ')}`)

    // Fetch exchange rates for each missing currency using that currency as base
    let cachedCount = 0
    for (const currency of currenciesToFetch) {
      try {
        const rates = await getExchangeRates(currency, this.db)
        if (Object.keys(rates).length > 0) {
          cachedCount++
          console.log(`[Startup Sync] Successfully cached rates for ${currency} (${Object.keys(rates).length} rates)`)
        }
      } catch (error) {
        console.error(`[Startup Sync] Error fetching exchange rates for ${currency}:`, error)
      }
    }

    console.log(`[Startup Sync] Successfully cached exchange rates for ${cachedCount}/${currenciesToFetch.length} currencies`)
  }
}
