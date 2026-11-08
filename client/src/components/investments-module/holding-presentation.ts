import { formatDate, formatTime } from '../../lib/format'

/** Use a readable local source time; retain the full observation in <time>. */
export function holdingSourceTime(value: string | null | undefined, now = new Date()) {
  if (!value) return null
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(dateOnly ? `${value}T12:00:00` : value)
  if (!Number.isFinite(date.getTime())) return null
  const sameDay = date.toDateString() === now.toDateString()
  const day = formatDate(date, date.getFullYear() !== now.getFullYear() ? 'medium' : 'short')
  const time = formatTime(date)
  return {
    short: dateOnly ? day : sameDay ? time : `${day} · ${time}`,
    full: dateOnly ? day : `${formatDate(date, 'weekday')}, ${formatTime(date, { seconds: true })}`,
  }
}
