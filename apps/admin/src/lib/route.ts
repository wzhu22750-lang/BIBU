import { useEffect, useState } from 'react'
import type { Query } from './api'

export type RouteState = {
  path: string
  params: URLSearchParams
}

export function parseRoute(hash = window.location.hash): RouteState {
  const raw = hash.replace(/^#/, '') || '/'
  const [pathPart, queryPart = ''] = raw.split('?')
  let path = pathPart || '/'
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1) path = path.replace(/\/+$/, '')
  return { path, params: new URLSearchParams(queryPart) }
}

export function routeHref(path: string, params?: URLSearchParams | Query): string {
  let search = ''
  if (params instanceof URLSearchParams) {
    search = params.toString()
  } else if (params) {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined || value === '') continue
      next.set(key, String(value))
    }
    search = next.toString()
  }
  return `#${path}${search ? `?${search}` : ''}`
}

export function navigate(path: string, params?: URLSearchParams | Query) {
  const href = routeHref(path, params)
  if (window.location.hash === href) return
  window.location.hash = href
}

export function navigateQuery(path: string, current: URLSearchParams, updates: Query) {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') next.delete(key)
    else next.set(key, String(value))
  }
  navigate(path, next)
}

export function useRoute(): RouteState {
  const [route, setRoute] = useState<RouteState>(() => parseRoute())
  useEffect(() => {
    const onChange = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function detailId(path: string, prefix: string): string | null {
  if (!path.startsWith(`${prefix}/`)) return null
  const rest = path.slice(prefix.length + 1)
  if (!rest || rest.includes('/')) return null
  return decodeURIComponent(rest)
}

/** Only allow a local list route as the return destination. */
export function listReturnHref(value: string | null, fallback: string): string {
  if (!value || !/^#\/(users|couples|tickets|diagnostics|overview|data)(?:\?|$)/.test(value)) {
    return routeHref(fallback)
  }
  return value
}

export function detailHref(path: string, source: RouteState, params: Query = {}): string {
  return routeHref(path, { ...params, return_to: routeHref(source.path, source.params) })
}
