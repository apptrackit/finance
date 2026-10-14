import type { SkeletonAccount as Account } from '../common/Skeleton'
import { Panel, Heading, Rows, Summary } from '../common/WidgetSkeletons'
import { Skeleton } from '../common/Skeleton'

export function InvestmentsSkeleton({ accounts }: { accounts?: Account[] }) {
  return <div className="space-y-6">
    <div className="flex justify-end gap-2"><Skeleton className="h-7 w-14 rounded-lg" /><Skeleton className="h-7 w-14 rounded-lg" /></div>
    <Summary kind="investments" />
    <Panel widget="holdings" className="overflow-hidden rounded-2xl"><div className="border-b border-border/50 p-4"><Heading /></div>
      <Rows count={accounts ? Math.max(1, accounts.filter(account => account.type === 'investment' && account.archived_at == null).length) : 3} holdings />
    </Panel>
  </div>
}
