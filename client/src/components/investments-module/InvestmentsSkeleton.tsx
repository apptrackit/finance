import type { SkeletonAccount as Account } from '../common/Skeleton'
import { Panel, Heading, Rows } from '../common/WidgetSkeletons'
import { Skeleton } from '../common/Skeleton'

export function InvestmentsSkeleton({ accounts }: { accounts?: Account[] }) {
  return <div className="@container space-y-4">
    <div className="flex justify-end gap-2"><Skeleton className="h-7 w-14 rounded-lg" /><Skeleton className="h-7 w-14 rounded-lg" /></div>
    <Panel widget="summary-cards" className="grid grid-cols-2 gap-4 p-4 @min-[640px]:grid-cols-3">{[0,1,2].map(i=><div key={i} className="min-w-0 space-y-2 first:col-span-2 @min-[640px]:first:col-span-1"><Skeleton className="h-3 w-24"/><Skeleton className="h-8 w-36 max-w-full"/></div>)}</Panel>
    <Panel widget="portfolio-history" className="space-y-3 p-5"><Heading/><Skeleton className="h-9 w-48"/><Skeleton className="h-[220px] w-full rounded-lg @min-[640px]:h-[300px]"/><Skeleton className="h-3 w-40"/></Panel>
    <Panel widget="allocation" className="space-y-4 p-5"><Heading/><Skeleton className="h-2 w-full"/><div className="grid gap-2 @min-[560px]:grid-cols-2 @min-[1000px]:grid-cols-4">{[0,1,2,3].map(i=><Skeleton key={i} className="h-16 w-full rounded-lg"/>)}</div></Panel>
    <Panel widget="holdings" className="overflow-hidden rounded-2xl"><div className="border-b border-border/50 p-4"><Heading /></div>
      <Rows count={accounts ? Math.max(1, accounts.filter(account => account.type === 'investment' && account.archived_at == null).length) : 3} holdings />
    </Panel>
  </div>
}
