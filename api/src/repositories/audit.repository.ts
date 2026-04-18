import { AuditLog, AuditAction, AuditEntity } from '../models/AuditLog'

export class AuditRepository {
  constructor(private db: D1Database) {}

  async log(action: AuditAction, entity: AuditEntity, entityId: string, details?: Record<string, unknown>): Promise<void> {
    const entry: AuditLog = {
      id: crypto.randomUUID(),
      action,
      entity,
      entity_id: entityId,
      details: details ? JSON.stringify(details) : undefined,
      created_at: Date.now()
    }

    await this.db.prepare(
      'INSERT INTO audit_log (id, action, entity, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      entry.id,
      entry.action,
      entry.entity,
      entry.entity_id,
      entry.details ?? null,
      entry.created_at
    ).run()
  }

  async findByEntity(entity: AuditEntity, entityId: string): Promise<AuditLog[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY created_at DESC')
      .bind(entity, entityId)
      .all<AuditLog>()
    return results
  }

  async findRecent(limit = 50): Promise<AuditLog[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?')
      .bind(limit)
      .all<AuditLog>()
    return results
  }
}
