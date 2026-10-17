export type ManualValuation = {
  id: string; account_id: string; effective_date: string; kind: 'total' | 'per_unit'
  amount: number; currency: string; source: 'baseline' | 'initial' | 'user' | 'acquisition'
  source_trade_id?: string | null; version: number; created_at: number; updated_at: number
}
export const MANUAL_STALE_DAYS = 90
export type ManualValuationStatus = {
  observation: ManualValuation | null; as_of: string | null; age_days: number | null
  stale_after_days: number; status: 'current' | 'stale' | 'missing' | 'future'
}
export function manualValuationStatus(observation: ManualValuation | null, today: string): ManualValuationStatus {
  const age = observation ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${observation.effective_date}T00:00:00Z`)) / 86400000) : null
  return { observation, as_of: observation?.effective_date ?? null, age_days: age,
    stale_after_days: MANUAL_STALE_DAYS, status: age === null ? 'missing' : age < 0 ? 'future' : age >= MANUAL_STALE_DAYS ? 'stale' : 'current' }
}
/** No backward fill: a later appraisal cannot establish an earlier value. */
export function valuationAt(observations: ManualValuation[], date: string): ManualValuation | null {
  return observations.filter(v => v.effective_date <= date).sort((a,b) => b.effective_date.localeCompare(a.effective_date))[0] ?? null
}
export type ValuationInput = {
  effective_date: string; amount: number; expected_version: number; expected_id: string | null
}
