/**
 * Display formatting shared by every screen, so one amount or date reads the
 * same everywhere. Numbers follow the Hungarian convention the ledger already
 * uses (space grouping, decimal comma); negatives use a true minus sign (U+2212).
 * Dates and times are English with a 24-hour clock to match the interface copy.
 *
 * Editable inputs keep using lib/amount.ts; this module is display-only.
 */

const NUMBER_LOCALE = 'hu-HU'
const DATE_LOCALE = 'en-US'
export const MINUS = '−'

type NumberOptions = Omit<Intl.NumberFormatOptions, 'notation' | 'useGrouping'>

const numberFormats = new Map<string, Intl.NumberFormat>()
function numberFormat(options: NumberOptions): Intl.NumberFormat {
  const key = JSON.stringify(options)
  let format = numberFormats.get(key)
  if (!format) {
    // 'always' groups four-digit values too ("8 368"), which hu-HU skips by default.
    format = new Intl.NumberFormat(NUMBER_LOCALE, { ...options, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions)
    numberFormats.set(key, format)
  }
  return format
}

function clampFractionOptions(options: NumberOptions): NumberOptions {
  const { minimumFractionDigits: min, maximumFractionDigits: max } = options
  if (min !== undefined && max !== undefined && min > max) return { ...options, minimumFractionDigits: max }
  if (min !== undefined && max === undefined && min > 3) return { ...options, maximumFractionDigits: min }
  return options
}

/** Format a number with grouping, a decimal comma and a true minus sign. */
export function formatNumber(value: number, options: NumberOptions = {}): string {
  if (!Number.isFinite(value)) return ''
  return numberFormat(clampFractionOptions(options)).format(value).replace(/-/g, MINUS)
}

/** Format an amount followed by its currency or unit code, e.g. "−2 222 HUF". */
export function formatMoney(value: number, currency: string, options: NumberOptions = {}): string {
  const number = formatNumber(value, options)
  return number && currency ? `${number} ${currency}` : number
}

/** Prefix "+" for positive values; negatives already carry a minus sign. */
export function formatSignedNumber(value: number, options: NumberOptions = {}): string {
  const number = formatNumber(value, options)
  return value > 0 && number ? `+${number}` : number
}

const COMPACT_UNITS: Array<[number, string]> = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]

/**
 * Short form for axes and dense lists: "595,7K", "1,57M". Uses K/M/B in every
 * locale so it matches the English interface instead of Hungarian "E"/"M".
 */
export function formatCompactNumber(value: number, maximumFractionDigits = 1): string {
  if (!Number.isFinite(value)) return ''
  const absolute = Math.abs(value)
  for (let index = COMPACT_UNITS.length - 1; index >= 0; index--) {
    const [size, suffix] = COMPACT_UNITS[index]
    const next = COMPACT_UNITS[index - 1]
    if (absolute < size || (next && absolute >= next[0])) continue
    const scaled = value / size
    const factor = 10 ** maximumFractionDigits
    // Roll over to the next unit when rounding reaches 1000 (999 950 → 1M, not 1 000K).
    if (next && Math.round(Math.abs(scaled) * factor) / factor >= 1000) {
      return `${formatNumber(value / next[0], { maximumFractionDigits })}${next[1]}`
    }
    return `${formatNumber(scaled, { maximumFractionDigits })}${suffix}`
  }
  return formatNumber(value, { maximumFractionDigits })
}

export function formatPercent(value: number, options: NumberOptions & { signed?: boolean } = {}): string {
  const { signed = false, ...numberOptions } = options
  const number = signed ? formatSignedNumber(value, numberOptions) : formatNumber(value, numberOptions)
  return number ? `${number}%` : ''
}

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Read a Date, timestamp, ISO timestamp or local calendar date (YYYY-MM-DD). */
export function toDate(input: Date | string | number): Date {
  if (input instanceof Date) return input
  if (typeof input === 'string') {
    const match = LOCAL_DATE_PATTERN.exec(input)
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }
  return new Date(input)
}

export type DateStyle = 'medium' | 'short' | 'long' | 'weekday' | 'monthYear' | 'monthShortYear' | 'month' | 'monthShort'

const DATE_STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  medium: { month: 'short', day: 'numeric', year: 'numeric' }, // Nov 2, 2026
  short: { month: 'short', day: 'numeric' }, // Nov 2
  long: { month: 'long', day: 'numeric', year: 'numeric' }, // November 2, 2026
  weekday: { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, // Mon, Nov 2, 2026
  monthYear: { month: 'long', year: 'numeric' }, // November 2026
  monthShortYear: { month: 'short', year: 'numeric' }, // Nov 2026
  month: { month: 'long' }, // November
  monthShort: { month: 'short' }, // Nov
}

const dateFormats = new Map<string, Intl.DateTimeFormat>()
function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options)
  let format = dateFormats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(DATE_LOCALE, options)
    dateFormats.set(key, format)
  }
  return format
}

interface DateOptions { timeZone?: string }

export function formatDate(input: Date | string | number, style: DateStyle = 'medium', { timeZone }: DateOptions = {}): string {
  const date = toDate(input)
  if (Number.isNaN(date.getTime())) return ''
  return dateFormat({ ...DATE_STYLES[style], ...(timeZone ? { timeZone } : {}) }).format(date)
}

/** 24-hour time, e.g. "19:24". */
export function formatTime(input: Date | string | number, { timeZone, seconds = false }: DateOptions & { seconds?: boolean } = {}): string {
  const date = toDate(input)
  if (Number.isNaN(date.getTime())) return ''
  return dateFormat({ hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hourCycle: 'h23', ...(timeZone ? { timeZone } : {}) }).format(date)
}

/** "Nov 8, 2026, 19:24"; omit the year with style 'short' for recent stamps. */
export function formatDateTime(input: Date | string | number, style: 'medium' | 'short' = 'medium', options: DateOptions & { seconds?: boolean } = {}): string {
  const day = formatDate(input, style, options)
  const time = formatTime(input, options)
  return day && time ? `${day}, ${time}` : ''
}
