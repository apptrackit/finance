import { D1Database } from '@cloudflare/workers-types'

export class MarketDataRepository {
  constructor(private db: D1Database) {}

  // Exchange Rates
  async getExchangeRate(baseCurrency: string, targetCurrency: string): Promise<{ rate: number; fetchedAt: number } | null> {
    const result = await this.db
      .prepare('SELECT rate, fetched_at FROM exchange_rates WHERE base_currency = ? AND target_currency = ?')
      .bind(baseCurrency, targetCurrency)
      .first()

    if (!result) return null

    return {
      rate: result.rate as number,
      fetchedAt: result.fetched_at as number
    }
  }

  async getAllExchangeRates(baseCurrency: string): Promise<Record<string, { rate: number; fetchedAt: number }>> {
    const results = await this.db
      .prepare('SELECT target_currency, rate, fetched_at FROM exchange_rates WHERE base_currency = ?')
      .bind(baseCurrency)
      .all()

    const rates: Record<string, { rate: number; fetchedAt: number }> = {}
    
    if (results.results) {
      for (const row of results.results) {
        rates[row.target_currency as string] = {
          rate: row.rate as number,
          fetchedAt: row.fetched_at as number
        }
      }
    }

    return rates
  }

  async saveExchangeRates(baseCurrency: string, rates: Record<string, number>, fetchedAt: number): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO exchange_rates (base_currency, target_currency, rate, fetched_at) VALUES (?, ?, ?, ?)'
    )

    const batch = []
    for (const [targetCurrency, rate] of Object.entries(rates)) {
      batch.push(stmt.bind(baseCurrency, targetCurrency, rate, fetchedAt))
    }

    await this.db.batch(batch)
  }

  async deleteExchangeRates(baseCurrency?: string): Promise<void> {
    if (baseCurrency) {
      await this.db
        .prepare('DELETE FROM exchange_rates WHERE base_currency = ?')
        .bind(baseCurrency)
        .run()
    } else {
      await this.db.prepare('DELETE FROM exchange_rates').run()
    }
  }

  // Stock Prices
  async getStockPrice(symbol: string): Promise<{ price: number; fetchedAt: number } | null> {
    const result = await this.db
      .prepare('SELECT price, fetched_at FROM stock_prices WHERE symbol = ?')
      .bind(symbol)
      .first()

    if (!result) return null

    return {
      price: result.price as number,
      fetchedAt: result.fetched_at as number
    }
  }

  async saveStockPrice(symbol: string, price: number, fetchedAt: number): Promise<void> {
    await this.db
      .prepare('INSERT OR REPLACE INTO stock_prices (symbol, price, fetched_at) VALUES (?, ?, ?)')
      .bind(symbol, price, fetchedAt)
      .run()
  }

  async deleteStockPrices(symbol?: string): Promise<void> {
    if (symbol) {
      await this.db
        .prepare('DELETE FROM stock_prices WHERE symbol = ?')
        .bind(symbol)
        .run()
    } else {
      await this.db.prepare('DELETE FROM stock_prices').run()
    }
  }

  // Check if data is stale (older than 1 hour)
  isStale(fetchedAt: number): boolean {
    const oneHourInMs = 60 * 60 * 1000
    const now = Date.now()
    return (now - fetchedAt) > oneHourInMs
  }
}
