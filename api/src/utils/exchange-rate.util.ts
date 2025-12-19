export async function getExchangeRates(fromCurrency: string): Promise<Record<string, number>> {
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${fromCurrency}`)
    if (!response.ok) {
      console.warn(`Exchange rate API responded with non-ok status ${response.status} for currency ${fromCurrency}`)
      return {}
    }

    const data: unknown = await response.json()

    if (
      typeof data === 'object' &&
      data !== null &&
      'result' in data &&
      (data as any).result === 'success' &&
      'rates' in data &&
      typeof (data as any).rates === 'object' &&
      (data as any).rates !== null
    ) {
      return (data as any).rates as Record<string, number>
    } else {
      console.warn('Unexpected exchange rates response shape', data)
    }
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error)
  }
  return {}
}
