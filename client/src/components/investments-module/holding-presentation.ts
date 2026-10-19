/** Use a readable local source time; retain the full observation in <time>. */
export function holdingSourceTime(value: string | null | undefined, now = new Date()) {
  if (!value) return null
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(dateOnly ? `${value}T12:00:00` : value)
  if (!Number.isFinite(date.getTime())) return null
  const sameDay = date.toDateString() === now.toDateString()
  const day = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? {year:'numeric' as const} : {}),
  }).format(date)
  const time = new Intl.DateTimeFormat(undefined, {hour:'2-digit',minute:'2-digit'}).format(date)
  return {
    short: dateOnly ? day : sameDay ? time : `${day} · ${time}`,
    full: dateOnly ? day : new Intl.DateTimeFormat(undefined, {dateStyle:'full',timeStyle:'long'}).format(date),
  }
}
