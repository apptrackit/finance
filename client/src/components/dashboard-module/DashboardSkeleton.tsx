import type { SkeletonAccount as Account } from '../common/Skeleton'
import { Panel, Rows } from '../common/WidgetSkeletons'
import { Skeleton } from '../common/Skeleton'

export function DashboardSkeleton({ calendar }: { accounts?: Account[]; calendar: boolean }) {
  return <div className="space-y-5">
    <div className="flex justify-between gap-4"><Skeleton className="hidden h-8 w-36 lg:block" /><Skeleton className="h-10 w-56 rounded-[10px]" /></div>
    <Panel widget="summary-cards" className="grid grid-cols-2 overflow-hidden rounded-[14px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {[0, 1].map(index => <div key={index} className={`space-y-3 p-4 sm:p-5 lg:py-4 ${index === 0 ? 'col-span-2 border-b border-border lg:col-span-1 lg:col-start-1 lg:row-start-1' : 'border-r border-border lg:col-start-1 lg:row-start-2 lg:border-r-0'}`}><div className="space-y-3 lg:flex lg:items-center lg:justify-between lg:gap-4 lg:space-y-0"><Skeleton className="h-3 w-20" /><Skeleton className="h-8 w-full max-w-48" /></div><Skeleton className="h-3 w-4/5 lg:ml-auto lg:w-48" /></div>)}
      <div className="space-y-3 p-4 sm:p-5 lg:hidden"><Skeleton className="h-3 w-24" /><Skeleton className="h-6 w-full" /><Skeleton className="h-3 w-4/5" /></div>
      <div className="col-span-2 space-y-3 border-t border-border p-4 sm:p-5 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:border-t-0 lg:border-l"><Skeleton className="h-3 w-28" /><Skeleton className="h-4 w-full" /><Skeleton className="hidden h-4 w-full lg:block" /><Skeleton className="h-1.5 w-full rounded-full" /><Skeleton className="hidden h-3 w-4/5 lg:block" /></div>
    </Panel>
    <Panel widget="transactions">
      <div className="flex items-center justify-between gap-4 border-b border-border p-4 sm:px-5"><div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-44" /></div><Skeleton className="h-10 w-10 rounded-lg sm:w-64" /></div>
      <div className="flex flex-wrap justify-between gap-2 border-b border-border px-4 py-2 sm:px-5"><Skeleton className="h-10 w-20 rounded-lg sm:w-44" /><Skeleton className="hidden h-10 w-56 rounded-lg sm:block" /><Skeleton className="h-10 w-24 rounded-lg" /></div>
      {calendar ? <div className="grid grid-cols-7 gap-1 p-4 sm:p-5">{Array.from({ length: 35 }, (_, index) => <Skeleton key={index} className="h-16 sm:h-24" />)}</div> : <Rows />}
    </Panel>
  </div>
}
