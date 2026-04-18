import { describe, it, expect } from 'vitest'
import { CreateAccountSchema, UpdateAccountSchema } from '../validators/account.validator'
import { CreateTransactionSchema } from '../validators/transaction.validator'
import { CreateCategorySchema } from '../validators/category.validator'
import { CreateTransferSchema } from '../validators/transfer.validator'
import { CreateBudgetSchema } from '../validators/budget.validator'

describe('Account validators', () => {
  it('accepts a valid create account payload', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Checking Account',
      type: 'cash',
      balance: 50000,
      currency: 'HUF',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = CreateAccountSchema.safeParse({
      name: '',
      type: 'cash',
      balance: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid type', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Test',
      type: 'savings',
      balance: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects unsupported currency', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Test',
      type: 'cash',
      balance: 100,
      currency: 'XYZ',
    })
    expect(result.success).toBe(false)
  })

  it('accepts investment account with symbol', () => {
    const result = CreateAccountSchema.safeParse({
      name: 'Apple Shares',
      type: 'investment',
      balance: 10,
      symbol: 'AAPL',
      asset_type: 'stock',
    })
    expect(result.success).toBe(true)
  })

  it('allows partial update with no fields', () => {
    const result = UpdateAccountSchema.safeParse({})
    expect(result.success).toBe(true)
  })
})

describe('Transaction validators', () => {
  it('accepts a valid expense transaction', () => {
    const result = CreateTransactionSchema.safeParse({
      account_id: 'acc-123',
      amount: -5000,
      date: '2026-04-15',
    })
    expect(result.success).toBe(true)
  })

  it('rejects zero amount', () => {
    const result = CreateTransactionSchema.safeParse({
      account_id: 'acc-123',
      amount: 0,
      date: '2026-04-15',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid date format', () => {
    const result = CreateTransactionSchema.safeParse({
      account_id: 'acc-123',
      amount: -500,
      date: '15/04/2026',
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional fields', () => {
    const result = CreateTransactionSchema.safeParse({
      account_id: 'acc-123',
      amount: 10000,
      date: '2026-04-01',
      description: 'Salary',
      category_id: 'cat-1',
      exclude_from_estimate: false,
    })
    expect(result.success).toBe(true)
  })
})

describe('Category validators', () => {
  it('accepts valid expense category', () => {
    const result = CreateCategorySchema.safeParse({
      name: 'Groceries',
      type: 'expense',
      icon: '🛒',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid type', () => {
    const result = CreateCategorySchema.safeParse({
      name: 'Groceries',
      type: 'other',
    })
    expect(result.success).toBe(false)
  })
})

describe('Transfer validators', () => {
  it('accepts a valid transfer', () => {
    const result = CreateTransferSchema.safeParse({
      from_account_id: 'acc-1',
      to_account_id: 'acc-2',
      amount_from: 100000,
      amount_to: 260,
      date: '2026-04-15',
    })
    expect(result.success).toBe(true)
  })

  it('rejects transfer to same account', () => {
    const result = CreateTransferSchema.safeParse({
      from_account_id: 'acc-1',
      to_account_id: 'acc-1',
      amount_from: 100,
      amount_to: 100,
      date: '2026-04-15',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative amounts', () => {
    const result = CreateTransferSchema.safeParse({
      from_account_id: 'acc-1',
      to_account_id: 'acc-2',
      amount_from: -100,
      amount_to: -100,
      date: '2026-04-15',
    })
    expect(result.success).toBe(false)
  })
})

describe('Budget validators', () => {
  it('accepts a valid monthly budget', () => {
    const result = CreateBudgetSchema.safeParse({
      amount: 500000,
      period: 'monthly',
      year: 2026,
      month: 4,
      account_scope: 'all',
      category_scope: 'all',
    })
    expect(result.success).toBe(true)
  })

  it('rejects zero or negative amount', () => {
    const result = CreateBudgetSchema.safeParse({
      amount: 0,
      period: 'monthly',
      year: 2026,
      account_scope: 'all',
      category_scope: 'all',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid month', () => {
    const result = CreateBudgetSchema.safeParse({
      amount: 100,
      period: 'monthly',
      year: 2026,
      month: 13,
      account_scope: 'all',
      category_scope: 'all',
    })
    expect(result.success).toBe(false)
  })
})
