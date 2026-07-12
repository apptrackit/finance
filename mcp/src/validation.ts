const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function assertDate(value: unknown, name: string): string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD format`)
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} is not a valid calendar date`)
  }
  return value
}

export function optionalDate(value: unknown, name: string): string | undefined {
  return value === undefined || value === null ? undefined : assertDate(value, name)
}

export function assertDateRange(startDate: string, endDate: string) {
  if (startDate > endDate) throw new Error('start_date must not be after end_date')
  const days = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1
  if (days > 3650) throw new Error('date range cannot exceed 10 years')
  return days
}

export function clampLimit(value: unknown, fallback = 50): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('limit must be a positive integer')
  }
  return Math.min(value, 100)
}

export function stringArray(value: unknown, name: string): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${name} must be an array of strings`)
  }
  return [...new Set(value)]
}

export function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T, name: string): T {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`)
  return value as T
}

export function defaultMonthRange(now = new Date()): { startDate: string; endDate: string } {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 0))
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
}

export function previousRange(startDate: string, endDate: string) {
  const days = assertDateRange(startDate, endDate)
  const previousEnd = new Date(Date.parse(`${startDate}T00:00:00Z`) - 86_400_000)
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86_400_000)
  return {
    startDate: previousStart.toISOString().slice(0, 10),
    endDate: previousEnd.toISOString().slice(0, 10),
  }
}

export function decodeCursor(cursor: unknown): number {
  if (cursor === undefined || cursor === null || cursor === '') return 0
  if (typeof cursor !== 'string') throw new Error('cursor must be a string')
  try {
    const offset = Number(atob(cursor))
    if (!Number.isInteger(offset) || offset < 0) throw new Error()
    return offset
  } catch {
    throw new Error('cursor is invalid')
  }
}

export function encodeCursor(offset: number): string {
  return btoa(String(offset))
}
