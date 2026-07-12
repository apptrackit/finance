const EDITABLE_GROUP_SEPARATOR_PATTERN = /[\s\u00a0\u202f]/g
const SCIENTIFIC_NUMBER_PATTERN = /^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/

export interface AmountFormatOptions {
  allowNegative?: boolean
  maximumFractionDigits?: number
  minimumFractionDigits?: number
}

export type CalculatedAmountFormatOptions = AmountFormatOptions

const amountPattern = (allowNegative: boolean) =>
  allowNegative ? /^-?\d*(?:\.\d*)?$/ : /^\d*(?:\.\d*)?$/

/**
 * Convert scientific notation to a plain decimal string without changing its
 * significant digits.
 */
export function expandScientificNotation(value: string | number): string {
  const source = typeof value === 'number' ? value.toString() : value.trim()
  const match = SCIENTIFIC_NUMBER_PATTERN.exec(source)

  if (!match) return source

  const [, sign, integer, fraction = '', exponentText] = match
  const exponent = Number(exponentText)
  const digits = integer + fraction
  const decimalPosition = integer.length + exponent
  const normalizedSign = sign === '+' ? '' : sign

  if (decimalPosition <= 0) {
    return `${normalizedSign}0.${'0'.repeat(-decimalPosition)}${digits}`
  }

  if (decimalPosition >= digits.length) {
    return `${normalizedSign}${digits}${'0'.repeat(decimalPosition - digits.length)}`
  }

  return `${normalizedSign}${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`
}

/**
 * Normalize characters accepted by editable amount fields while retaining the
 * user's separator scaffold. Returns null when the draft is not a valid
 * transient amount (for example, when it contains two decimal separators).
 */
export function normalizeAmountDraft(
  value: string,
  { allowNegative = true }: AmountFormatOptions = {},
): string | null {
  const normalized = value
    .replace(EDITABLE_GROUP_SEPARATOR_PATTERN, ' ')
    .replace(/,/g, '.')
  const ungrouped = normalized.replace(/ /g, '')

  return amountPattern(allowNegative).test(ungrouped) ? normalized : null
}

export function getAmountIntegerDigitCount(value: string): number {
  const normalized = normalizeAmountDraft(value, { allowNegative: true })
  if (normalized === null) return 0

  const unsigned = normalized.replace(/ /g, '').replace(/^-/, '')
  return unsigned.split('.')[0].length
}

function groupInteger(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Format a number or valid editable amount using ASCII-space grouping. */
export function formatAmount(
  value: string | number,
  options: AmountFormatOptions = {},
): string {
  const {
    allowNegative = true,
    maximumFractionDigits,
    minimumFractionDigits,
  } = options

  if (typeof value === 'number' && !Number.isFinite(value)) return ''
  if (
    typeof value === 'number' &&
    (maximumFractionDigits !== undefined || minimumFractionDigits !== undefined)
  ) {
    return formatCalculatedAmount(value, {
      allowNegative,
      maximumFractionDigits: maximumFractionDigits ?? Math.max(minimumFractionDigits ?? 0, 8),
      minimumFractionDigits,
    })
  }

  const expanded = expandScientificNotation(value)
  const normalized = normalizeAmountDraft(expanded, { allowNegative })
  if (normalized === null) return ''

  const ungrouped = normalized.replace(/ /g, '')
  if (ungrouped === '' || ungrouped === '-' || ungrouped === '.' || ungrouped === '-.') {
    return ungrouped
  }

  const isNegative = ungrouped.startsWith('-')
  const unsigned = isNegative ? ungrouped.slice(1) : ungrouped
  const decimalIndex = unsigned.indexOf('.')
  let integer = decimalIndex === -1 ? unsigned : unsigned.slice(0, decimalIndex)
  const decimal = decimalIndex === -1 ? null : unsigned.slice(decimalIndex + 1)

  if (integer === '' && decimal !== null && decimal !== '') integer = '0'

  const sign = isNegative ? '-' : ''
  const groupedInteger = groupInteger(integer)
  return decimal === null ? `${sign}${groupedInteger}` : `${sign}${groupedInteger}.${decimal}`
}

/** Strictly parse an editable amount, returning null for incomplete/invalid drafts. */
export function parseAmount(
  value: string,
  { allowNegative = true }: AmountFormatOptions = {},
): number | null {
  const normalized = normalizeAmountDraft(value, { allowNegative })
  if (normalized === null) return null

  const ungrouped = normalized.replace(/ /g, '')
  if (ungrouped === '' || ungrouped === '-' || ungrouped === '.' || ungrouped === '-.') {
    return null
  }

  const parsed = Number(ungrouped)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Format a calculated numeric value while rounding away floating-point tails.
 * The default of eight fraction digits is suitable for quantities; callers can
 * request two (or another currency-specific precision) for cash amounts.
 */
export function formatCalculatedAmount(
  value: number,
  {
    allowNegative = true,
    maximumFractionDigits = 8,
    minimumFractionDigits = 0,
  }: CalculatedAmountFormatOptions = {},
): string {
  if (!Number.isFinite(value)) return ''

  const maximum = Math.min(100, Math.max(0, Math.trunc(maximumFractionDigits)))
  const minimum = Math.min(maximum, Math.max(0, Math.trunc(minimumFractionDigits)))
  let rounded = expandScientificNotation(value.toFixed(maximum))

  const decimalIndex = rounded.indexOf('.')
  if (decimalIndex !== -1) {
    const integer = rounded.slice(0, decimalIndex)
    let fraction = rounded.slice(decimalIndex + 1)

    while (fraction.length > minimum && fraction.endsWith('0')) {
      fraction = fraction.slice(0, -1)
    }

    rounded = fraction === '' ? integer : `${integer}.${fraction}`
  }

  if (/^-0(?:\.0*)?$/.test(rounded)) rounded = rounded.slice(1)

  return formatAmount(rounded, { allowNegative })
}
