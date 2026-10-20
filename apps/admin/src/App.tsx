import { AccountPage } from './pages/Account'
import { DataPage } from './pages/Data'
import { Fragment, useEffect, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { useRoute, navigate, type RouteState } from './lib/route'
import { ToastProvider } from './components/ui'
import { Shell } from './components/Shell'
import { AuthErrorScreen, DeniedScreen, LoadingScreen, LoginScreen } from './components/AuthScreens'
import { OverviewPage } from './pages/Overview'
import { UsersPage } from './pages/Users'
import { UserDetailPage } from './pages/UserDetail'
import { CouplesPage } from './pages/Couples'
import { CoupleDetailPage } from './pages/CoupleDetail'
import { TicketsPage } from './pages/Tickets'
import { TicketDetailPage } from './pages/TicketDetail'
import { DiagnosticsPage } from './pages/Diagnostics'
import { AuditPage } from './pages/Audit'
import { SystemPage } from './pages/System'
import { AdminsPage } from './pages/Admins'
import { NoPermissionPage, NotFoundPage } from './pages/Misc'

const ROUTES: Array<{
  path: string
  capability: string
  render: (route: RouteState) => ReactNode
}> = [
  { path: '/data', capability: 'data.read', render: (route) => <DataPage route={route} /> },
  { path: '/account', capability: 'overview.read', render: () => <AccountPage /> },
  {
    path: '/overview',
    capability: 'overview.read',
    render: (route) => <OverviewPage route={route} />,
  },
  { path: '/users', capability: 'users.read', render: (route) => <UsersPage route={route} /> },
  {
    path: '/users/',
    capability: 'users.read',
    render: (route) => <UserDetailPage route={route} />,
  },
  {
    path: '/couples',
    capability: 'couples.read',
    render: (route) => <CouplesPage route={route} />,
  },
  {
    path: '/couples/',
    capability: 'couples.read',
    render: (route) => <CoupleDetailPage route={route} />,
  },
  {
    path: '/tickets',
    capability: 'tickets.read',
    render: (route) => <TicketsPage route={route} />,
  },
  {
    path: '/tickets/',
    capability: 'tickets.read',
    render: (route) => <TicketDetailPage route={route} />,
  },
  {
    path: '/diagnostics',
    capability: 'diagnostics.read',
    render: (route) => <DiagnosticsPage route={route} />,
  },
  { path: '/audit', capability: 'audit.read', render: (route) => <AuditPage route={route} /> },
  { path: '/system', capability: 'system.read', render: (route) => <SystemPage route={route} /> },
  { path: '/admins', capability: 'admins.manage', render: () => <AdminsPage /> },
]

function Landing({ can }: { can: (capability: string) => boolean }) {
  const path =
    (can('overview.read')
      ? '/overview'
      : ROUTES.find((item) => !item.path.endsWith('/') && can(item.capability))?.path) ||
    '/overview'
  useEffect(() => {
    navigate(path)
  }, [path])
  return <LoadingScreen />
}

function Routed({ route }: { route: RouteState }) {
  const auth = useAuth()
  const fallback =
    ROUTES.find((item) => !item.path.endsWith('/') && auth.can(item.capability))?.path ||
    '/overview'

  if (route.path === '/') return <Landing can={auth.can} />

  const matched = ROUTES.find(
    (item) =>
      route.path === item.path ||
      (item.path.endsWith('/') &&
        route.path.startsWith(item.path) &&
        !route.path.slice(item.path.length).includes('/')),
  )
  if (!matched) return <NotFoundPage fallback={fallback} />
  if (!auth.can(matched.capability)) return <NoPermissionPage fallback={fallback} />
  // 详情页以路由路径为 key，切到另一个用户/工单时强制重挂载，避免旧表单和旧状态
  // 在等待新详情时被提交到新对象。
  return (
    <Fragment key={`${auth.session?.actor.user_id}:${route.path}`}>
      {matched.render(route)}
    </Fragment>
  )
}

function Gate() {
  const auth = useAuth()
  const route = useRoute()

  if (auth.gate === 'loading') return <LoadingScreen />
  if (auth.gate === 'signed_out') return <LoginScreen />
  if (auth.gate === 'denied') return <DeniedScreen />
  if (auth.gate === 'error') return <AuthErrorScreen />
  return (
    <Shell route={route}>
      <Routed route={route} />
    </Shell>
  )
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  )
}
