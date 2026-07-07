import { describe, expect, it, vi } from 'vitest'
import { TransactionService } from '../services/transaction.service'
import { Account } from '../models/Account'
import { Transaction } from '../models/Transaction'

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'account-1',
    name: 'Checking',
    type: 'cash',
    balance: 1000,
    currency: 'HUF',
    updated_at: Date.now(),
    ...overrides,
  }
}

function createService(transactions: Record<string, Transaction>, accounts: Record<string, Account>) {
  const transactionRepo = {
    findById: vi.fn(async (id: string) => transactions[id] || null),
    create: vi.fn(async (transaction: Transaction) => {
      transactions[transaction.id] = transaction
    }),
    update: vi.fn(async (id: string, updates: Partial<Transaction>) => {
      transactions[id] = { ...transactions[id], ...updates }
    }),
    findUpcoming: vi.fn(async () => Object.values(transactions).filter(tx => tx.status === 'pending')),
  }

  const accountRepo = {
    findById: vi.fn(async (id: string) => accounts[id] || null),
    updateBalance: vi.fn(async (id: string, balance: number, updated_at: number) => {
      if (accounts[id]) {
        accounts[id].balance = balance
        accounts[id].updated_at = updated_at
      }
    }),
  }

  const service = new TransactionService(
    transactionRepo as any,
    accountRepo as any,
    { create: vi.fn() } as any
  )

  return { service, transactionRepo, accountRepo }
}

describe('upcoming transactions', () => {
  it('creates future cash transactions as pending without changing balance', async () => {
    const accounts = { 'account-1': makeAccount() }
    const transactions: Record<string, Transaction> = {}
    const { service, accountRepo } = createService(transactions, accounts)

    const result = await service.createTransaction({
      account_id: 'account-1',
      amount: 500,
      date: '2999-01-01',
      description: 'Future salary',
    })

    expect('status' in result && result.status).toBe('pending')
    expect(accounts['account-1'].balance).toBe(1000)
    expect(accountRepo.updateBalance).not.toHaveBeenCalled()
  })

  it('confirms a pending transaction and applies it once', async () => {
    const accounts = { 'account-1': makeAccount() }
    const transactions: Record<string, Transaction> = {
      'tx-1': {
        id: 'tx-1',
        account_id: 'account-1',
        amount: 500,
        date: '2026-07-07',
        status: 'pending',
      },
    }
    const { service, accountRepo } = createService(transactions, accounts)

    const result = await service.confirmTransaction('tx-1')

    expect(result.status).toBe('posted')
    expect(result.confirmed_at).toEqual(expect.any(Number))
    expect(accounts['account-1'].balance).toBe(1500)
    expect(accountRepo.updateBalance).toHaveBeenCalledTimes(1)
  })

  it('declines a pending transaction without changing balance', async () => {
    const accounts = { 'account-1': makeAccount() }
    const transactions: Record<string, Transaction> = {
      'tx-1': {
        id: 'tx-1',
        account_id: 'account-1',
        amount: 500,
        date: '2026-07-07',
        status: 'pending',
      },
    }
    const { service, accountRepo } = createService(transactions, accounts)

    const result = await service.declineTransaction('tx-1')

    expect(result.status).toBe('cancelled')
    expect(result.cancelled_at).toEqual(expect.any(Number))
    expect(accounts['account-1'].balance).toBe(1000)
    expect(accountRepo.updateBalance).not.toHaveBeenCalled()
  })

  it('keeps edited pending transactions pending', async () => {
    const accounts = { 'account-1': makeAccount() }
    const transactions: Record<string, Transaction> = {
      'tx-1': {
        id: 'tx-1',
        account_id: 'account-1',
        amount: 500,
        date: '2999-01-01',
        status: 'pending',
      },
    }
    const { service, accountRepo } = createService(transactions, accounts)

    const result = await service.updateTransaction('tx-1', {
      amount: 700,
      date: '2026-07-07',
    })

    expect(result.status).toBe('pending')
    expect(result.amount).toBe(700)
    expect(accounts['account-1'].balance).toBe(1000)
    expect(accountRepo.updateBalance).not.toHaveBeenCalled()
  })
})
