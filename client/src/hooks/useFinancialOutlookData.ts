import { useCallback, useEffect, useRef } from 'react'
import { API_BASE_URL, apiFetch } from '../config'
import { useLoadableData } from './useLoadableData'
import type { FinancialOutlookSnapshot } from '../components/analytics-module/types'

type OutlookData = { snapshots: FinancialOutlookSnapshot[]; nextCursor: string | null; latestId: string | null }

export function useFinancialOutlookData(active: boolean, refreshKey: number) {
  const { data, status, load, invalidate } = useLoadableData<OutlookData | null>(null, false)
  const controller = useRef<AbortController | null>(null)
  const previousKey = useRef(refreshKey)
  const refresh = useCallback(async () => {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    await load(async () => {
      const [latestResponse, historyResponse] = await Promise.all([
        apiFetch(`${API_BASE_URL}/financial-outlook/latest`, { throwOnError: true, signal: next.signal }),
        apiFetch(`${API_BASE_URL}/financial-outlook-snapshots?limit=20`, { throwOnError: true, signal: next.signal }),
      ])
      const [latest, history] = await Promise.all([
        latestResponse.json() as Promise<{ snapshot: FinancialOutlookSnapshot | null }>,
        historyResponse.json() as Promise<{ snapshots: FinancialOutlookSnapshot[]; next_cursor: string | null }>,
      ])
      const snapshot = (value: unknown): value is FinancialOutlookSnapshot => typeof value === 'object' && value !== null
        && 'id' in value && typeof value.id === 'string'
      if (!(latest.snapshot === null || snapshot(latest.snapshot)) || !Array.isArray(history.snapshots)
        || !history.snapshots.every(snapshot) || !(history.next_cursor === null || typeof history.next_cursor === 'string')) {
        throw new Error('Invalid financial outlook response')
      }
      next.signal.throwIfAborted()
      const snapshots = latest.snapshot && !history.snapshots.some(item => item.id === latest.snapshot!.id)
        ? [latest.snapshot, ...history.snapshots] : history.snapshots
      return { snapshots, nextCursor: history.next_cursor, latestId: latest.snapshot?.id || snapshots[0]?.id || null }
    })
  }, [load])
  useEffect(() => {
    const changed = previousKey.current !== refreshKey
    previousKey.current = refreshKey
    if (active) void refresh()
    else if (changed) { controller.current?.abort(); invalidate() }
  }, [active, refreshKey, refresh, invalidate])
  useEffect(() => () => { controller.current?.abort() }, [])
  return { data, status, refresh }
}
