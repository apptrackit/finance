import { useCallback, useEffect, useRef, useState } from 'react'
import {initialOverview} from '../components/investments-module/overview'
import type {OverviewView} from '../components/investments-module/overview'
import type {HoldingChartCache} from '../components/investments-module/InvestmentChart'
import { usePortfolioHistory } from './usePortfolioHistory'
import { useLoadableData } from './useLoadableData'
import { readInvestmentSnapshot, type InvestmentSnapshot } from '../components/investments-module/data'

// Owned by App so route changes retain the last complete portfolio in memory.
// Nothing financial is persisted in browser storage.
export function useInvestmentData(active: boolean, refreshKey: number) {
  const { data, status, load, invalidate } = useLoadableData<InvestmentSnapshot | null>(null, false)
  const [currencyDisplay, setCurrencyDisplay] = useState<'HUF' | 'USD'>('HUF')
  const [detailCache]=useState<HoldingChartCache>(()=>new Map())
  useEffect(()=>{detailCache.clear()},[refreshKey,detailCache])
  const controller = useRef<AbortController | null>(null)
  const [overviewView,setOverviewView]=useState(initialOverview)
  const updateOverview=useCallback((patch:Partial<OverviewView>)=>setOverviewView(v=>({...v,...patch})),[])
  const refresh = useCallback(async () => {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    await load(() => readInvestmentSnapshot(next.signal))
  }, [load])

  useEffect(() => {
    if (active) void refresh()
    else {
      controller.current?.abort()
      invalidate()
    }
  }, [active, refreshKey, refresh, invalidate])
  useEffect(() => () => { controller.current?.abort() }, [])
  const history=usePortfolioHistory(active && status.loaded && !status.loading && !status.stale,data,currencyDisplay,refreshKey)
  return { data, status, refresh, currencyDisplay, setCurrencyDisplay, history, overviewView, updateOverview, detailCache }
}
