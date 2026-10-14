import type { SkeletonAccount as Account } from '../common/Skeleton'
import { Panel, Heading, Rows, Summary } from '../common/WidgetSkeletons'
import { Skeleton } from '../common/Skeleton'

export function DashboardSkeleton({ accounts, calendar }: { accounts?: Account[]; calendar: boolean }) {
  return <div className="space-y-4 sm:space-y-6">
    <Summary kind="dashboard" count={accounts?.some(account => account.type === 'investment') ? 4 : 3} />
    {!calendar && <div className="lg:hidden">
      <Skeleton className="mb-2 ml-auto h-3 w-28" />
      <Panel className="p-4"><Heading /></Panel>
    </div>}
    <Panel widget="transactions">
      <div className="space-y-3 p-4 sm:p-6"><Heading /><Skeleton className="h-8 w-full rounded-lg" />
        <div className="flex flex-wrap gap-2"><Skeleton className="h-8 w-44 rounded-lg" /><Skeleton className="h-8 w-32 rounded-lg" /><Skeleton className="h-8 w-24 rounded-lg" /></div>
      </div>
      {calendar ? <div className="grid grid-cols-7 gap-1 p-4 sm:p-6">{Array.from({ length: 35 }, (_, index) => <Skeleton key={index} className="h-16 sm:h-24" />)}</div> : <Rows />}
    </Panel>
  </div>
}
