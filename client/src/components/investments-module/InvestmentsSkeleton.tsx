import type { SkeletonAccount as Account } from '../common/Skeleton'
import { Panel, Heading, Rows } from '../common/WidgetSkeletons'
import { Skeleton } from '../common/Skeleton'

export function InvestmentsSkeleton({ accounts }: { accounts?: Account[] }) {
  return <div className="@container space-y-4">
    <div className="flex justify-end gap-2"><Skeleton className="h-7 w-14 rounded-lg" /><Skeleton className="h-7 w-14 rounded-lg" /></div>
    <div className="grid gap-4 @min-[900px]:grid-cols-[minmax(0,1fr)_320px]">
      <Panel widget="portfolio-history" className="space-y-4 p-5"><Heading/><Skeleton className="h-9 w-48"/><Skeleton className="h-64 w-full rounded-lg"/><Skeleton className="h-3 w-40"/></Panel>
      <div className="space-y-4"><Panel widget="summary-cards" className="space-y-4 p-5">{[0,1,2].map(i=><div key={i} className="space-y-2"><Skeleton className="h-3 w-24"/><Skeleton className="h-7 w-36"/></div>)}</Panel><Panel widget="allocation" className="space-y-4 p-5"><Heading/><Skeleton className="h-2 w-full"/><Rows count={2}/></Panel></div>
    </div>
    <Panel widget="holdings" className="overflow-hidden rounded-2xl"><div className="border-b border-border/50 p-4"><Heading /></div>
      <Rows count={accounts ? Math.max(1, accounts.filter(account => account.type === 'investment' && account.archived_at == null).length) : 3} holdings />
    </Panel>
  </div>
}
