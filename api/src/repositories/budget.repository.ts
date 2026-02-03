import { Budget } from '../models/Budget'

export class BudgetRepository {
  constructor(private db: D1Database) {}

  async findAll(): Promise<Budget[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM budgets ORDER BY created_at DESC')
      .all<Budget>()

    const budgets = await Promise.all(
      results.map(async (budget) => ({
        ...budget,
        account_ids: await this.getBudgetAccounts(budget.id),
        category_ids: await this.getBudgetCategories(budget.id)
      }))
    )

    return budgets
  }

  async findById(id: string): Promise<Budget | null> {
    const budget = await this.db
      .prepare('SELECT * FROM budgets WHERE id = ?')
      .bind(id)
      .first<Budget>()

    if (!budget) return null

    return {
      ...budget,
      account_ids: await this.getBudgetAccounts(id),
      category_ids: await this.getBudgetCategories(id)
    }
  }

  async create(budget: Budget): Promise<void> {
    await this.db.prepare(
      `INSERT INTO budgets 
        (id, name, amount, period, start_date, end_date, account_scope, category_scope, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      budget.id,
      budget.name ?? null,
      budget.amount,
      budget.period,
      budget.start_date,
      budget.end_date,
      budget.account_scope,
      budget.category_scope,
      budget.currency ?? null,
      budget.created_at,
      budget.updated_at
    ).run()

    if (budget.account_ids?.length) {
      await this.setBudgetAccounts(budget.id, budget.account_ids)
    }

    if (budget.category_ids?.length) {
      await this.setBudgetCategories(budget.id, budget.category_ids)
    }
  }

  async update(id: string, updates: Partial<Budget>): Promise<void> {
    const fields: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name ?? null)
    }
    if (updates.amount !== undefined) {
      fields.push('amount = ?')
      values.push(updates.amount)
    }
    if (updates.period !== undefined) {
      fields.push('period = ?')
      values.push(updates.period)
    }
    if (updates.start_date !== undefined) {
      fields.push('start_date = ?')
      values.push(updates.start_date)
    }
    if (updates.end_date !== undefined) {
      fields.push('end_date = ?')
      values.push(updates.end_date)
    }
    if (updates.account_scope !== undefined) {
      fields.push('account_scope = ?')
      values.push(updates.account_scope)
    }
    if (updates.category_scope !== undefined) {
      fields.push('category_scope = ?')
      values.push(updates.category_scope)
    }
    if (updates.currency !== undefined) {
      fields.push('currency = ?')
      values.push(updates.currency ?? null)
    }
    if (updates.updated_at !== undefined) {
      fields.push('updated_at = ?')
      values.push(updates.updated_at)
    }

    if (fields.length > 0) {
      values.push(id)
      await this.db.prepare(
        `UPDATE budgets SET ${fields.join(', ')} WHERE id = ?`
      ).bind(...values).run()
    }

    if (updates.account_ids !== undefined) {
      await this.setBudgetAccounts(id, updates.account_ids)
    }

    if (updates.category_ids !== undefined) {
      await this.setBudgetCategories(id, updates.category_ids)
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM budgets WHERE id = ?').bind(id).run()
  }

  private async getBudgetAccounts(budgetId: string): Promise<string[]> {
    const { results } = await this.db
      .prepare('SELECT account_id FROM budget_accounts WHERE budget_id = ?')
      .bind(budgetId)
      .all<{ account_id: string }>()

    return results.map(r => r.account_id)
  }

  private async getBudgetCategories(budgetId: string): Promise<string[]> {
    const { results } = await this.db
      .prepare('SELECT category_id FROM budget_categories WHERE budget_id = ?')
      .bind(budgetId)
      .all<{ category_id: string }>()

    return results.map(r => r.category_id)
  }

  private async setBudgetAccounts(budgetId: string, accountIds: string[]) {
    await this.db.prepare('DELETE FROM budget_accounts WHERE budget_id = ?')
      .bind(budgetId)
      .run()

    if (accountIds.length === 0) return

    const statements = accountIds.map(accountId =>
      this.db
        .prepare('INSERT INTO budget_accounts (budget_id, account_id) VALUES (?, ?)')
        .bind(budgetId, accountId)
    )
    await this.db.batch(statements)
  }

  private async setBudgetCategories(budgetId: string, categoryIds: string[]) {
    await this.db.prepare('DELETE FROM budget_categories WHERE budget_id = ?')
      .bind(budgetId)
      .run()

    if (categoryIds.length === 0) return

    const statements = categoryIds.map(categoryId =>
      this.db
        .prepare('INSERT INTO budget_categories (budget_id, category_id) VALUES (?, ?)')
        .bind(budgetId, categoryId)
    )
    await this.db.batch(statements)
  }
}
