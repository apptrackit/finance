import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceWorkers } from './harness'

type Line = { id: string; account_id: string; category_id: string | null; amount: number; description: string | null; date: string; split_id: string; split_description: string | null; status: string }
type Split = { id: string; description: string | null; account_id: string; date: string; total: number; lines: Line[] }

const f = useFinanceWorkers()
const lines = [
  { category_id: 'food', amount: -300, note: 'Bread' },
  { category_id: 'food', amount: -200 },
]
const payload = (overrides = {}) => ({ account_id: 'cash', date: '2026-01-15', description: 'Spar', lines, ...overrides })

async function cashBalance(id = 'cash') {
  return f.db.prepare('SELECT balance FROM accounts WHERE id = ?').bind(id).first<number>('balance')
}
async function createSplit(overrides = {}) {
  const response = await f.request('/transactions/splits', 'POST', payload(overrides))
  expect(response.status, await response.clone().text()).toBe(201)
  return response.json() as Promise<Split>
}

describe('transaction splits against real D1', () => {
  beforeEach(() => f.seed())

  it('creates the split, every line, the audit entry and one balance change together', async () => {
    const revision = await f.db.prepare('SELECT revision FROM financial_data_revision').first<number>('revision')
    const split = await createSplit()
    expect(split).toMatchObject({ description: 'Spar', account_id: 'cash', date: '2026-01-15', total: -500 })
    expect(split.lines).toHaveLength(2)
    expect(split.lines.every(line => line.split_id === split.id && line.status === 'posted')).toBe(true)
    expect(await cashBalance()).toBe(500)
    expect(await f.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'transaction_split' AND entity_id = ?").bind(split.id).first('n')).toBe(1)
    expect(await f.db.prepare('SELECT revision FROM financial_data_revision').first<number>('revision')).toBeGreaterThan(revision!)
    // Lines are ordinary posted rows; the list also exposes the shared description.
    const listed = await (await f.request('/transactions')).json() as Line[]
    expect(listed).toHaveLength(2)
    expect(listed).toContainEqual(expect.objectContaining({ split_id: split.id, split_description: 'Spar', description: 'Bread' }))
    const history = await (await f.request('/transactions/history?limit=10')).json() as { transactions: Line[] }
    expect(history.transactions).toContainEqual(expect.objectContaining({ split_id: split.id, split_description: 'Spar' }))
  })

  it('rejects invalid payloads, future dates, locked, archived and investment accounts without side effects', async () => {
    await f.db.batch([
      f.db.prepare("INSERT INTO accounts (id, name, type, balance, currency, updated_at, is_locked) VALUES ('locked', 'Vault', 'cash', 100, 'HUF', 1, 1)"),
      f.db.prepare("INSERT INTO accounts (id, name, type, balance, currency, updated_at) VALUES ('stock', 'Stock', 'investment', 0, 'SHARE', 1)"),
    ])
    const before = await f.balances()
    const cases: [object, number][] = [
      [{ lines: [lines[0]] }, 400],
      [{ lines: [lines[0], { category_id: 'food', amount: 200 }] }, 400],
      [{ lines: [lines[0], { category_id: 'food', amount: 0 }] }, 400],
      [{ date: '2026-02-01' }, 400],
      [{ account_id: 'locked' }, 409],
      [{ account_id: 'stock' }, 400],
      [{ account_id: 'missing' }, 404],
    ]
    for (const [overrides, status] of cases) {
      expect((await f.request('/transactions/splits', 'POST', payload(overrides))).status, JSON.stringify(overrides)).toBe(status)
    }
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(0)
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transaction_splits').first('n')).toBe(0)
    expect(await f.balances()).toEqual(before)
  })

  it('applies a balance adjustment only when the expected balance still matches', async () => {
    const adjustment = (expected: number) => ({ balance_adjustment: { expected_balance: expected, new_balance: expected - 500 } })
    expect((await f.request('/transactions/splits', 'POST', payload(adjustment(999)))).status).toBe(409)
    expect(await cashBalance()).toBe(1000)
    expect((await f.request('/transactions/splits', 'POST', payload({ balance_adjustment: { expected_balance: 1000, new_balance: 400 } }))).status).toBe(400)
    await createSplit(adjustment(1000))
    expect(await cashBalance()).toBe(500)
  })

  it('replaces lines and shared fields, moves the balance between accounts, and keeps the split row', async () => {
    const split = await createSplit()
    const response = await f.request(`/transactions/splits/${split.id}`, 'PUT', payload({
      account_id: 'savings', date: '2026-01-10', description: 'Müller',
      lines: [{ category_id: 'food', amount: -50 }, { category_id: null, amount: -25, note: 'Vitamins' }, { category_id: 'food', amount: -25 }],
    }))
    expect(response.status, await response.clone().text()).toBe(200)
    const updated = await response.json() as Split
    expect(updated).toMatchObject({ id: split.id, description: 'Müller', account_id: 'savings', date: '2026-01-10', total: -100 })
    expect(updated.lines).toHaveLength(3)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 1000 }, { id: 'savings', balance: 100 }])
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(3)
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transaction_splits').first('n')).toBe(1)
    expect(await f.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity = 'transaction_split' AND action = 'UPDATE'").first('n')).toBe(1)
  })

  it('turns a split back into an ordinary transaction when one line is left', async () => {
    const split = await createSplit()
    const response = await f.request(`/transactions/splits/${split.id}`, 'PUT', payload({ lines: [{ category_id: 'food', amount: -120 }] }))
    expect(response.status, await response.clone().text()).toBe(200)
    expect(await f.balances()).toEqual([{ id: 'cash', balance: 880 }, { id: 'savings', balance: 200 }])
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transaction_splits').first('n')).toBe(0)
    expect(await f.db.prepare('SELECT amount, description, split_id FROM transactions').all()).toMatchObject({ results: [{ amount: -120, description: 'Spar', split_id: null }] })
    // Creating a split still needs at least two lines.
    expect((await f.request('/transactions/splits', 'POST', payload({ lines: [lines[0]] }))).status).toBe(400)
  })

  it('deletes every line once, reverts the balance and removes the split row; repeats are not found', async () => {
    const split = await createSplit()
    expect((await f.request(`/transactions/splits/${split.id}`, 'DELETE')).status).toBe(200)
    expect(await cashBalance()).toBe(1000)
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(0)
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transaction_splits').first('n')).toBe(0)
    expect((await f.request(`/transactions/splits/${split.id}`, 'DELETE')).status).toBe(404)
    expect((await f.request(`/transactions/splits/${split.id}`, 'PUT', payload())).status).toBe(404)
    expect(await cashBalance()).toBe(1000)
  })

  it('applies concurrent deletes once', async () => {
    const split = await createSplit()
    const responses = await Promise.all([1, 2, 3].map(() => f.request(`/transactions/splits/${split.id}`, 'DELETE')))
    expect(responses.filter(response => response.status === 200).length).toBe(1)
    expect(await cashBalance()).toBe(1000)
  })

  it('blocks changes to a split through a locked account', async () => {
    const split = await createSplit()
    await f.db.prepare("UPDATE accounts SET is_locked = 1 WHERE id = 'cash'").run()
    expect((await f.request(`/transactions/splits/${split.id}`, 'PUT', payload())).status).toBe(409)
    expect((await f.request(`/transactions/splits/${split.id}`, 'DELETE')).status).toBe(409)
    expect(await cashBalance()).toBe(500)
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transactions').first('n')).toBe(2)
  })

  it('refuses to edit, delete, confirm or decline a single split line', async () => {
    const split = await createSplit()
    const id = split.lines[0].id
    for (const [path, method, body] of [
      [`/transactions/${id}`, 'PUT', { amount: -1 }], [`/transactions/${id}`, 'DELETE', undefined],
      [`/transactions/${id}/confirm`, 'POST', undefined], [`/transactions/${id}/decline`, 'POST', undefined],
    ] as const) {
      const response = await f.request(path, method, body)
      expect(response.status, `${method} ${path}`).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'SPLIT_LINE_EDIT' })
    }
    expect(await cashBalance()).toBe(500)
  })

  it('enforces the database split invariants and cleans up when the last line goes', async () => {
    const split = await createSplit()
    const insert = (id: string, account: string, date: string, linked?: string) => f.db.prepare(
      `INSERT INTO transactions (id, account_id, amount, date, status, split_id, linked_transaction_id) VALUES (?, ?, -1, ?, 'posted', ?, ?)`)
      .bind(id, account, date, split.id, linked ?? null)
    await expect(insert('x1', 'savings', '2026-01-15').run()).rejects.toThrow(/SPLIT_MISMATCH/)
    await expect(insert('x2', 'cash', '2026-01-14').run()).rejects.toThrow(/SPLIT_MISMATCH/)
    await expect(insert('x3', 'cash', '2026-01-15', 'other').run()).rejects.toThrow(/SPLIT_TRANSFER/)
    await f.db.prepare('DELETE FROM transactions WHERE split_id = ?').bind(split.id).run()
    expect(await f.db.prepare('SELECT COUNT(*) AS n FROM transaction_splits').first('n')).toBe(0)
  })

  it('exports splits with their lines', async () => {
    const split = await createSplit()
    const exported = await (await f.request('/export')).json() as { data: { transaction_splits: { id: string }[]; transactions: { split_id: string | null }[] } }
    expect(exported.data.transaction_splits).toEqual([expect.objectContaining({ id: split.id, description: 'Spar' })])
    expect(exported.data.transactions.every(row => row.split_id === split.id)).toBe(true)
  })
})
