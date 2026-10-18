import { useCallback, useEffect, useRef, useState } from 'react'
import { usePortfolioHistory } from './usePortfolioHistory'
import { useLoadableData } from './useLoadableData'
import { readInvestmentSnapshot, type InvestmentSnapshot } from '../components/investments-module/data'

// Owned by App so route changes retain the last complete portfolio in memory.
// Nothing financial is persisted in browser storage.
export function useInvestmentData(active: boolean, refreshKey: number) {
  const { data, status, load, invalidate } = useLoadableData<InvestmentSnapshot | null>(null, false)
  const [currencyDisplay, setCurrencyDisplay] = useState<'HUF' | 'USD'>('HUF')
  const controller = useRef<AbortController | null>(null)
  const previousKey = useRef(refreshKey)
  const refresh = useCallback(async () => {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    await load(() => readInvestmentSnapshot(next.signal))
  }, [load])

  useEffect(() => {
    const changed = previousKey.current !== refreshKey
    previousKey.current = refreshKey
    if (active) void refresh()
    else if (changed) {
      controller.current?.abort()
      invalidate()
    }
  }, [active, refreshKey, refresh, invalidate])
  useEffect(() => () => { controller.current?.abort() }, [])
  const history=usePortfolioHistory(active && status.loaded && !status.loading && !status.stale,data,currencyDisplay,refreshKey)
  return { data, status, refresh, currencyDisplay, setCurrencyDisplay, history }
}
