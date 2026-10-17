import { formatCalculatedAmount, parseAmount } from './amount'

/** One editable line of a split. Amounts are string drafts so grouping and decimal commas survive typing. */
export type SplitLineDraft = {
  id: string
  category_id: string
  note: string
  amount: string
  /** The first line takes whatever the other lines leave until the user edits it. */
  auto: boolean
}

export type SplitResolution = {
  /** Amount of each line, absolute and in the same order as the drafts. */
  amounts: number[]
  /** Fixed total when one was typed, otherwise the sum of the lines. */
  total: number
  fixed: boolean
  /** Part of a fixed total not yet assigned. Always 0 without a fixed total. */
  remainder: number
  valid: boolean
  /** What the primary button should ask for while the split is incomplete. */
  problem: 'amounts' | 'assign' | 'category' | null
}

export const MIN_SPLIT_LINES = 2
export const MAX_SPLIT_LINES = 50
const cents = (value: number) => Math.round(value * 100) / 100

export function newSplitLine(category_id = '', amount = '', auto = false): SplitLineDraft {
  return { id: crypto.randomUUID(), category_id, note: '', amount, auto }
}

/** Two lines for a fresh split: the first keeps the category already chosen and takes the rest of the total. */
export function startSplit(category_id: string): SplitLineDraft[] {
  return [newSplitLine(category_id, '', true), newSplitLine()]
}

export function resolveSplit(totalDraft: string, lines: SplitLineDraft[], remainderLine = true): SplitResolution {
  const typedTotal = parseAmount(totalDraft, { allowNegative: false })
  const fixed = typedTotal !== null && typedTotal > 0
  const total = fixed ? typedTotal : 0
  const amounts = lines.map(line => parseAmount(line.amount, { allowNegative: false }) ?? 0)
  if (remainderLine && fixed && lines[0]?.auto) {
    amounts[0] = Math.max(0, cents(total - amounts.slice(1).reduce((sum, value) => sum + value, 0)))
  }
  const sum = cents(amounts.reduce((acc, value) => acc + value, 0))
  const remainder = fixed ? cents(total - sum) : 0
  const allCategorised = lines.every(line => line.category_id)
  const allPositive = amounts.every(value => value > 0)
  const complete = fixed ? remainder === 0 : sum > 0
  const valid = lines.length >= MIN_SPLIT_LINES && allCategorised && allPositive && complete
  const problem = valid ? null
    : !fixed && sum === 0 ? 'amounts'
    : !allPositive || remainder !== 0 ? 'assign'
    : 'category'
  return { amounts, total: fixed ? total : sum, fixed, remainder, valid, problem }
}

/** Divide a total over the lines; the last line takes the rounding difference. */
export function splitEqually(total: number, lines: SplitLineDraft[]): SplitLineDraft[] {
  if (lines.length === 0) return lines
  const share = cents(total / lines.length)
  let allocated = 0
  return lines.map((line, index) => {
    const value = index === lines.length - 1 ? cents(total - allocated) : share
    allocated = cents(allocated + value)
    return { ...line, amount: formatCalculatedAmount(value, { maximumFractionDigits: 2 }), auto: false }
  })
}

/** Edit one line's amount; editing the first line turns off its automatic rest. */
export function setLineAmount(lines: SplitLineDraft[], id: string, amount: string): SplitLineDraft[] {
  return lines.map(line => line.id === id ? { ...line, amount, auto: false } : line)
}

/** Remove a line. Removing the first automatic line hands the rest to the new first line. */
export function removeLine(lines: SplitLineDraft[], id: string): SplitLineDraft[] {
  const index = lines.findIndex(line => line.id === id)
  if (index === -1) return lines
  const next = lines.filter(line => line.id !== id)
  return index === 0 && lines[0].auto && next[0] ? [{ ...next[0], auto: true }, ...next.slice(1)] : next
}

/** Payload lines for the API: signed by the entry type and with the resolved amounts. */
export function toSplitPayloadLines(lines: SplitLineDraft[], resolution: SplitResolution, type: 'expense' | 'income') {
  const sign = type === 'expense' ? -1 : 1
  return lines.map((line, index) => ({
    category_id: line.category_id || null,
    amount: sign * resolution.amounts[index],
    note: line.note.trim() || null,
  }))
}
