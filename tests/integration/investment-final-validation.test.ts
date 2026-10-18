import { InvestmentTradeRepository } from '../../api/src/repositories/investment-trade.repository'
import { InvestmentTradeService } from '../../api/src/services/investment-trade.service'
import { TransferService } from '../../api/src/services/transfer.service'
import { AccountService } from '../../api/src/services/account.service'
import { RecurringScheduleService } from '../../api/src/services/recurring-schedule.service'
import { RecurringScheduleRepository } from '../../api/src/repositories/recurring-schedule.repository'
import { beforeEach, expect, it, vi } from 'vitest'
import { useFinanceWorkers } from './harness'
import { AccountRepository } from '../../api/src/repositories/account.repository'
import { TransactionRepository } from '../../api/src/repositories/transaction.repository'
import { InvestmentTransactionRepository } from '../../api/src/repositories/investment-transaction.repository'
import { TransactionService } from '../../api/src/services/transaction.service'
const f = useFinanceWorkers()
beforeEach(async () => {
  await f.seed()
  await f.db.batch([
    f.db.prepare(
      "INSERT INTO accounts(id,name,type,balance,currency,quote_currency,asset_type,pricing_method,unit,manual_price) VALUES('holding','Synthetic holding','investment',0,'SHARE','HUF','etf','manual','SHARE',100)",
    ),
    f.db.prepare(
      "INSERT INTO investment_position_anchors(id,account_id,kind,effective_date,balance,created_at,trade_order_boundary) VALUES('opening','holding','opening','2026-01-01',0,1,0)",
    ),
  ])
})
async function buy() {
  const r = await f.request('/investment-trades', 'POST', {
    idempotency_key: crypto.randomUUID(),
    holding_account_id: 'holding',
    cash_account_id: 'cash',
    type: 'buy',
    quantity: 1,
    price: 100,
    execution_currency: 'HUF',
    cash_amount: 100,
    fee_status: 'known',
    fee_amount: 0,
    date: '2026-01-10',
  })
  expect(r.status, await r.clone().text()).toBe(201)
}
function services() {
  const accounts = new AccountRepository(f.db),
    transactions = new TransactionRepository(f.db)
  return {
    accounts,
    transactions,
    service: new TransactionService(transactions, accounts, new InvestmentTransactionRepository(f.db)),
  }
}
async function balancesMatchLedger() {
  const cash = await f.db.prepare("SELECT balance FROM accounts WHERE id='cash'").first('balance'),
    sum = await f.db
      .prepare(
        "SELECT COALESCE(SUM(amount),0) AS n FROM transactions WHERE account_id='cash' AND status='posted'",
      )
      .first<number>('n')
  expect(cash).toBe(1000 + sum!)
}
it('keeps an interleaved linked purchase when ordinary cash creation read its balance first', async () => {
  const { accounts, service } = services(),
    read = accounts.findById.bind(accounts)
  vi.spyOn(accounts, 'findById').mockImplementationOnce(async (id) => {
    const before = await read(id)
    await buy()
    return before
  })
  await service.createTransaction({ account_id: 'cash', amount: 20, date: '2026-01-10' })
  await balancesMatchLedger()
})
it('rolls back an ordinary cash creation if its balance write fails', async () => {
  await f.db
    .prepare(
      "CREATE TRIGGER fail_cash_balance BEFORE UPDATE OF balance ON accounts WHEN NEW.id='cash' BEGIN SELECT RAISE(ABORT,'INJECTED_FAILURE'); END",
    )
    .run()
  const before = await f.balances(),
    revision = await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id=1').first('revision')
  const r = await f.request('/transactions', 'POST', { account_id: 'cash', amount: 20, date: '2026-01-10' })
  expect(r.status).toBe(500)
  expect(await f.balances()).toEqual(before)
  expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(0)
  expect(
    await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id=1').first('revision'),
  ).toBe(revision)
})

it.each(['edit', 'delete'] as const)(
  'preserves a concurrent linked purchase during ordinary cash %s',
  async (action) => {
    const r = await f.request('/transactions', 'POST', {
        account_id: 'cash',
        amount: -50,
        date: '2026-01-10',
      }),
      tx = (await r.json()) as { id: string }
    expect(r.status).toBe(201)
    const { accounts, service } = services(),
      read = accounts.findById.bind(accounts)
    vi.spyOn(accounts, 'findById').mockImplementationOnce(async (id) => {
      const before = await read(id)
      await buy()
      return before
    })
    if (action === 'edit') await service.updateTransaction(tx.id, { amount: -75 }, '2026-01-15')
    else await service.deleteTransaction(tx.id)
    await balancesMatchLedger()
  },
)
it.each(['create', 'edit', 'delete'] as const)(
  'preserves both ledgers when cash transfer %s overlaps a purchase',
  async (action) => {
    const { accounts, transactions, service } = services()
    const transfer = new TransferService(accounts, transactions, new InvestmentTransactionRepository(f.db))
    const body = {
      from_account_id: 'cash',
      to_account_id: 'savings',
      amount_from: 50,
      amount_to: 50,
      date: '2026-01-10',
    }
    const existing = action === 'create' ? null : await transfer.createTransfer(body)
    const read = accounts.findById.bind(accounts)
    vi.spyOn(accounts, 'findById').mockImplementationOnce(async (id) => {
      const before = await read(id)
      await buy()
      return before
    })
    if (action === 'create') await transfer.createTransfer(body)
    else if (action === 'edit')
      await service.updateTransaction(
        existing!.outgoing_transaction_id,
        { amount: 75, amount_to: 75 },
        '2026-01-15',
      )
    else await service.deleteTransaction(existing!.outgoing_transaction_id)
    await balancesMatchLedger()
    const sum = await f.db
      .prepare(
        "SELECT COALESCE(SUM(amount),0) AS n FROM transactions WHERE account_id='savings' AND status='posted'",
      )
      .first<number>('n')
    expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='savings'").first('balance')).toBe(
      200 + sum!,
    )
  },
)
it('rejects a cash correction made stale by a trade without inserting its adjustment', async () => {
  const { accounts, transactions } = services(),
    read = accounts.findById.bind(accounts)
  vi.spyOn(accounts, 'findById').mockImplementationOnce(async (id) => {
    const before = await read(id)
    await buy()
    return before
  })
  await expect(
    new AccountService(accounts, transactions).updateAccount(
      'cash',
      { balance: 1100, adjustWithTransaction: true },
      '2026-01-15',
    ),
  ).rejects.toMatchObject({ code: 'HISTORY_CHANGED', statusCode: 409 })
  await balancesMatchLedger()
  expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(1)
})
it('rolls back a cash correction, every split, audit and revision when a later split fails', async () => {
  const revision = await f.db
      .prepare('SELECT revision FROM financial_data_revision WHERE id=1')
      .first('revision'),
    before = await f.balances()
  await f.db
    .prepare(
      "CREATE TRIGGER fail_second_split BEFORE INSERT ON transactions WHEN NEW.description='Second' BEGIN SELECT RAISE(ABORT,'INJECTED_FAILURE'); END",
    )
    .run()
  const r = await f.request('/accounts/cash', 'PUT', {
    balance: 1100,
    adjustWithTransaction: true,
    splitTransactions: [
      { id: crypto.randomUUID(), category_id: 'food', amount: 50, description: 'First', date: '2026-01-10' },
      { id: crypto.randomUUID(), category_id: 'food', amount: 50, description: 'Second', date: '2026-01-10' },
    ],
  })
  expect(r.status).toBe(500)
  expect(await f.balances()).toEqual(before)
  expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(0)
  expect(await f.db.prepare('SELECT COUNT(*) AS n FROM audit_log').first('n')).toBe(0)
  expect(
    await f.db.prepare('SELECT revision FROM financial_data_revision WHERE id=1').first('revision'),
  ).toBe(revision)
})
it.each(['transaction', 'transfer'] as const)(
  'commits recurring %s with its occurrence once despite a concurrent trade and repeated execution',
  async (type) => {
    await f.db
      .prepare(
        "INSERT INTO recurring_schedules(id,type,frequency,account_id,to_account_id,category_id,amount,amount_to,is_active,created_at,remaining_occurrences) VALUES('schedule',?,'daily','cash',?,?,50,50,1,1,2)",
      )
      .bind(type, type === 'transfer' ? 'savings' : null, type === 'transaction' ? 'food' : null)
      .run()
    const { accounts, transactions } = services(),
      read = accounts.findById.bind(accounts)
    vi.spyOn(accounts, 'findById').mockImplementationOnce(async (id) => {
      const before = await read(id)
      await buy()
      return before
    })
    const schedule = new RecurringScheduleService(
      new RecurringScheduleRepository(f.db),
      transactions,
      accounts,
    )
    await Promise.all([schedule.processRecurringSchedules(), schedule.processRecurringSchedules()])
    await schedule.processRecurringSchedules()
    await balancesMatchLedger()
    expect(
      await f.db
        .prepare("SELECT remaining_occurrences FROM recurring_schedules WHERE id='schedule'")
        .first('remaining_occurrences'),
    ).toBe(1)
    expect(
      await f.db
        .prepare('SELECT COUNT(*) AS n FROM transactions WHERE linked_transaction_id IS NULL')
        .first('n'),
    ).toBe(type === 'transaction' ? 1 : 0)
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(
      type === 'transaction' ? 2 : 3,
    )
  },
)
it.each(['update', 'delete', 'transfer', 'recurrence'] as const)(
  'rolls back every ledger/balance/audit/occurrence on an injected %s failure',
  async (action) => {
    const { accounts, transactions, service } = services()
    const existing = await service.createTransaction({ account_id: 'cash', amount: -50, date: '2026-01-10' })
    if (action === 'recurrence')
      await f.db
        .prepare(
          "INSERT INTO recurring_schedules(id,type,frequency,account_id,category_id,amount,is_active,created_at,remaining_occurrences) VALUES('schedule','transaction','daily','cash','food',50,1,1,2)",
        )
        .run()
    const snapshot = async () =>
      Promise.all(
        ['accounts', 'transactions', 'audit_log', 'financial_data_revision', 'recurring_schedules'].map(
          async (t) => (await f.db.prepare(`SELECT rowid,* FROM ${t} ORDER BY rowid`).all()).results,
        ),
      )
    const before = await snapshot()
    const event = action === 'update' ? 'UPDATE' : action === 'delete' ? 'DELETE' : 'INSERT'
    await f.db
      .prepare(
        `CREATE TRIGGER fail_ledger BEFORE ${event} ON transactions BEGIN SELECT RAISE(ABORT,'INJECTED_FAILURE'); END`,
      )
      .run()
    if (action === 'recurrence')
      await new RecurringScheduleService(
        new RecurringScheduleRepository(f.db),
        transactions,
        accounts,
      ).processRecurringSchedules()
    else
      await expect(
        action === 'update'
          ? service.updateTransaction(existing.id, { amount: -75 }, '2026-01-15')
          : action === 'delete'
            ? service.deleteTransaction(existing.id)
            : new TransferService(
                accounts,
                transactions,
                new InvestmentTransactionRepository(f.db),
              ).createTransfer({
                from_account_id: 'cash',
                to_account_id: 'savings',
                amount_from: 50,
                amount_to: 50,
                date: '2026-01-10',
              }),
      ).rejects.toThrow('INJECTED_FAILURE')
    expect(await snapshot()).toEqual(before)
  },
)
it('replans a trade when an ordinary cash mutation commits after the trade snapshot', async () => {
  const repo = new InvestmentTradeRepository(f.db),
    state = repo.state.bind(repo)
  vi.spyOn(repo, 'state').mockImplementationOnce(async (ids) => {
    const before = await state(ids)
    expect(
      (await f.request('/transactions', 'POST', { account_id: 'cash', amount: 20, date: '2026-01-10' }))
        .status,
    ).toBe(201)
    return before
  })
  await new InvestmentTradeService(repo).save(
    {
      idempotency_key: crypto.randomUUID(),
      holding_account_id: 'holding',
      cash_account_id: 'cash',
      type: 'buy',
      quantity: 1,
      price: 100,
      execution_currency: 'HUF',
      cash_amount: 100,
      fee_status: 'known',
      fee_amount: 0,
      date: '2026-01-10',
    },
    '2026-01-15',
  )
  await balancesMatchLedger()
  expect(await f.db.prepare('SELECT COUNT(*) AS n FROM investment_trade_operations').first('n')).toBe(1)
})
it('rejects a stale browser cash correction and changed lock before any ledger write', async () => {
  await buy()
  expect(
    (
      await f.request('/accounts/cash', 'PUT', {
        balance: 1100,
        expected_balance: 1000,
        expected_updated_at: 1,
        adjustWithTransaction: true,
      })
    ).status,
  ).toBe(409)
  const { accounts, service } = services(),
    read = accounts.findById.bind(accounts)
  vi.spyOn(accounts, 'findById').mockImplementationOnce(async (id) => {
    const before = await read(id)
    await f.db.prepare("UPDATE accounts SET is_locked=1 WHERE id='cash'").run()
    return before
  })
  await expect(
    service.createTransaction({ account_id: 'cash', amount: 20, date: '2026-01-10' }),
  ).rejects.toMatchObject({ code: 'HISTORY_CHANGED' })
  await balancesMatchLedger()
  expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(1)
})
it('retains the ordinary credit-account ledger path through creation, edit and deletion', async () => {
  await f.db
    .prepare(
      "INSERT INTO accounts(id,name,type,balance,currency,updated_at) VALUES('credit','Credit','credit',-100,'HUF',1)",
    )
    .run()
  const r = await f.request('/transactions', 'POST', {
      account_id: 'credit',
      amount: -50,
      date: '2026-01-10',
    }),
    tx = (await r.json()) as { id: string }
  expect(r.status).toBe(201)
  expect((await f.request(`/transactions/${tx.id}`, 'PUT', { amount: -75 })).status).toBe(200)
  expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='credit'").first('balance')).toBe(-175)
  expect((await f.request(`/transactions/${tx.id}`, 'DELETE')).status).toBe(200)
  expect(await f.db.prepare("SELECT balance FROM accounts WHERE id='credit'").first('balance')).toBe(-100)
})
it('refuses a stale pending confirmation after the cash amount was edited', async () => {
  const r = await f.request('/transactions', 'POST', {
      account_id: 'cash',
      amount: 20,
      status: 'pending',
      date: '2026-01-10',
    }),
    tx = (await r.json()) as { id: string }
  const { accounts, service } = services(),
    read = accounts.findById.bind(accounts)
  vi.spyOn(accounts, 'findById').mockImplementationOnce(async (id) => {
    const before = await read(id)
    expect((await f.request(`/transactions/${tx.id}`, 'PUT', { amount: 30 })).status).toBe(200)
    return before
  })
  await expect(service.confirmTransaction(tx.id, '2026-01-15')).rejects.toThrow()
  await balancesMatchLedger()
  expect((await f.request(`/transactions/${tx.id}/confirm`, 'POST')).status).toBe(200)
  await balancesMatchLedger()
})
it('refuses a stale pending decline when confirmation won the race', async () => {
  const r = await f.request('/transactions', 'POST', {
      account_id: 'cash',
      amount: 20,
      status: 'pending',
      date: '2026-01-10',
    }),
    tx = (await r.json()) as { id: string }
  const { accounts, service } = services(),
    read = accounts.findById.bind(accounts)
  vi.spyOn(accounts, 'findById').mockImplementationOnce(async (id) => {
    const before = await read(id)
    expect((await f.request(`/transactions/${tx.id}/confirm`, 'POST')).status).toBe(200)
    return before
  })
  await expect(service.declineTransaction(tx.id)).rejects.toThrow()
  await balancesMatchLedger()
  expect(await f.db.prepare('SELECT status FROM transactions WHERE id=?').bind(tx.id).first('status')).toBe(
    'posted',
  )
})
