import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RecurringScheduleService } from '../../api/src/services/recurring-schedule.service'
import { RecurringScheduleRepository } from '../../api/src/repositories/recurring-schedule.repository'
import { TransactionRepository } from '../../api/src/repositories/transaction.repository'
import { AccountRepository } from '../../api/src/repositories/account.repository'
import { useFinanceWorkers } from './harness'

const f = useFinanceWorkers()
beforeEach(() => f.seed())
afterEach(() => vi.useRealTimers())

function scheduler() {
  return new RecurringScheduleService(new RecurringScheduleRepository(f.db),
    new TransactionRepository(f.db), new AccountRepository(f.db))
}

async function processOn(date: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${date}T12:00:00Z`))
  await scheduler().processRecurringSchedules()
}

it('persists the selected month on create, reload and partial edits, and uses it in MCP projections', async () => {
  const response = await f.request('/recurring-schedules', 'POST', {
    type: 'transaction', frequency: 'yearly', month: 6, day_of_month: 31,
    account_id: 'cash', category_id: 'food', amount: -25,
  })
  expect(response.status).toBe(201)
  const created = await response.json() as { id: string; month: number }
  expect(created.month).toBe(6)
  await f.db.prepare('UPDATE recurring_schedules SET created_at = ? WHERE id = ?')
    .bind(Date.UTC(2026, 2, 1), created.id).run()
  expect(await (await f.request(`/recurring-schedules/${created.id}`)).json()).toMatchObject({ month: 6 })
  expect(await (await f.request('/recurring-schedules')).json()).toEqual([expect.objectContaining({ month: 6 })])
  const forecast = await f.tool<{ occurrences: { date: string }[]; warnings: string[] }>('get_recurring_forecast', {
    currency: 'HUF', start_date: '2026-03-01', end_date: '2026-12-31',
  })
  expect(forecast.occurrences.map(item => item.date)).toEqual(['2026-07-31'])
  expect(forecast.warnings).toEqual([])
  const updated = await f.request(`/recurring-schedules/${created.id}`, 'PUT', { month: 0 })
  expect(updated.status).toBe(200)
  expect(await updated.json()).toMatchObject({ month: 0 })
  expect(await f.tool('get_recurring_forecast', {
    currency: 'HUF', start_date: '2026-03-01', end_date: '2027-02-01',
  })).toMatchObject({ occurrences: [{ date: '2027-01-31' }] })
  for (const month of [-1, 12, 1.5, null]) {
    expect((await f.request(`/recurring-schedules/${created.id}`, 'PUT', { month })).status).toBe(400)
    expect((await f.request('/recurring-schedules', 'POST', {
      type: 'transaction', frequency: 'yearly', month, day_of_month: 31,
      account_id: 'cash', category_id: 'food', amount: -25,
    })).status).toBe(400)
  }
  await f.request(`/recurring-schedules/${created.id}`, 'PUT', { description: 'Keep January' })
  expect(await f.db.prepare('SELECT month FROM recurring_schedules WHERE id = ?').bind(created.id).first('month')).toBe(0)
  expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
})

it('executes in the selected month only, skips locked accounts and posts linked transfers once', async () => {
  await f.db.prepare(`INSERT INTO recurring_schedules
    (id, type, frequency, day_of_month, month, account_id, to_account_id, amount, amount_to, created_at, remaining_occurrences)
    VALUES ('yearly-transfer', 'transfer', 'yearly', 31, 6, 'cash', 'savings', 100, 100, ?, 2)`)
    .bind(Date.UTC(2026, 2, 1)).run()
  await processOn('2026-03-31')
  await processOn('2026-07-30')
  expect(await f.db.prepare('SELECT COUNT(*) AS count FROM transactions').first('count')).toBe(0)
  await f.db.prepare("UPDATE accounts SET is_locked = 1 WHERE id = 'savings'").run()
  await processOn('2026-07-31')
  expect(await f.db.prepare("SELECT remaining_occurrences, last_processed_date FROM recurring_schedules").first())
    .toEqual({ remaining_occurrences: 2, last_processed_date: null })
  expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 200 }])
  await f.db.prepare("UPDATE accounts SET is_locked = 0 WHERE id = 'savings'").run()
  await processOn('2026-07-31')
  await processOn('2026-07-31')
  const rows = (await f.db.prepare('SELECT id, linked_transaction_id, amount, date FROM transactions ORDER BY amount').all()).results
  expect(rows).toEqual([
    { id: expect.any(String), linked_transaction_id: expect.any(String), amount: -100, date: '2026-07-31' },
    { id: expect.any(String), linked_transaction_id: expect.any(String), amount: 100, date: '2026-07-31' },
  ])
  expect(rows[0].linked_transaction_id).toBe(rows[1].id)
  expect(rows[1].linked_transaction_id).toBe(rows[0].id)
  expect(await f.balances()).toEqual([{ id: 'cash', balance: 900 }, { id: 'savings', balance: 300 }])
  expect(await f.db.prepare('SELECT remaining_occurrences, last_processed_date, is_active FROM recurring_schedules').first())
    .toEqual({ remaining_occurrences: 1, last_processed_date: '2026-07-31', is_active: 1 })
})

it('returns a null legacy month and projects the creation month until an explicit edit', async () => {
  await f.db.prepare(`INSERT INTO recurring_schedules
    (id, type, frequency, day_of_month, account_id, category_id, amount, created_at)
    VALUES ('legacy-yearly', 'transaction', 'yearly', 31, 'cash', 'food', -25, ?)`)
    .bind(Date.UTC(2026, 2, 1)).run()
  expect(await (await f.request('/recurring-schedules/legacy-yearly')).json()).toMatchObject({ month: null })
  const period = { currency: 'HUF', start_date: '2026-03-01', end_date: '2026-12-31' }
  expect(await f.tool('get_recurring_forecast', period)).toMatchObject({ occurrences: [{ date: '2026-03-31' }], warnings: [] })
  await f.request('/recurring-schedules/legacy-yearly', 'PUT', { description: 'Legacy month unchanged' })
  expect(await f.db.prepare("SELECT month FROM recurring_schedules WHERE id = 'legacy-yearly'").first('month')).toBeNull()
  expect((await f.request('/recurring-schedules/legacy-yearly', 'PUT', { month: 6 })).status).toBe(200)
  expect(await f.tool('get_recurring_forecast', period)).toMatchObject({ occurrences: [{ date: '2026-07-31' }], warnings: [] })
})

it('clamps yearly month ends including leap years, honors limits and end dates, and preserves legacy months', async () => {
  await f.db.batch([
    f.db.prepare(`INSERT INTO recurring_schedules
      (id, type, frequency, day_of_month, month, account_id, category_id, amount, created_at, remaining_occurrences)
      VALUES ('february', 'transaction', 'yearly', 31, 1, 'cash', 'food', -25, ?, 2)`)
      .bind(Date.UTC(2025, 2, 1)),
    f.db.prepare(`INSERT INTO recurring_schedules
      (id, type, frequency, day_of_month, month, account_id, category_id, amount, created_at, end_date)
      VALUES ('expired', 'transaction', 'yearly', 31, 1, 'cash', 'food', -99, ?, '2026-02-27')`)
      .bind(Date.UTC(2025, 2, 1)),
    f.db.prepare(`INSERT INTO recurring_schedules
      (id, type, frequency, day_of_month, account_id, category_id, amount, created_at, remaining_occurrences)
      VALUES ('legacy', 'transaction', 'yearly', 31, 'cash', 'food', -10, ?, 1)`)
      .bind(Date.UTC(2026, 2, 1)),
  ])
  await processOn('2026-02-28')
  await processOn('2026-03-31')
  await processOn('2028-02-28')
  await processOn('2028-02-29')
  await processOn('2029-02-28')
  expect((await f.db.prepare('SELECT amount, date FROM transactions ORDER BY date').all()).results)
    .toEqual([{ amount: -25, date: '2026-02-28' }, { amount: -10, date: '2026-03-31' }, { amount: -25, date: '2028-02-29' }])
  expect(await f.balances()).toEqual([{ id: 'cash', balance: 940 }, { id: 'savings', balance: 200 }])
  expect((await f.db.prepare('SELECT id, is_active FROM recurring_schedules ORDER BY id').all()).results)
    .toEqual([{ id: 'expired', is_active: 0 }, { id: 'february', is_active: 0 }, { id: 'legacy', is_active: 0 }])
})

it('the real Worker cron uses the stored month instead of the creation month', async () => {
  const today = new Date()
  const month = today.getUTCMonth()
  const created = Date.UTC(today.getUTCFullYear() - 1, (month + 1) % 12, 1)
  await f.db.prepare(`INSERT INTO recurring_schedules
    (id, type, frequency, day_of_month, month, account_id, category_id, amount, created_at)
    VALUES ('cron-yearly', 'transaction', 'yearly', ?, ?, 'cash', 'food', -25, ?)`)
    .bind(today.getUTCDate(), month, created).run()
  await f.api.scheduled({ cron: '0 0 * * *' })
  await f.api.scheduled({ cron: '0 0 * * *' })
  expect(await f.db.prepare('SELECT amount, date FROM transactions').first())
    .toEqual({ amount: -25, date: today.toISOString().slice(0, 10) })
  expect(await f.balances()).toEqual([{ id: 'cash', balance: 975 }, { id: 'savings', balance: 200 }])
})
