import { LoaderCircle, Wallet } from 'lucide-react'

export function FinancePageLoader() {
  return (
    <div role="status" aria-label="Loading your finances" className="flex min-h-[calc(100dvh-13rem)] flex-col items-center justify-center gap-6 lg:min-h-[calc(100dvh-6rem)]">
      <div aria-hidden="true" className="relative flex h-24 w-24 items-center justify-center">
        <LoaderCircle strokeWidth={1} className="absolute inset-0 h-24 w-24 animate-spin text-primary/45 [animation-duration:3s] motion-reduce:animate-none" />
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
          <Wallet strokeWidth={1.5} className="h-7 w-7" />
        </div>
      </div>
      <div aria-hidden="true" className="space-y-2 text-center">
        <p className="text-sm font-medium text-foreground">Loading your finances</p>
        <p className="text-xs text-muted-foreground">Getting everything ready…</p>
      </div>
      <div aria-hidden="true" className="flex gap-1.5">
        {[0, 200, 400].map(delay => <span key={delay} className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60 motion-reduce:animate-none" style={{ animationDelay: `${delay}ms` }} />)}
      </div>
    </div>
  )
}
