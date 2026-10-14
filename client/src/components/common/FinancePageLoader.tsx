import type { SkeletonAccount as Account } from './Skeleton'
import { DashboardSkeleton } from '../dashboard-module/DashboardSkeleton'
import { AnalyticsSkeleton } from '../analytics-module/AnalyticsSkeleton'
import { InvestmentsSkeleton } from '../investments-module/InvestmentsSkeleton'
import { Heading, Panel, Rows } from './WidgetSkeletons'
import { Skeleton } from './Skeleton'

export function FinancePageLoader({ view = 'dashboard', accounts, calendar = false }: { view?: string; accounts?: Account[]; calendar?: boolean }) {
  return <div role="status" aria-label="Loading your finances" aria-busy="true">
    <div aria-hidden="true">
      {view === 'analytics' ? <AnalyticsSkeleton accounts={accounts} />
        : view === 'investments' ? <InvestmentsSkeleton accounts={accounts} />
        : view === 'dashboard' ? <DashboardSkeleton accounts={accounts} calendar={calendar} />
        : <div className="space-y-4"><Heading /><Skeleton className="h-9 w-full rounded-lg" /><Panel><div className="p-4 sm:p-6"><Heading /></div><Rows /></Panel></div>}
    </div>
  </div>
}
