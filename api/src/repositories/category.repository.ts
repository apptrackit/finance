import { Category } from '../models/Category'

export class CategoryRepository {
  constructor(private db: D1Database) {}

  async findAll(): Promise<Category[]> {
    const { results } = await this.db.prepare('SELECT * FROM categories').all<Category>()
    return results
  }

  async findById(id: string): Promise<Category | null> {
    return await this.db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first<Category>()
  }

  async findByName(name: string): Promise<Category | null> {
    return await this.db.prepare('SELECT * FROM categories WHERE name = ?').bind(name).first<Category>()
  }

  async findByNameExcludingId(name: string, excludeId: string): Promise<Category | null> {
    return await this.db.prepare('SELECT * FROM categories WHERE name = ? AND id != ?')
      .bind(name, excludeId).first<Category>()
  }

  async create(category: Category): Promise<void> {
    await this.db.prepare(
      'INSERT INTO categories (id, name, type, icon) VALUES (?, ?, ?, ?)'
    ).bind(category.id, category.name, category.type, category.icon || '📌').run()
  }

  async batchCreate(categories: Category[]): Promise<void> {
    const stmt = this.db.prepare('INSERT INTO categories (id, name, type, icon) VALUES (?, ?, ?, ?)')
    await this.db.batch(categories.map(c => stmt.bind(c.id, c.name, c.type, c.icon)))
  }

  async update(id: string, updates: Partial<Omit<Category, 'id'>>): Promise<void> {
    const fields: string[] = []
    const values: any[] = []

    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.type !== undefined) {
      fields.push('type = ?')
      values.push(updates.type)
    }
    if (updates.icon !== undefined) {
      fields.push('icon = ?')
      values.push(updates.icon)
    }

    values.push(id)

    await this.db.prepare(
      `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values).run()
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run()
  }

  async deleteAll(): Promise<void> {
    await this.db.prepare('DELETE FROM categories').run()
  }

  async countUsageInTransactions(id: string): Promise<number> {
    const { results } = await this.db.prepare(
      'SELECT COUNT(*) as count FROM transactions WHERE category_id = ?'
    ).bind(id).all<{ count: number }>()
    return results[0]?.count || 0
  }
}
