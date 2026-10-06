import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { FilterChange } from './filters'

// Each user action applies one patch. Canonicalization replaces history instead
// of adding a second stop for the same view. No uncommitted input goes here.
export function useUrlFilters<T>(parse: (params: URLSearchParams) => T, serialize: (value: T) => string): [T, FilterChange<T>] {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parse(params), [params, parse])
  const canonical = serialize(filters)
  useEffect(() => {
    if (params.toString() !== canonical) setParams(canonical, { replace: true })
  }, [canonical, params, setParams])
  const update: FilterChange<T> = (patch, replace = false) => {
    const next = serialize({ ...filters, ...patch })
    if (next !== params.toString()) setParams(next, { replace })
  }
  return [filters, update]
}
