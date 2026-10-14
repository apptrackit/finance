import { cn } from '../../lib/utils'

export type SkeletonAccount = {
  type: string
  archived_at?: number | null
  exclude_from_cash_balance?: boolean
}

/** Decorative placeholders; the containing loading status supplies the accessible label. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('finance-skeleton relative rounded-md', className)} />
}
