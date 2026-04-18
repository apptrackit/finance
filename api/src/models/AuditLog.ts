export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE'
export type AuditEntity = 'account' | 'transaction' | 'category' | 'budget' | 'recurring_schedule' | 'investment_transaction'

export interface AuditLog {
  id: string
  action: AuditAction
  entity: AuditEntity
  entity_id: string
  details?: string
  created_at: number
}
