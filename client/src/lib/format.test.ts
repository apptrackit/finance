import { describe, expect, it } from 'vitest'
import { formatCompactNumber, formatDate, formatDateTime, formatMoney, formatNumber, formatPercent, formatSignedNumber, formatTime, MINUS } from './format'

const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ')

describe('shared display formatting', () => {
  it('groups every value, including four digits, with a decimal comma and a true minus', () => {
    expect(plain(formatNumber(8368))).toBe('8 368')
    expect(plain(formatNumber(-2222))).toBe(`${MINUS}2 222`)
    expect(plain(formatNumber(865.1, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))).toBe('865,10')
    expect(plain(formatMoney(-38.96, 'EUR', { maximumFractionDigits: 2 }))).toBe(`${MINUS}38,96 EUR`)
    expect(formatNumber(Number.NaN)).toBe('')
  })

  it('keeps fraction options valid when the minimum exceeds the maximum', () => {
    expect(plain(formatNumber(1.23456, { minimumFractionDigits: 4, maximumFractionDigits: 2 }))).toBe('1,23')
  })

  it('signs positive values and percentages', () => {
    expect(plain(formatSignedNumber(31000))).toBe('+31 000')
    expect(formatSignedNumber(0)).toBe('0')
    expect(formatPercent(-0.07, { maximumFractionDigits: 2 })).toBe(`${MINUS}0,07%`)
    expect(formatPercent(24.59, { signed: true, maximumFractionDigits: 2 })).toBe('+24,59%')
  })

  it('abbreviates with K/M/B in place of locale-specific suffixes', () => {
    expect(formatCompactNumber(362_085)).toBe('362,1K')
    expect(formatCompactNumber(1_568_726, 2)).toBe('1,57M')
    expect(formatCompactNumber(-148_000)).toBe(`${MINUS}148K`)
    expect(formatCompactNumber(999_960)).toBe('1M')
    expect(formatCompactNumber(640)).toBe('640')
  })

  it('formats local calendar dates without shifting the day', () => {
    expect(formatDate('2026-11-02')).toBe('Nov 2, 2026')
    expect(formatDate('2026-12-01', 'short')).toBe('Dec 1')
    expect(formatDate('2026-11-01', 'monthYear')).toBe('November 2026')
    expect(formatDate('2026-11-08', 'weekday')).toBe('Sun, Nov 8, 2026')
    expect(formatDate('not a date')).toBe('')
  })

  it('uses a 24-hour clock', () => {
    const evening = new Date(2026, 10, 8, 19, 24, 15)
    expect(formatTime(evening)).toBe('19:24')
    expect(formatDateTime(evening)).toBe('Nov 8, 2026, 19:24')
    expect(formatDateTime(evening, 'short', { seconds: true })).toBe('Nov 8, 19:24:15')
  })
})
