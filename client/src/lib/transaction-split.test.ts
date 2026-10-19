import { describe, expect, it } from 'vitest'
import { newSplitLine, removeLine, resolveSplit, setLineAmount, splitEqually, startSplit, toSplitPayloadLines } from './transaction-split'

const line = (category_id: string, amount: string, auto = false) => newSplitLine(category_id, amount, auto)

describe('resolveSplit', () => {
  it('gives the first automatic line the rest of a fixed total', () => {
    const lines = [line('food', '', true), line('home', '11 350')]
    const result = resolveSplit('48 600', lines)
    expect(result).toMatchObject({ amounts: [37250, 11350], total: 48600, fixed: true, remainder: 0, valid: true, problem: null })
  })

  it('uses the sum of the lines when no total is typed', () => {
    const result = resolveSplit('', [line('food', '24 900'), line('home', '11 350')])
    expect(result).toMatchObject({ total: 36250, fixed: false, remainder: 0, valid: true })
  })

  it('reports what is missing, in the order a person fixes it', () => {
    expect(resolveSplit('', [line('food', ''), line('home', '')]).problem).toBe('amounts')
    expect(resolveSplit('100', [line('food', '40'), line('home', '30')]).problem).toBe('assign')
    expect(resolveSplit('100', [line('food', '60'), line('', '40')]).problem).toBe('category')
    expect(resolveSplit('100', [line('food', '60'), line('home', '50')])).toMatchObject({ remainder: -10, valid: false, problem: 'assign' })
  })

  it('never lets the automatic line go negative', () => {
    const result = resolveSplit('100', [line('food', '', true), line('home', '150')])
    expect(result.amounts[0]).toBe(0)
    expect(result.valid).toBe(false)
  })

  it('needs at least two lines and ignores the rest line when disabled', () => {
    expect(resolveSplit('100', [line('food', '100')]).valid).toBe(false)
    expect(resolveSplit('100', [line('food', '', true), line('home', '40')], false).amounts).toEqual([0, 40])
  })

  it('rounds away floating point tails', () => {
    expect(resolveSplit('0.3', [line('a', '0.1'), line('b', '0.2')])).toMatchObject({ remainder: 0, valid: true })
  })
})

describe('line editing', () => {
  it('splits a total equally and gives the last line the rounding difference', () => {
    const lines = splitEqually(100, [line('a', ''), line('b', ''), line('c', '')])
    expect(lines.map(item => item.amount)).toEqual(['33.33', '33.33', '33.34'])
    expect(lines.every(item => !item.auto)).toBe(true)
  })

  it('editing the first line turns off its automatic rest', () => {
    const lines = startSplit('food')
    expect(lines[0]).toMatchObject({ category_id: 'food', auto: true })
    expect(setLineAmount(lines, lines[0].id, '10')[0].auto).toBe(false)
  })

  it('removing the automatic first line hands the rest to the next line', () => {
    const lines = startSplit('food')
    const next = removeLine(lines, lines[0].id)
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: lines[1].id, auto: true })
  })

  it('signs payload lines by entry type and trims notes', () => {
    const lines = [{ ...line('food', '30'), note: ' Bread ' }, line('', '20')]
    const resolution = resolveSplit('', lines)
    expect(toSplitPayloadLines(lines, resolution, 'expense')).toEqual([
      { category_id: 'food', amount: -30, note: 'Bread' }, { category_id: null, amount: -20, note: null },
    ])
    expect(toSplitPayloadLines(lines, resolution, 'income')[0].amount).toBe(30)
  })
})
