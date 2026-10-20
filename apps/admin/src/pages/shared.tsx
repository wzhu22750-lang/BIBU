import type { ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { defaultRange, daySpan, isValidDate } from '../lib/format'
import { listReturnHref, parseRoute } from '../lib/route'

export function numberParam(value: string | null): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

export function useListRange(
  params: URLSearchParams,
  defaultDays = 30,
  maxDays = 92,
): { from: string; to: string } {
  const fallback = defaultRange(defaultDays)
  const rawFrom = params.get('from') || ''
  const rawTo = params.get('to') || ''
  if (!isValidDate(rawFrom) || !isValidDate(rawTo)) return fallback
  const span = daySpan(rawFrom, rawTo)
  if (span < 0 || span + 1 > maxDays) return fallback
  return { from: rawFrom, to: rawTo }
}

export function BackButton({ fallback = '/' }: { fallback?: string }) {
  return (
    <a className="back-link" href={listReturnHref(parseRoute().params.get('return_to'), fallback)}>
      <Icon name="back" size={15} />
      返回列表
    </a>
  )
}

export function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  return (
    <label className={wide ? 'field field-wide' : 'field'}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function MetricLink({
  href,
  children,
  className = '',
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <a className={`metric-link ${className}`} href={href}>
      {children}
      <Icon name="chevron" size={13} />
    </a>
  )
}
