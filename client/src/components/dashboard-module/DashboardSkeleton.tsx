import type { SkeletonAccount as Account } from '../common/Skeleton'
import { Panel, Rows } from '../common/WidgetSkeletons'
import { Skeleton } from '../common/Skeleton'

export function DashboardSkeleton({ calendar }: { accounts?: Account[]; calendar: boolean }) {
  return <div className="space-y-5">
    <div className="flex justify-between gap-4"><Skeleton className="hidden h-8 w-36 lg:block" /><Skeleton className="h-10 w-56 rounded-[10px]" /></div>
    <Panel widget="summary-cards" className="flex flex-wrap gap-px overflow-hidden rounded-[14px] bg-border">
      {[0, 1].map(index => <div key={index} className="dashboard-summary-balance flex flex-col justify-center bg-card p-4 sm:px-6 sm:py-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-start sm:gap-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-8 w-44 max-w-[65%] sm:max-w-full" /></div>
          <Skeleton className="ml-auto h-3 w-48 max-w-[65%] sm:ml-0 sm:max-w-full" />
        </div>
      </div>)}
      <div className="dashboard-summary-activity space-y-4 bg-card p-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap justify-between gap-2"><Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-48" /></div>
        <div className="dashboard-cash-flow-grid">{[0, 1].map(index => <div key={index} className="col-span-full grid grid-cols-subgrid items-center gap-y-2">
          <Skeleton className="h-3 w-12" /><Skeleton className="ml-auto h-4 w-28" />
          <Skeleton className="dashboard-cash-flow-bar w-full" /><Skeleton className="dashboard-cash-flow-upcoming ml-auto h-3 w-24" />
        </div>)}</div>
      </div>
    </Panel>
    <Panel widget="transactions">
      <div className="flex items-center justify-between gap-4 border-b border-border p-4 sm:px-5"><div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-44" /></div><Skeleton className="h-10 w-10 rounded-lg sm:w-64" /></div>
      <div className="flex flex-wrap justify-between gap-2 border-b border-border px-4 py-2 sm:px-5"><Skeleton className="h-10 w-20 rounded-lg sm:w-44" /><Skeleton className="hidden h-10 w-56 rounded-lg sm:block" /><Skeleton className="h-10 w-24 rounded-lg" /></div>
      {calendar ? <div className="grid grid-cols-7 gap-1 p-4 sm:p-5">{Array.from({ length: 35 }, (_, index) => <Skeleton key={index} className="h-16 sm:h-24" />)}</div> : <Rows />}
    </Panel>
  </div>
}
