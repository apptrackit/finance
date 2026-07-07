import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TransactionService } from '../services/transaction.service'
import { Transaction } from '../models/Transaction'

describe('upcoming transactions', () => {
  let transactionRepo: any
  let accountRepo: any
  let investmentTransactionRepo: any
  let service: TransactionService

  beforeEach(() => {
    transactionRepo = {
      create: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(),
      findUpcoming: vi.fn(),
    }
    accountRepo = {
      findById: vi.fn(),
      updateBalance: vi.fn(),
    }
    investmentTransactionRepo = {
      create: vi.fn(),
    }
    service = new TransactionService(transactionRepo, accountRepo, investmentTransactionRepo)
  })

  it('stores a future cash transaction as pending without changing balance', async () => {
    accountRepo.findById.mockResolvedValue({
      id: 'acc-1',
      name: 'Cash',
      type: 'cash',
      balance: 100,
      currency: 'HUF',
      updated_at: 0,
    })

    const result = await service.createTransaction({
      account_id: 'acc-1',
      amount: 500,
      date: '2999-01-01',
      description: 'Future income',
    }) as Transaction

    expect(result.status).toBe('pending')
    expect(transactionRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending',
      confirmed_at: null,
    }))
    expect(accountRepo.updateBalance).not.toHaveBeenCalled()
  })

  it('confirming a pending transaction applies it once to the account balance', async () => {
    const pendingTx: Transaction = {
      id: 'tx-1',
      account_id: 'acc-1',
      amount: 250,
      date: '2999-01-01',
      status: 'pending',
    }

    transactionRepo.findById
      .mockResolvedValueOnce(pendingTx)
      .mockResolvedValueOnce({ ...pendingTx, status: 'posted', confirmed_at: 123 })
    accountRepo.findById.mockResolvedValue({
      id: 'acc-1',
      name: 'Cash',
      type: 'cash',
      balance: 100,
      currency: 'HUF',
      updated_at: 0,
    })

    const result = await service.confirmTransaction('tx-1')

    expect(accountRepo.updateBalance).toHaveBeenCalledWith('acc-1', 350, expect.any(Number))
    expect(transactionRepo.update).toHaveBeenCalledWith('tx-1', expect.objectContaining({
      status: 'posted',
      confirmed_at: expect.any(Number),
    }))
    expect(result.status).toBe('posted')
  })

  it('declining a pending transaction does not change the account balance', async () => {
    const pendingTx: Transaction = {
      id: 'tx-1',
      account_id: 'acc-1',
      amount: 250,
      date: '2999-01-01',
      status: 'pending',
    }

    transactionRepo.findById
      .mockResolvedValueOnce(pendingTx)
      .mockResolvedValueOnce({ ...pendingTx, status: 'cancelled', cancelled_at: 123 })

    const result = await service.declineTransaction('tx-1')

    expect(accountRepo.updateBalance).not.toHaveBeenCalled()
    expect(transactionRepo.update).toHaveBeenCalledWith('tx-1', expect.objectContaining({
      status: 'cancelled',
      cancelled_at: expect.any(Number),
    }))
    expect(result.status).toBe('cancelled')
  })
})
