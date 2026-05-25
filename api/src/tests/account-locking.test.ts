import { describe, expect, it, vi } from 'vitest'
import { TransactionService } from '../services/transaction.service'
import { TransferService } from '../services/transfer.service'
import { Account } from '../models/Account'
import { Transaction } from '../models/Transaction'

function makeAccount(overrides: Partial<Account>): Account {
  return {
    id: 'acc-1',
    name: 'Checking',
    type: 'cash',
    balance: 1000,
    currency: 'HUF',
    updated_at: Date.now(),
    ...overrides,
  }
}

function makeAccountRepo(accounts: Record<string, Account>) {
  return {
    findById: vi.fn(async (id: string) => accounts[id] || null),
    updateBalance: vi.fn(async (id: string, balance: number) => {
      if (accounts[id]) {
        accounts[id].balance = balance
      }
    }),
  }
}

describe('account locking enforcement', () => {
  it('rejects new transactions for locked accounts', async () => {
    const accountRepo = makeAccountRepo({
      locked: makeAccount({ id: 'locked', name: 'Vault', is_locked: true }),
    })
    const transactionRepo = {
      create: vi.fn(),
    }
    const investmentTransactionRepo = {
      create: vi.fn(),
    }
    const service = new TransactionService(
      transactionRepo as any,
      accountRepo as any,
      investmentTransactionRepo as any
    )

    await expect(service.createTransaction({
      account_id: 'locked',
      amount: -100,
      date: '2026-04-15',
    })).rejects.toThrow('Account "Vault" is locked')

    expect(transactionRepo.create).not.toHaveBeenCalled()
    expect(accountRepo.updateBalance).not.toHaveBeenCalled()
  })

  it('rejects transfer edits when either transfer account is locked', async () => {
    const transactions: Record<string, Transaction> = {
      out: {
        id: 'out',
        account_id: 'from',
        amount: -100,
        date: '2026-04-15',
        linked_transaction_id: 'in',
      },
      in: {
        id: 'in',
        account_id: 'to',
        amount: 100,
        date: '2026-04-15',
        linked_transaction_id: 'out',
      },
    }
    const accountRepo = makeAccountRepo({
      from: makeAccount({ id: 'from', name: 'Checking' }),
      to: makeAccount({ id: 'to', name: 'Vault', is_locked: true }),
    })
    const transactionRepo = {
      findById: vi.fn(async (id: string) => transactions[id] || null),
      update: vi.fn(),
    }
    const service = new TransactionService(
      transactionRepo as any,
      accountRepo as any,
      { create: vi.fn() } as any
    )

    await expect(service.updateTransaction('out', {
      account_id: 'from',
      to_account_id: 'to',
      amount: 150,
      amount_to: 150,
    })).rejects.toThrow('Account "Vault" is locked')

    expect(transactionRepo.update).not.toHaveBeenCalled()
    expect(accountRepo.updateBalance).not.toHaveBeenCalled()
  })

  it('rejects transfer creation for locked accounts', async () => {
    const accountRepo = makeAccountRepo({
      from: makeAccount({ id: 'from', name: 'Checking' }),
      to: makeAccount({ id: 'to', name: 'Savings', is_locked: true }),
    })
    const transactionRepo = {
      create: vi.fn(),
    }
    const investmentTransactionRepo = {
      create: vi.fn(),
    }
    const service = new TransferService(
      accountRepo as any,
      transactionRepo as any,
      investmentTransactionRepo as any
    )

    await expect(service.createTransfer({
      from_account_id: 'from',
      to_account_id: 'to',
      amount_from: 100,
      amount_to: 100,
      date: '2026-04-15',
    })).rejects.toThrow('Account "Savings" is locked')

    expect(transactionRepo.create).not.toHaveBeenCalled()
    expect(accountRepo.updateBalance).not.toHaveBeenCalled()
  })
})
