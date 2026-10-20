import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { formatDateTime, maskEmail, roleLabels } from '../lib/format'
import { routeHref, type RouteState } from '../lib/route'
import { Icon, type IconName } from './Icon'
import { Button } from './ui'

type NavItem = {
  path: string
  label: string
  icon: IconName
  capability: string
}

const NAV: NavItem[] = [
  { path: '/overview', label: '运营概览', icon: 'overview', capability: 'overview.read' },
  { path: '/users', label: '用户', icon: 'users', capability: 'users.read' },
  { path: '/couples', label: '双人空间', icon: 'heart', capability: 'couples.read' },
  { path: '/tickets', label: '反馈工单', icon: 'ticket', capability: 'tickets.read' },
  { path: '/diagnostics', label: '互动与通知诊断', icon: 'pulse', capability: 'diagnostics.read' },
  { path: '/audit', label: '审计日志', icon: 'audit', capability: 'audit.read' },
  { path: '/system', label: '系统状态', icon: 'system', capability: 'system.read' },
  { path: '/admins', label: '管理员与权限', icon: 'shield', capability: 'admins.manage' },
]

function activePath(path: string): string {
  const matched = NAV.find((item) => path === item.path || path.startsWith(`${item.path}/`))
  return matched?.path || path
}

export function Shell({ route, children }: { route: RouteState; children: ReactNode }) {
  const auth = useAuth()
  const session = auth.session
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentHref = routeHref(route.path, route.params)
  const visible = NAV.filter((item) => auth.can(item.capability))
  const active = activePath(route.path)

  useEffect(() => {
    setMenuOpen(false)
  }, [route.path, route.params])

  useEffect(() => {
    const match = NAV.find((item) => item.path === active)
    document.title = match ? `${match.label} · BIBU！管理台` : 'BIBU！管理台'
  }, [active])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const storageKey = `admin-scroll:${session?.actor.user_id}:${currentHref}`
    let saved = 0
    try {
      saved = Number(sessionStorage.getItem(storageKey) || 0)
    } catch {
      /* Storage may be disabled. */
    }
    if (!Number.isFinite(saved)) saved = 0
    let restoring = true
    const restore = () => {
      if (restoring) {
        container.scrollTop = saved
        if (Math.abs(container.scrollTop - saved) < 1) {
          restoring = false
          observer.disconnect()
        }
      }
    }
    // The list loads asynchronously; retry restoration as its height changes.
    const observer = new ResizeObserver(restore)
    if (container.firstElementChild) observer.observe(container.firstElementChild)
    const stopRestoring = () => {
      restoring = false
      observer.disconnect()
    }
    const save = () => {
      if (restoring && container.scrollTop < saved) return
      try {
        sessionStorage.setItem(storageKey, String(container.scrollTop))
      } catch {
        /* Best effort. */
      }
    }
    container.addEventListener('scroll', save)
    container.addEventListener('wheel', stopRestoring, { passive: true })
    container.addEventListener('touchstart', stopRestoring, { passive: true })
    container.addEventListener('keydown', stopRestoring)
    restore()
    return () => {
      observer.disconnect()
      container.removeEventListener('scroll', save)
      container.removeEventListener('wheel', stopRestoring)
      container.removeEventListener('touchstart', stopRestoring)
      container.removeEventListener('keydown', stopRestoring)
    }
  }, [currentHref, session?.actor.user_id])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  async function signOut() {
    setSigningOut(true)
    try {
      await auth.signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="管理台导航">
        <div className="sidebar-brand">
          <div className="brand-lockup">
            <span className="brand-mark-small" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 32 32" shapeRendering="crispEdges">
                <rect x="2" y="2" width="28" height="28" fill="#20211d" />
                <rect x="4" y="4" width="24" height="24" fill="#fff238" />
                <rect x="18" y="6" width="6" height="6" fill="#ffa6e8" />
                <rect x="8" y="6" width="6" height="6" fill="#04bcf0" />
                <rect x="14" y="8" width="4" height="12" fill="#20211d" />
                <rect x="14" y="22" width="4" height="4" fill="#20211d" />
              </svg>
            </span>
            <span>
              <span className="brand-word">BIBU！</span>
              <span className="brand-sub">管理台</span>
            </span>
          </div>
          <button
            type="button"
            className="mobile-close"
            aria-label="关闭导航"
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className="nav">
          <div className="nav-label">工作区</div>
          {visible.map((item) => (
            <a
              key={item.path}
              href={routeHref(item.path)}
              className={active === item.path ? 'nav-item nav-active' : 'nav-item'}
              aria-current={active === item.path ? 'page' : undefined}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="security-state">
            <Icon name="shield" size={16} />
            <span>两步验证已启用</span>
          </div>
          <div className="sidebar-meta">
            <span>构建 {__ADMIN_BUILD__.commit}</span>
            <span>{session?.env || 'production'}</span>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu"
              aria-label="打开导航"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" size={20} />
            </button>
            <span className="env-badge">{session?.env || 'production'}</span>
            <span className="topbar-time">
              <Icon name="calendar" size={14} />
              服务端时间 {formatDateTime(session?.server_time)}
            </span>
          </div>
          <div className="topbar-right">
            <div className="admin-identity">
              <strong>{session?.actor.display_name || '管理员'}</strong>
              <span>
                {session ? roleLabels[session.actor.role] : ''} · {maskEmail(auth.email)}
              </span>
            </div>
            <Button
              tone="ghost"
              size="sm"
              icon="logout"
              loading={signingOut}
              onClick={() => void signOut()}
            >
              退出
            </Button>
          </div>
        </header>

        <main className="main-scroll" id="main-content" ref={scrollRef} tabIndex={-1}>
          <div className="main-inner">{children}</div>
        </main>
      </div>
    </div>
  )
}
