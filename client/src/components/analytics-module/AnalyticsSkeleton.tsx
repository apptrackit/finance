import { useState } from 'react'
import { loadWidgetVisibility, type WidgetId } from './widgetConfig'
import type { SkeletonAccount as Account } from '../common/Skeleton'
import { Panel, Heading, Rows, Summary, Chart } from '../common/WidgetSkeletons'
import { Skeleton } from '../common/Skeleton'

export function AnalyticsSkeleton({ accounts }: { accounts?: Account[] }) {
  const [visibility] = useState(loadWidgetVisibility)
  const visible = (widget: WidgetId) => Boolean(visibility[widget])
  const cashAccounts = accounts?.filter(account => account.type !== 'investment')
  const accountCount = cashAccounts?.length ?? 1
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><Skeleton className="h-3 w-28" /><Skeleton className="h-8 w-24 rounded-lg" /></div>
    <div className="flex flex-wrap gap-2 py-2.5"><Skeleton className="h-10 w-full rounded-xl min-[430px]:w-60" /><Skeleton className="h-10 w-full rounded-xl min-[430px]:w-44" /></div>
    {visible('summary-cards') && <Summary kind="analytics" />}
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
      {visible('cash-balance-trend') && (!accounts || cashAccounts?.some(account => !account.exclude_from_cash_balance)) && <Chart widget="cash-balance-trend" />}
      {visible('income-chart') && <Chart widget="income-chart" kind="bars" />}
      {visible('expenses-chart') && <Chart widget="expenses-chart" kind="bars" />}
      {visible('income-expenses-trend') && <Chart widget="income-expenses-trend" />}
      {visible('account-trends') && Array.from({ length: accountCount }, (_, index) => <Chart key={index} widget="account-trends" className={index === accountCount - 1 && accountCount % 2 !== 0 ? 'lg:col-span-2' : ''} />)}
      {visible('income-breakdown') && <Chart widget="income-breakdown" kind="donut" />}
      {visible('spending-breakdown') && <Chart widget="spending-breakdown" kind="donut" />}
    </div>
    {visible('money-map') && <Panel widget="money-map" className="p-4 sm:p-6"><Heading />
      <div className="mt-6 flex h-48 items-center justify-between gap-4 sm:h-64">
        <div className="flex h-full w-1/5 flex-col justify-around"><Skeleton className="h-16" /><Skeleton className="h-12" /></div>
        <Skeleton className="h-24 flex-1 rounded-[50%]" /><Skeleton className="h-36 w-1/5" /><Skeleton className="h-24 flex-1 rounded-[50%]" />
        <div className="flex h-full w-1/5 flex-col justify-around"><Skeleton className="h-12" /><Skeleton className="h-10" /><Skeleton className="h-8" /></div>
      </div>
    </Panel>}
    {visible('top-expenses') && <Panel widget="top-expenses"><div className="p-4 sm:p-6"><Heading /></div><Rows /></Panel>}
    {visible('ai-financial-forecast') && <Panel widget="ai-financial-forecast" className="overflow-hidden rounded-2xl">
      <div className="space-y-4 border-b border-border p-5 sm:p-7"><Heading /><Skeleton className="h-6 w-3/4" /></div>
      <div className="grid grid-cols-1 divide-y divide-border border-b border-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
        {[0, 1, 2, 3].map(index => <div key={index} className="space-y-3 p-5 sm:border-r sm:border-border sm:px-7 last:border-r-0"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-4/5" /><Skeleton className="h-2 w-full" /><Skeleton className="h-3 w-2/3" /></div>)}
      </div>
      <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-2">{[0, 1].map(index => <div key={index} className="space-y-4"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-2/3" /></div>)}</div>
    </Panel>}
  </div>
}
