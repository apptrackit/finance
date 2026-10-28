// Calendar-aligned x-axis ticks for date-proportional charts. The finest unit
// whose label spacing fits the plot width wins: days, months, then years.
export type CalendarTick = { date: string; label: string }

type Unit = 'day' | 'month' | 'year'
type Candidate = { unit: Unit; step: number; spacing: number; minimum: number }

const DAY = 86_400_000
const MAX_LABELS = 10
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Approximate spacing in days, and the minimum pixel gap each label style needs.
const candidates: Candidate[] = [
  ...[1, 2, 3, 7].map(step => ({ unit: 'day' as const, step, spacing: step, minimum: 56 })),
  { unit: 'day', step: 14, spacing: 14, minimum: 56 },
  ...[1, 2, 3, 6].map(step => ({ unit: 'month' as const, step, spacing: step * 30.4, minimum: 44 })),
  ...[1, 2, 5, 10].map(step => ({ unit: 'year' as const, step, spacing: step * 365.25, minimum: 48 })),
]

const iso = (time: number) => new Date(time).toISOString().slice(0, 10)
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

function tickDates({ unit, step }: Candidate, start: number, end: number) {
  const dates: number[] = []
  const first = new Date(start)
  if (unit === 'day') {
    for (let time = start; time <= end; time += DAY) {
      const date = new Date(time)
      const day = date.getUTCDate()
      // Restart on the 1st each month and skip a crowded final day before it.
      const aligned = step === 14 ? day === 1 || day === 15
        : (day - 1) % step === 0 && day + step <= daysInMonth(date.getUTCFullYear(), date.getUTCMonth()) + 1
      if (aligned) dates.push(time)
    }
    return dates
  }
  // Months align to January (Jan/Mar/May, quarters, halves); years to multiples of the step.
  for (let index = first.getUTCFullYear() * 12 + first.getUTCMonth(); ; index++) {
    const year = Math.floor(index / 12), month = index % 12
    const time = Date.UTC(year, month, 1)
    if (time > end) break
    const aligned = unit === 'month' ? month % step === 0 : month === 0 && year % step === 0
    if (time >= start && aligned) dates.push(time)
  }
  return dates
}

export function calendarTicks(startDate: string, endDate: string, width: number): CalendarTick[] {
  const start = Date.parse(`${startDate}T00:00:00Z`), end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []
  const days = Math.max(1, (end - start) / DAY)
  const pixelsPerDay = width / days
  const multiYear = new Date(start).getUTCFullYear() !== new Date(end).getUTCFullYear()
  for (const candidate of candidates) {
    if (candidate.spacing * pixelsPerDay < candidate.minimum) continue
    const dates = tickDates(candidate, start, end)
    if (!dates.length || dates.length > MAX_LABELS) continue
    return dates.map(time => {
      const date = new Date(time), month = date.getUTCMonth()
      const label = candidate.unit === 'day' ? `${months[month]} ${date.getUTCDate()}`
        : candidate.unit === 'year' || (multiYear && month === 0) ? String(date.getUTCFullYear())
          : months[month]
      return { date: iso(time), label }
    })
  }
  return [{ date: endDate, label: `${months[new Date(end).getUTCMonth()]} ${new Date(end).getUTCDate()}` }]
}
