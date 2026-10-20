import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbortError } from './api'

export type ApiState<T> = {
  key: string
  data: T | undefined
  error: unknown
  loading: boolean
  fetchedAt: string | null
}

export function beginLoad<T>(previous: ApiState<T> | undefined, key: string): ApiState<T> {
  if (previous?.key === key) {
    return { ...previous, loading: true, error: null }
  }
  return { key, data: undefined, error: null, loading: true, fetchedAt: null }
}

export function visibleApiState<T>(state: ApiState<T>, key: string): ApiState<T> {
  if (state.key === key) return state
  return { key, data: undefined, error: null, loading: true, fetchedAt: null }
}

export function useApi<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): ApiState<T> & { reload: () => void } {
  const loadRef = useRef(load)
  loadRef.current = load
  const [state, setState] = useState<ApiState<T>>(() => beginLoad(undefined, key))
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState((previous) => beginLoad(previous, key))
    loadRef
      .current(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setState({
          key,
          data,
          error: null,
          loading: false,
          fetchedAt: new Date().toISOString(),
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return
        setState((previous) =>
          previous.key === key ? { ...previous, loading: false, error } : previous,
        )
      })
    return () => controller.abort()
  }, [key, tick])

  const reload = useCallback(() => setTick((value) => value + 1), [])
  return { ...visibleApiState(state, key), reload }
}
