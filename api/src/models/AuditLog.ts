export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE'
export type AuditEntity = 'account' | 'transaction' | 'category' | 'recurring_schedule' | 'investment_transaction' | 'financial_outlook_snapshot'

export interface AuditLog {
  id: string
  action: AuditAction
  entity: AuditEntity
  entity_id: string
  details?: string
  created_at: number
}
