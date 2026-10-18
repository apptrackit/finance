/** Decimal arithmetic over the shortest recorded representation of each number.
 * BigInt is only an intermediate: D1/API values remain numbers. No currency or
 * holding precision is guessed here, and an unrepresentable result is rejected. */
type Decimal = { coefficient: bigint; scale: number }
function decimal(value: number): Decimal {
  if (!Number.isFinite(value))
    throw new Error('Balance arithmetic requires finite values')
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  return {
    coefficient: BigInt(whole + fraction),
    scale: fraction.length - Number(exponent),
  }
}
function total(values: readonly number[]): Decimal {
  const parts = values.map(decimal)
  const scale = Math.max(0, ...parts.map((p) => p.scale))
  return {
    scale,
    coefficient: parts.reduce(
      (sum, p) => sum + p.coefficient * 10n ** BigInt(scale - p.scale),
      0n,
    ),
  }
}
function same(a: Decimal, b: Decimal): boolean {
  const scale = Math.max(a.scale, b.scale)
  return (
    a.coefficient * 10n ** BigInt(scale - a.scale) ===
    b.coefficient * 10n ** BigInt(scale - b.scale)
  )
}
export function addDecimal(...values: number[]): number {
  const exact = total(values)
  const result = Number(`${exact.coefficient}e${-exact.scale}`)
  if (!Number.isFinite(result) || !same(exact, decimal(result))) {
    throw new Error(
      'Balance change exceeds representable decimal precision; no records were changed',
    )
  }
  return Object.is(result, -0) ? 0 : result
}
export type DecimalRecovery = { value: number; evidence_count: number } | null
/** Recovery is based on recorded flows, never an assumed rounded opening.
 * Require a complete bounded sequence, a representable decimal sum, and a
 * difference within both a floating-arithmetic error budget and 1/1024 of the
 * caller's supported quantum. Material/unverified openings are left intact.
 * It does NOT establish historical cost, ownership or opening coverage. */
export function recoverLedgerResidue(
  balance: number,
  flows: readonly number[],
  quantum: number,
): DecimalRecovery {
  if (
    !flows.length ||
    flows.length > 10000 ||
    !Number.isFinite(balance) ||
    !(quantum > 0)
  )
    return null
  try {
    const value = addDecimal(...flows)
    if (value === balance) return null
    const magnitude = flows.reduce(
      (sum, n) => sum + Math.abs(n),
      Math.abs(balance),
    )
    const errorBudget = Number.EPSILON * (flows.length + 8) * magnitude
    if (
      !Number.isFinite(errorBudget) ||
      Math.abs(value - balance) > Math.min(quantum / 1024, errorBudget)
    )
      return null
    return { value, evidence_count: flows.length }
  } catch {
    return null
  }
}
