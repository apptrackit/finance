export const investmentReportingCurrencies = ['HUF', 'USD', 'EUR'] as const
export type InvestmentReportingCurrency = typeof investmentReportingCurrencies[number]
