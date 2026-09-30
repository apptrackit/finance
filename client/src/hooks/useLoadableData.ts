import { useCallback, useEffect, useRef, useState } from 'react'

export type DataLoadStatus = {
  loading: boolean
  loaded: boolean
  error: boolean
  stale: boolean
}

// Keep the last successful value, including a genuinely empty array. Only the
// newest request can replace it or change its status.
export function useLoadableData<T>(initialData: T, initialLoading = true) {
  const [snapshot, setSnapshot] = useState<{ data: T; status: DataLoadStatus }>({
    data: initialData,
    status: { loading: initialLoading, loaded: false, error: false, stale: false },
  })
  const requestId = useRef(0)

  useEffect(() => () => { requestId.current++ }, [])

  const load = useCallback(async (read: () => Promise<T>) => {
    const id = ++requestId.current
    setSnapshot(previous => ({
      ...previous,
      status: { ...previous.status, loading: true },
    }))
    try {
      const data = await read()
      if (id !== requestId.current) return
      setSnapshot({ data, status: { loading: false, loaded: true, error: false, stale: false } })
    } catch {
      if (id !== requestId.current) return
      setSnapshot(previous => ({
        ...previous,
        status: { loading: false, loaded: previous.status.loaded, error: true, stale: previous.status.loaded },
      }))
    }
  }, [])

  return { ...snapshot, load }
}
