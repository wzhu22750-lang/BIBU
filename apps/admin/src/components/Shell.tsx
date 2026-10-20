import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { roleLabels } from '../lib/format'
import { routeHref, type RouteState } from '../lib/route'
import { BrandMark, Icon, type IconName } from './Icon'
import { Button } from './ui'

type NavItem = {
  path: string
  label: string
  icon: IconName
  capability: string
  group: string
}

const NAV: NavItem[] = [
  {
    path: '/account',
    label: '我的账号',
    icon: 'shield',
    capability: 'overview.read',
    group: '后台设置',
  },
  {
    path: '/overview',
    label: '总览',
    icon: 'overview',
    capability: 'overview.read',
    group: '工作台',
  },
  {
    path: '/users',
    label: '用户管理',
    icon: 'users',
    capability: 'users.read',
    group: '用户与空间',
  },
  {
    path: '/couples',
    label: '双人空间',
    icon: 'heart',
    capability: 'couples.read',
    group: '用户与空间',
  },
  { path: '/data', label: '业务数据', icon: 'audit', capability: 'data.read', group: '用户与空间' },
  {
    path: '/tickets',
    label: '工单处理',
    icon: 'ticket',
    capability: 'tickets.read',
    group: '服务与反馈',
  },
  {
    path: '/diagnostics',
    label: '通知诊断',
    icon: 'pulse',
    capability: 'diagnostics.read',
    group: '运行维护',
  },
  { path: '/audit', label: '操作日志', icon: 'audit', capability: 'audit.read', group: '运行维护' },
  {
    path: '/system',
    label: '系统状态',
    icon: 'system',
    capability: 'system.read',
    group: '运行维护',
  },
  {
    path: '/admins',
    label: '管理员权限',
    icon: 'shield',
    capability: 'admins.manage',
    group: '后台设置',
  },
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
  const sidebarRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
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
    const sidebar = sidebarRef.current
    sidebar?.querySelector<HTMLButtonElement>('.mobile-close')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
      if (event.key === 'Tab' && sidebar) {
        const controls = Array.from(
          sidebar.querySelectorAll<HTMLElement>('a[href], button'),
        ).filter((element) => element.getClientRects().length > 0)
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    const desktop = window.matchMedia('(min-width: 981px)')
    const onResize = () => {
      if (desktop.matches) setMenuOpen(false)
    }
    desktop.addEventListener('change', onResize)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      desktop.removeEventListener('change', onResize)
      menuButtonRef.current?.focus()
    }
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
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          scrollRef.current?.focus()
        }}
      >
        跳到主要内容
      </a>
      <aside
        ref={sidebarRef}
        id="admin-navigation"
        className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}
        aria-label="管理台导航"
      >
        <div className="sidebar-brand">
          <div className="brand-lockup">
            <span className="brand-mark-small" aria-hidden="true">
              <BrandMark size={36} />
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
          {['工作台', '用户与空间', '服务与反馈', '运行维护', '后台设置'].map((group) => {
            const items = visible.filter((item) => item.group === group)
            if (!items.length) return null
            return (
              <div className="nav-group" key={group}>
                <div className="nav-label">{group}</div>
                {items.map((item) => (
                  <a
                    key={item.path}
                    href={routeHref(item.path)}
                    className={active === item.path ? 'nav-item nav-active' : 'nav-item'}
                    aria-current={active === item.path ? 'page' : undefined}
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                    {active === item.path && (
                      <Icon name="chevron" size={13} className="nav-current" />
                    )}
                  </a>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="security-state">
            <Icon name="shield" size={16} />
            <span>管理员会话已验证</span>
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
              aria-controls="admin-navigation"
              ref={menuButtonRef}
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" size={20} />
            </button>
            <span className="env-badge">{session?.env || 'production'}</span>
            <div className="breadcrumb">
              <span>{NAV.find((item) => item.path === active)?.group}</span>
              <span aria-hidden="true">/</span>
              <strong>{NAV.find((item) => item.path === active)?.label}</strong>
              {route.path !== active && (
                <>
                  <span aria-hidden="true">/</span>
                  <span>详情</span>
                </>
              )}
            </div>
          </div>
          <div className="topbar-right">
            <span className="admin-avatar" aria-hidden="true">
              {(session?.actor.display_name || '管').slice(0, 1)}
            </span>
            <div className="admin-identity">
              <strong>{session?.actor.display_name || '管理员'}</strong>
              <span>
                {session ? roleLabels[session.actor.role] : ''} · {auth.email || '无邮箱'}
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
