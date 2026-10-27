import { addDays, format, parseISO } from 'date-fns'

type BalancePoint = { date: string; balance: number }

// Clips complete ascending closing balances to a calendar period. The period
// opens on its first day only when an earlier record covers that day, so no
// pre-ledger balance is invented; it closes on the last recorded day (today,
// or a projected date) or carries forward to the end of a finished period.
// Daily mode adds every quiet day so short periods read as a calendar.
export function clipBalancesToPeriod(points: BalancePoint[], { start, end, daily = false }: { start: string; end: string; daily?: boolean }): BalancePoint[] {
  const before = points.filter(point => point.date < start).at(-1)
  const inside = points.filter(point => point.date >= start && point.date <= end)
  const after = points.some(point => point.date > end)
  const clipped = before && inside[0]?.date !== start ? [{ date: start, balance: before.balance }, ...inside] : inside
  const last = clipped.at(-1)
  if (last && after && last.date < end) clipped.push({ date: end, balance: last.balance })
  if (!daily || clipped.length < 2) return clipped

  const filled: BalancePoint[] = []
  for (let index = 0; index < clipped.length; index++) {
    const point = clipped[index]
    filled.push(point)
    const next = clipped[index + 1]
    if (!next) break
    for (let date = addDays(parseISO(point.date), 1); format(date, 'yyyy-MM-dd') < next.date; date = addDays(date, 1)) {
      filled.push({ date: format(date, 'yyyy-MM-dd'), balance: point.balance })
    }
  }
  return filled
}
