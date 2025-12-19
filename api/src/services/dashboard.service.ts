import { AccountRepository } from '../repositories/account.repository'
import { NetWorthResponseDto, AccountNetWorth } from '../dtos/dashboard.dto'
import { getExchangeRates } from '../utils/exchange-rate.util'

export class DashboardService {
  constructor(private accountRepo: AccountRepository) {}

  async getNetWorth(currency: string = 'HUF'): Promise<NetWorthResponseDto> {
    // Get all accounts - need type field too
    const accounts = await this.accountRepo.findAll()

    if (!accounts || accounts.length === 0) {
      return { net_worth: 0, currency, accounts: [], rates_fetched: false }
    }

    // Fetch exchange rates from master currency
    const rates = await getExchangeRates(currency)

    let totalNetWorth = 0
    const accountDetails: AccountNetWorth[] = []

    for (const account of accounts) {
      // Skip investment accounts - they will be calculated by frontend with market prices
      if (account.type === 'investment') {
        continue
      }

      let balanceInMasterCurrency = account.balance

      // Convert to master currency if account is in a different currency
      if (account.currency !== currency) {
        const rate = rates[account.currency]
        if (rate) {
          // Convert: masterCurrency -> account.currency rate, so reverse to get master currency
          balanceInMasterCurrency = account.balance / rate
        } else {
          console.warn(`Exchange rate not available for ${account.currency}, using original value`)
        }
      }

      totalNetWorth += balanceInMasterCurrency

      accountDetails.push({
        id: account.id,
        balance: account.balance,
        currency: account.currency,
        balance_in_master: balanceInMasterCurrency
      })
    }

    return {
      net_worth: totalNetWorth,
      currency,
      accounts: accountDetails,
      rates_fetched: Object.keys(rates).length > 0
    }
  }
}
