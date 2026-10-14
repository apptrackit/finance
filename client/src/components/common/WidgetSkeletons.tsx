import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Skeleton } from './Skeleton'

export function Panel({ children, className, widget }: { children: ReactNode; className?: string; widget?: string }) {
  return <div data-skeleton-widget={widget} className={cn('rounded-xl border border-border bg-card', className)}>{children}</div>
}

export function Heading() {
  return <div className="flex items-center justify-between gap-4">
    <div className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-lg" /><Skeleton className="h-4 w-28" /></div>
    <Skeleton className="h-7 w-16 rounded-lg" />
  </div>
}

export function Rows({ count = 5, holdings = false }: { count?: number; holdings?: boolean }) {
  return <div className="divide-y divide-border/50">
    {Array.from({ length: count }, (_, index) => <div key={index} className="flex items-center justify-between gap-4 p-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Skeleton className={cn('h-9 w-9 shrink-0 rounded-lg', holdings && 'h-12 w-12 rounded-xl')} />
        <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3.5 w-24 max-w-full sm:w-36" /><Skeleton className="h-2.5 w-16 sm:w-24" /></div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Skeleton className={cn('h-4 w-20 sm:w-28', holdings && 'h-5')} />
        <Skeleton className="h-2.5 w-12 sm:w-20" />
        {holdings && <><Skeleton className="h-2.5 w-16" /><Skeleton className="h-3 w-24" /></>}
      </div>
    </div>)}
  </div>
}

export function Summary({ kind, count = 3 }: { kind: 'dashboard' | 'analytics' | 'investments'; count?: number }) {
  return <div data-skeleton-widget="summary-cards" className={cn('grid gap-3 sm:gap-4',
    kind === 'dashboard' ? (count === 4 ? 'grid-cols-2 min-[1440px]:grid-cols-4' : 'grid-cols-2 min-[1440px]:grid-cols-3')
      : kind === 'analytics' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 md:grid-cols-3')}>
    {Array.from({ length: count }, (_, index) => <Panel key={index} className={cn('p-4 sm:p-6', kind !== 'analytics' && 'sm:rounded-2xl', kind === 'investments' && 'p-6 rounded-2xl')}>
      {kind === 'analytics' ? <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-32 max-w-full sm:h-8" /></div>
        <Skeleton className="h-8 w-8 shrink-0 rounded-xl sm:h-10 sm:w-10" />
      </div> : <>
        <div className={cn('mb-1.5 flex items-center justify-between gap-2 sm:mb-4', kind === 'investments' && 'mb-4')}><Skeleton className="h-3 w-20 max-w-[70%] sm:h-3.5" /><Skeleton className={cn('h-6 w-6 shrink-0 rounded-lg sm:h-8 sm:w-8', kind === 'investments' && 'h-5 w-5 sm:h-5 sm:w-5')} /></div>
        <Skeleton className={cn('h-6 w-4/5 sm:h-10', kind === 'investments' && 'h-10')} />
        <Skeleton className="mt-2 h-2.5 w-16 sm:h-3 sm:w-24" />
      </>}
    </Panel>)}
  </div>
}

export function Chart({ widget, kind = 'line', className }: { widget: string; kind?: 'line' | 'bars' | 'donut'; className?: string }) {
  return <Panel widget={widget} className={cn('p-4 sm:p-6', className)}>
    <Heading />
    <div className="mt-4 h-40 sm:h-48">
      {kind === 'donut' ? <div className="flex h-full items-center justify-center gap-6">
        <Skeleton className="h-32 w-32 shrink-0 rounded-full [mask-image:radial-gradient(circle,transparent_48%,black_49%)] sm:h-40 sm:w-40" />
        <div className="space-y-4">{[0, 1, 2].map(index => <div key={index} className="flex gap-2"><Skeleton className="h-3 w-3" /><Skeleton className="h-3 w-16" /></div>)}</div>
      </div> : <div className="relative flex h-full items-end gap-2 border-b border-l border-border/70 px-3 pb-5 sm:gap-4">
        <div className="absolute inset-0 flex flex-col justify-between pb-5">{[0, 1, 2, 3].map(index => <div key={index} className="border-t border-dashed border-border/60" />)}</div>
        {kind === 'bars' ? ['h-[45%]', 'h-[68%]', 'h-[52%]', 'h-[80%]', 'h-[62%]', 'h-[90%]'].map((height, index) => <Skeleton key={index} className={cn('relative flex-1', height)} />)
          : <div className="finance-skeleton absolute inset-x-3 bottom-5 h-3/4 [clip-path:polygon(0_85%,20%_66%,40%_75%,60%_30%,80%_42%,100%_0,100%_10%,80%_52%,60%_40%,40%_85%,20%_76%,0_95%)]" />}
        <div className="absolute inset-x-3 bottom-1 flex justify-between">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-2 w-6" />)}</div>
      </div>}
    </div>
  </Panel>
}
