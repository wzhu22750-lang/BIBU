import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Button, Panel, PageHeader, DetailGrid, useToast } from '../components/ui'
export function PasswordPanel() {
  const toast = useToast()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!next) {
      setError('请输入新密码')
      return
    }
    if (next !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: next })
      if (updateError) {
        setError(
          updateError.message.toLowerCase().includes('should be different')
            ? '新密码不能与当前密码相同'
            : '密码更新失败，请稍后重试',
        )
        return
      }
      await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
      setNext('')
      setConfirm('')
      toast('管理密码已更新，其他设备已退出登录', 'success')
    } catch {
      setError('密码更新失败，请检查网络后重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="管理密码" subtitle="修改后其他设备上的管理台会退出登录">
      <form className="auth-form" onSubmit={submit}>
        <label className="field">
          <span>新密码</span>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            placeholder="输入新密码"
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>确认新密码</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="再次输入"
            disabled={busy}
          />
        </label>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div>
          <Button type="submit" loading={busy}>
            更新密码
          </Button>
        </div>
      </form>
    </Panel>
  )
}

export function AccountPage() {
  const auth = useAuth()
  return (
    <>
      <PageHeader
        eyebrow="后台设置"
        title="我的账号"
        description="查看当前登录身份与修改管理密码。"
      />
      <div className="account-layout">
        <Panel title="登录身份">
          <DetailGrid
            columns={2}
            items={[
              { label: '管理员', value: auth.session?.actor.display_name },
              { label: '邮箱', value: auth.email },
              { label: '账号 ID', value: auth.session?.actor.user_id, wide: true },
            ]}
          />
        </Panel>
        <PasswordPanel />
      </div>
    </>
  )
}
