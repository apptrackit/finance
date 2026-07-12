import type { RecurringScheduleRow } from './types'

const DAY_MS = 86_400_000

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function utcDate(value: string) {
  return new Date(`${value}T00:00:00Z`)
}

export function addUtcDays(value: string, days: number) {
  return isoDate(new Date(utcDate(value).getTime() + days * DAY_MS))
}

export function daysBetween(startDate: string, endDate: string) {
  return Math.floor((utcDate(endDate).getTime() - utcDate(startDate).getTime()) / DAY_MS) + 1
}

function endOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

export function periodEndDates(startDate: string, endDate: string, interval: 'day' | 'week' | 'month', maxPoints = 400) {
  const points: string[] = []
  let cursor = utcDate(startDate)
  const end = utcDate(endDate)
  while (cursor <= end) {
    let point = new Date(cursor)
    if (interval === 'week') point = new Date(Math.min(end.getTime(), cursor.getTime() + 6 * DAY_MS))
    if (interval === 'month') point = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), endOfMonth(cursor.getUTCFullYear(), cursor.getUTCMonth())))
    if (point > end) point = new Date(end)
    points.push(isoDate(point))
    if (points.length > maxPoints) throw new Error(`interval produces more than ${maxPoints} chart points; use a larger interval or shorter date range`)
    if (interval === 'day') cursor = new Date(cursor.getTime() + DAY_MS)
    if (interval === 'week') cursor = new Date(cursor.getTime() + 7 * DAY_MS)
    if (interval === 'month') cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  }
  return points
}

export function recurringDates(schedule: RecurringScheduleRow, startDate: string, endDate: string, maxOccurrences: number) {
  const dates: string[] = []
  const start = utcDate(startDate)
  const end = utcDate(schedule.end_date && schedule.end_date < endDate ? schedule.end_date : endDate)
  const created = new Date(schedule.created_at)
  const createdDate = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate()))
  const nextUnprocessedDate = schedule.last_processed_date ? utcDate(addUtcDays(schedule.last_processed_date, 1)) : createdDate
  let cursor = new Date(Math.max(start.getTime(), createdDate.getTime(), nextUnprocessedDate.getTime()))
  const remaining = schedule.remaining_occurrences == null ? maxOccurrences : Math.min(schedule.remaining_occurrences, maxOccurrences)

  while (cursor <= end && dates.length < remaining) {
    const day = cursor.getUTCDay()
    const dayOfMonth = cursor.getUTCDate()
    const lastDay = endOfMonth(cursor.getUTCFullYear(), cursor.getUTCMonth())
    const targetDay = Math.min(schedule.day_of_month || 1, lastDay)
    const matches = schedule.frequency === 'daily'
      || (schedule.frequency === 'weekly' && day === schedule.day_of_week)
      || (schedule.frequency === 'monthly' && dayOfMonth === targetDay)
      || (schedule.frequency === 'yearly' && cursor.getUTCMonth() === created.getUTCMonth() && dayOfMonth === targetDay)
    const value = isoDate(cursor)
    if (matches) dates.push(value)
    cursor = new Date(cursor.getTime() + DAY_MS)
  }
  return dates
}
