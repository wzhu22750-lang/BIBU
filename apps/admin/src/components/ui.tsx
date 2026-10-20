import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { Icon, type IconName } from './Icon'
import { errorMessage } from '../lib/api'

export function Button({
  tone = 'primary',
  size = 'md',
  icon,
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
  size?: 'md' | 'sm'
  icon?: IconName
  loading?: boolean
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`btn btn-${tone} btn-${size} ${className}`}
    >
      {loading ? (
        <span className="spinner" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={size === 'sm' ? 15 : 17} />
      ) : null}
      {children}
    </button>
  )
}

export function Panel({
  title,
  icon,
  subtitle,
  actions,
  children,
  className = '',
  flush = false,
}: {
  title?: ReactNode
  icon?: IconName
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  flush?: boolean
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && (
              <h2>
                {icon && <Icon name={icon} size={17} />}
                {title}
              </h2>
            )}
            {subtitle && <p className="panel-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'panel-body panel-body-flush' : 'panel-body'}>{children}</div>
    </section>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div className="page-heading">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted'

export function StatusPill({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

export function StateView({
  kind,
  title,
  description,
  action,
}: {
  kind: 'loading' | 'empty' | 'error' | 'denied'
  title?: string
  description?: ReactNode
  action?: ReactNode
}) {
  const defaults = {
    loading: { title: '正在加载', icon: 'refresh' as IconName },
    empty: { title: '暂无数据', icon: 'audit' as IconName },
    error: { title: '加载失败', icon: 'alert' as IconName },
    denied: { title: '没有访问权限', icon: 'shield' as IconName },
  }
  return (
    <div className={`state state-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'loading' ? (
        <span className="spinner state-spinner" aria-hidden="true" />
      ) : (
        <Icon name={defaults[kind].icon} size={30} />
      )}
      <strong>{title || defaults[kind].title}</strong>
      {description && <div className="state-description">{description}</div>}
      {action && <div className="state-action">{action}</div>}
    </div>
  )
}

export function InlineError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null
  return (
    <div className="inline-error" role="alert">
      <Icon name="alert" size={18} />
      <span>{errorMessage(error)}</span>
      {onRetry && (
        <button type="button" className="text-button" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  disabled = false,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  disabled?: boolean
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <nav className="pagination" aria-label="分页">
      <span className="pagination-info">
        共 {new Intl.NumberFormat('zh-CN').format(total)} 条 · 第 {Math.min(page, pages)} / {pages}{' '}
        页
      </span>
      <div className="pagination-buttons">
        <Button
          size="sm"
          tone="ghost"
          icon="back"
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          上一页
        </Button>
        <Button
          size="sm"
          tone="ghost"
          disabled={disabled || page >= pages}
          onClick={() => onChange(page + 1)}
        >
          下一页
          <Icon name="chevron" size={14} />
        </Button>
      </div>
    </nav>
  )
}

export function CopyButton({
  value,
  label = '复制',
  className = '',
}: {
  value: string
  label?: string
  className?: string
}) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const area = document.createElement('textarea')
        area.value = value
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        area.remove()
        if (!ok) throw new Error('复制失败')
      }
      setCopied(true)
      toast('已复制到剪贴板', 'success')
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast('浏览器未允许复制，请手动选择文本', 'error')
    }
  }

  return (
    <button type="button" className={`copy-button ${className}`} onClick={() => void copy()}>
      <Icon name={copied ? 'check' : 'copy'} size={13} />
      {copied ? '已复制' : label}
    </button>
  )
}

export function DetailGrid({
  items,
  columns = 3,
}: {
  items: Array<{ label: string; value: ReactNode; wide?: boolean }>
  columns?: 2 | 3 | 4
}) {
  return (
    <dl className={`detail-grid detail-grid-${columns}`}>
      {items.map((item) => (
        <div key={item.label} className={item.wide ? 'detail-wide' : ''}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function PrivacyNote({ children }: { children: ReactNode }) {
  return (
    <div className="privacy-note">
      <Icon name="lock" size={16} />
      <span>{children}</span>
    </div>
  )
}

export function SectionNote({ children }: { children: ReactNode }) {
  return <p className="section-note">{children}</p>
}

type ToastTone = 'info' | 'success' | 'error'
type ToastItem = { id: number; message: string; tone: ToastTone }

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => undefined)

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef<Map<number, number>>(new Map())

  const remove = useCallback((id: number) => {
    setItems((previous) => previous.filter((item) => item.id !== id))
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const push = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextId.current++
      setItems((previous) => [...previous.slice(-2), { id, message, tone }])
      const timer = window.setTimeout(() => remove(id), 4200)
      timers.current.set(id, timer)
    },
    [remove],
  )

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer)
      timers.current.clear()
    },
    [],
  )

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`} role="status">
            <span>{item.message}</span>
            <button type="button" aria-label="关闭提示" onClick={() => remove(item.id)}>
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
