import { AppSetting } from '../models/AppSetting'

export class SettingsRepository {
  constructor(private db: D1Database) {}

  async findByKey(key: string): Promise<AppSetting | null> {
    return await this.db
      .prepare('SELECT * FROM app_settings WHERE key = ?')
      .bind(key)
      .first<AppSetting>()
  }

  async upsert(key: string, value: string, updatedAt: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`
      )
      .bind(key, value, updatedAt)
      .run()
  }
}
