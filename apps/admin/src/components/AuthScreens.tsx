import { useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { BrandMark, Icon } from './Icon'
import { Button } from './ui'

function AuthFrame({
  children,
  eyebrow,
  title,
  description,
}: {
  children: ReactNode
  eyebrow: string
  title: string
  description: ReactNode
}) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-brand-head">
          <BrandMark size={36} />
          <div>
            <div className="brand-word">BIBU！</div>
            <div className="brand-sub">管理台 · Admin</div>
          </div>
        </div>
        <div className="auth-brand-copy">
          <h2>
            <span>把两个人的小基地，</span>
            <span>照看好。</span>
          </h2>
          <p>查看真实的配对与互动、定位通知问题、处理用户反馈，并让每一次管理操作都有迹可循。</p>
          <ul className="auth-points">
            <li>
              <Icon name="shield" size={18} />
              服务端校验身份、会话与访问权限
            </li>
            <li>
              <Icon name="audit" size={18} />
              所有写操作留存审计与请求编号
            </li>
            <li>
              <Icon name="lock" size={18} />
              统一管理用户、空间、工单与完整业务记录
            </li>
          </ul>
        </div>
        <div className="auth-build">
          <span>构建 {__ADMIN_BUILD__.commit}</span>
          <span>{new Date(__ADMIN_BUILD__.builtAt).toLocaleString('zh-CN')}</span>
        </div>
      </aside>
      <main className="auth-main">
        <section className="auth-card">
          <div className="auth-eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </section>
      </main>
    </div>
  )
}

export function LoginScreen() {
  const { signIn } = useAuth()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!password) {
      setError('请输入管理密码')
      return
    }
    setBusy(true)
    try {
      await signIn(password)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '暂时无法登录，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame
      eyebrow="受控访问"
      title="管理员登录"
      description="输入管理密码即可进入。账号不开放注册，密码由所有者在本机设置。"
    >
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>管理密码</span>
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入密码"
              autoFocus
              disabled={busy}
              required
            />
            <button
              type="button"
              className="text-button password-toggle"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? '隐藏' : '显示'}
            </button>
          </div>
        </label>
        {error && (
          <div className="form-error" role="alert">
            <Icon name="alert" size={16} />
            {error}
          </div>
        )}
        <Button type="submit" loading={busy} className="auth-submit">
          进入管理台
        </Button>
      </form>
      <div className="auth-footnote">
        <Icon name="lock" size={14} />
        忘记密码时，在受信任的服务器上重新运行 npm run admin:password 重置。
      </div>
    </AuthFrame>
  )
}

export function DeniedScreen() {
  const auth = useAuth()
  const reason = auth.deniedReason
  const copy = {
    uninitialized: {
      title: '后台尚未初始化',
      description:
        '服务端还没有第一位所有者。请使用专用管理员账号执行一次性初始化脚本。管理台不会自动提升任何普通用户。',
    },
    not_admin: {
      title: '当前账号没有后台权限',
      description:
        '管理员身份由服务端记录决定，管理台不提供自助申请或邮箱后缀授权。如已获授权，请确认使用的是正确账号。',
    },
    suspended: {
      title: '管理员权限已停用',
      description: '该账号仍在系统中，但后台权限已被停用。请联系所有者确认是否需要恢复。',
    },
    session_expired: {
      title: '登录会话已失效',
      description: '请重新登录。会话、管理员状态会在每次敏感请求时重新校验。',
    },
  }[reason || 'not_admin']

  return (
    <AuthFrame eyebrow="访问受限" title={copy.title} description={copy.description}>
      <div className="denied-meta">
        <span>当前账号</span>
        <strong>{auth.email || '无邮箱'}</strong>
      </div>
      <div className="auth-actions">
        {reason === 'session_expired' ? (
          <Button onClick={() => void auth.signOut()} icon="logout">
            重新登录
          </Button>
        ) : (
          <Button tone="secondary" onClick={() => void auth.retry()} icon="refresh">
            重新检查权限
          </Button>
        )}
        <Button tone="ghost" onClick={() => void auth.signOut()} icon="logout">
          退出账号
        </Button>
      </div>
      <div className="auth-help">
        <p>如果页面状态与预期不符，请让所有者在「管理员与权限」中核对角色与状态。</p>
      </div>
    </AuthFrame>
  )
}

export function AuthErrorScreen() {
  const auth = useAuth()
  return (
    <AuthFrame
      eyebrow="连接异常"
      title="暂时无法进入管理台"
      description="身份已经确认，但管理服务没有返回可用的会话。管理台不会在状态不明时展示业务数据。"
    >
      <div className="form-error" role="alert">
        <Icon name="alert" size={16} />
        {auth.error || '未知错误'}
      </div>
      <div className="auth-actions">
        <Button onClick={() => void auth.retry()} icon="refresh">
          重试
        </Button>
        <Button tone="ghost" onClick={() => void auth.signOut()} icon="logout">
          退出账号
        </Button>
      </div>
      <div className="auth-help">
        <p>运维检查：admin-api 是否已部署、数据库迁移是否已执行、允许来源是否包含当前域名。</p>
      </div>
    </AuthFrame>
  )
}

export function LoadingScreen() {
  return (
    <div className="auth-shell auth-loading">
      <BrandMark size={44} />
      <div className="brand-word">BIBU！管理台</div>
      <div className="loading-copy" role="status">
        <span className="spinner" aria-hidden="true" />
        正在校验登录状态与权限
      </div>
    </div>
  )
}
