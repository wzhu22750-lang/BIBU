import type {
  AccountStatus,
  AdminRole,
  DeliveryStatus,
  TicketCategory,
  TicketStatus,
} from './types'

const SHANGHAI = 'Asia/Shanghai'

function shanghaiParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return { year: pick('year'), month: pick('month'), day: pick('day') }
}

export function businessToday(now = new Date()): string {
  const { year, month, day } = shanghaiParts(now)
  return `${year}-${month}-${day}`
}

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function daySpan(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

export function defaultRange(days = 30): { from: string; to: string } {
  const to = businessToday()
  return { from: addDays(to, -(days - 1)), to }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(date)
    .replaceAll('/', '-')
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 10)
}

export function formatShortDay(value: string): string {
  return value.slice(5)
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('zh-CN').format(value)
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}%`
}

export function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(2)} s`
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—'
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 1)}***@${domain}`
}

export function shortId(value: string | null | undefined, head = 8, tail = 4): string {
  if (!value) return '—'
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

export function percentChange(current: number, previous: number | null | undefined) {
  if (previous === null || previous === undefined) {
    return { text: '无可比数据', tone: 'muted' as const }
  }
  if (previous === 0) {
    return {
      text: current === 0 ? '与上期持平（均为 0）' : '上期为 0，暂无可比变化率',
      tone: 'muted' as const,
    }
  }
  const diff = current - previous
  const rate = (diff / previous) * 100
  if (diff === 0) return { text: '与上期持平', tone: 'muted' as const }
  return {
    text: `${diff > 0 ? '+' : ''}${formatNumber(diff)}（${diff > 0 ? '+' : ''}${rate.toFixed(1)}%）`,
    tone: diff > 0 ? ('up' as const) : ('down' as const),
  }
}

export function rateChange(current: number | null, previous: number | null) {
  if (current === null || current === undefined)
    return { text: '本期无任务样本', tone: 'muted' as const }
  if (previous === null || previous === undefined) {
    return { text: '上期无任务样本', tone: 'muted' as const }
  }
  const diff = current - previous
  if (Math.abs(diff) < 0.05) return { text: '与上期持平', tone: 'muted' as const }
  return {
    text: `${diff > 0 ? '+' : ''}${diff.toFixed(1)} 个百分点`,
    tone: diff > 0 ? ('up' as const) : ('down' as const),
  }
}

export const roleLabels: Record<AdminRole, string> = {
  owner: '所有者',
  operator: '运营',
  support: '客服',
  maintainer: '维护',
}

export const accountStatusLabels: Record<AccountStatus, string> = {
  active: '正常',
  banned: '已封禁',
  deletion_pending: '注销处理中',
}

export const ticketStatusLabels: Record<TicketStatus, string> = {
  pending: '待处理',
  in_progress: '处理中',
  waiting_user: '等待用户',
  resolved: '已解决',
}

export const ticketCategoryLabels: Record<TicketCategory, string> = {
  bug: '故障',
  account: '账号',
  notification: '通知',
  data: '数据',
  privacy: '隐私',
  other: '其他',
}

export const deliveryStatusLabels: Record<DeliveryStatus, string> = {
  accepted: '推送已接受',
  failed: '推送失败',
  skipped: '已跳过',
  unrecorded: '无诊断记录',
}

export const stageLabels: Record<string, string> = {
  webhook_received: '已进入推送服务',
  skipped: '已跳过',
  provider_accepted: '个推已接受',
  provider_rejected: '个推拒绝',
  invalid_token: '无效设备',
}

export function detailStatusTone(
  status: TicketStatus | AccountStatus | DeliveryStatus,
): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (status === 'resolved' || status === 'active' || status === 'accepted') return 'ok'
  if (status === 'pending' || status === 'waiting_user' || status === 'skipped') return 'warn'
  if (status === 'in_progress' || status === 'unrecorded') return 'info'
  if (status === 'banned' || status === 'deletion_pending' || status === 'failed') return 'danger'
  return 'muted'
}

export function roleTone(role: AdminRole): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (role === 'owner') return 'danger'
  if (role === 'operator') return 'info'
  if (role === 'support') return 'ok'
  return 'warn'
}

export function formatJsonSummary(value: Record<string, unknown> | null): string {
  if (!value) return '—'
  return Object.entries(value)
    .map(
      ([key, item]) => `${key}: ${typeof item === 'object' ? JSON.stringify(item) : String(item)}`,
    )
    .join(' · ')
}
