import { useState, type FormEvent } from 'react'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLogicalSubmission, withRequestId } from '../lib/idempotency'
import { useApi } from '../lib/useApi'
import type { AdminMember, AdminRole } from '../lib/types'
import { formatDateTime, roleLabels, roleTone } from '../lib/format'
import {
  Button,
  InlineError,
  PageHeader,
  Panel,
  SectionNote,
  StateView,
  StatusPill,
  useToast,
} from '../components/ui'
import { Field } from './shared'

const ROLES: AdminRole[] = ['owner', 'operator', 'support', 'maintainer']

const CAPABILITY_MATRIX: Array<{ label: string; roles: Record<AdminRole, boolean> }> = [
  {
    label: '完整业务数据、邮箱与照片原图',
    roles: { owner: true, operator: false, support: false, maintainer: false },
  },
  {
    label: '运营概览',
    roles: { owner: true, operator: true, support: true, maintainer: true },
  },
  {
    label: '用户资料与检索',
    roles: { owner: true, operator: true, support: true, maintainer: false },
  },
  {
    label: '按完整邮箱精确检索',
    roles: { owner: true, operator: true, support: false, maintainer: false },
  },
  {
    label: '用户备注',
    roles: { owner: true, operator: true, support: true, maintainer: false },
  },
  {
    label: '双人空间只读',
    roles: { owner: true, operator: true, support: true, maintainer: false },
  },
  {
    label: '工单查看与回复',
    roles: { owner: true, operator: true, support: true, maintainer: false },
  },
  {
    label: '通知诊断',
    roles: { owner: true, operator: true, support: false, maintainer: true },
  },
  {
    label: '系统状态',
    roles: { owner: true, operator: true, support: false, maintainer: true },
  },
  {
    label: '审计日志',
    roles: { owner: true, operator: true, support: false, maintainer: false },
  },
  {
    label: '管理员与权限',
    roles: { owner: true, operator: false, support: false, maintainer: false },
  },
]

export function AdminsPage() {
  const auth = useAuth()
  const toast = useToast()
  const state = useApi('admins', (signal) =>
    api.get<{ rows: AdminMember[] }>('/admins', undefined, signal),
  )
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<AdminRole>('support')
  const [status, setStatus] = useState<'active' | 'suspended'>('active')
  const [displayName, setDisplayName] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const submission = useLogicalSubmission()

  function edit(member: AdminMember) {
    setEditing(member.user_id)
    setUserId(member.user_id)
    setRole(member.role)
    setStatus(member.status)
    setDisplayName(member.display_name)
    setReason('')
    setFormError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function reset() {
    setEditing(null)
    setUserId('')
    setRole('support')
    setStatus('active')
    setDisplayName('')
    setReason('')
    setFormError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        userId.trim(),
      )
    ) {
      setFormError('请输入已存在用户的完整 UUID')
      return
    }
    if (reason.trim().length < 2) {
      setFormError('请填写至少 2 个字的操作理由')
      return
    }
    if (editing === auth.session?.actor.user_id && role !== 'owner') {
      const confirmed = window.confirm('你正在降低自己的权限。保存后将立即失效，是否继续？')
      if (!confirmed) return
    }
    setSaving(true)
    setFormError('')
    const payload = {
      user_id: userId.trim(),
      role,
      status,
      display_name: displayName.trim(),
      reason: reason.trim(),
    }
    try {
      const result = await api.post<Record<string, unknown>>(
        '/admins',
        payload,
        submission.begin(payload),
      )
      submission.succeed()
      toast(
        withRequestId(
          editing ? '管理员权限已更新，并写入审计' : '管理员已添加，并写入审计',
          result,
        ),
        'success',
      )
      reset()
      state.reload()
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const rows = state.data?.rows || []

  return (
    <>
      <PageHeader
        eyebrow="管理员与权限"
        title="管理员权限"
        description="管理员身份来自服务端记录，不依据邮箱后缀或用户自填信息。所有变更立即生效并写入审计；系统至少保留一位有效 owner。"
        actions={
          <Button tone="secondary" icon="refresh" loading={state.loading} onClick={state.reload}>
            刷新
          </Button>
        }
      />

      <Panel
        title={editing ? '调整管理员' : '新增管理员'}
        subtitle="用户必须先在主站存在；系统不会自动把普通用户提升为管理员，也不提供自助申请入口。"
      >
        <form className="admin-form" onSubmit={submit}>
          <Field label="用户 UUID" hint="从用户详情页复制用户 ID；请确认对方已完成邮箱验证" wide>
            <input
              value={userId}
              readOnly={Boolean(editing)}
              placeholder="00000000-0000-4000-8000-000000000000"
              onChange={(event) => setUserId(event.target.value)}
            />
          </Field>
          <Field label="角色">
            <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
              {ROLES.map((item) => (
                <option key={item} value={item}>
                  {roleLabels[item]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="状态">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as 'active' | 'suspended')}
            >
              <option value="active">启用</option>
              <option value="suspended">停用（立即失去后台访问）</option>
            </select>
          </Field>
          <Field label="显示名称" hint="用于审计日志与工单处理人">
            <input
              value={displayName}
              maxLength={60}
              placeholder="例如：小助手"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <Field label="操作理由" hint="会写入审计日志" wide>
            <input
              value={reason}
              maxLength={300}
              placeholder="例如：客服入职，需要处理工单"
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {formError && (
            <p className="field-error" role="alert">
              {formError}
            </p>
          )}
          <p className="field-hint">
            失败后保持本页用相同内容重试会复用同一操作编号；刷新页面后请先在审计日志确认是否已保存，再决定是否重发。
          </p>
          <div className="form-actions">
            <Button type="submit" icon={editing ? 'check' : 'plus'} loading={saving}>
              {editing ? '保存调整' : '添加管理员'}
            </Button>
            {editing && (
              <Button type="button" tone="ghost" onClick={reset}>
                取消编辑
              </Button>
            )}
          </div>
        </form>
        <SectionNote>
          管理台不能自动将任何人提升为 owner；首次 owner 必须由受信任的服务端脚本指定现有用户 UUID。
          撤权与停用会立即影响 API 校验，已登录页面会在下一次请求或会话巡检时退出。
        </SectionNote>
      </Panel>

      <Panel
        title="管理员列表"
        subtitle="状态与最后活动来自服务端记录"
        flush
        actions={
          state.loading && state.data ? <span className="panel-loading">更新中…</span> : undefined
        }
      >
        {state.error && !state.data ? (
          <StateView
            kind="error"
            title="管理员列表加载失败"
            description={<InlineError error={state.error} />}
            action={<Button onClick={state.reload}>重新加载</Button>}
          />
        ) : !state.data ? (
          <StateView kind="loading" />
        ) : rows.length === 0 ? (
          <StateView kind="empty" title="尚未初始化管理员" />
        ) : (
          <>
            {state.error ? <InlineError error={state.error} onRetry={state.reload} /> : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>管理员</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>加入时间</th>
                    <th>最近访问</th>
                    <th aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((member) => (
                    <tr key={member.user_id}>
                      <td>
                        <div className="identity-cell">
                          <span className="avatar-dot" aria-hidden="true">
                            {(member.display_name || '管').slice(0, 1)}
                          </span>
                          <span>
                            <strong>{member.display_name || '未命名管理员'}</strong>
                            <small>{member.email_masked || '无邮箱'}</small>
                            <small className="mono">{member.user_id}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <StatusPill tone={roleTone(member.role)}>
                          {roleLabels[member.role]}
                        </StatusPill>
                      </td>
                      <td>
                        <StatusPill tone={member.status === 'active' ? 'ok' : 'danger'}>
                          {member.status === 'active' ? '启用' : '停用'}
                        </StatusPill>
                      </td>
                      <td>{formatDateTime(member.created_at)}</td>
                      <td>{formatDateTime(member.last_seen_at)}</td>
                      <td>
                        <Button tone="ghost" size="sm" onClick={() => edit(member)}>
                          调整
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel title="角色能力对照" subtitle="前端仅隐藏入口；每个 API 都会独立校验能力">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>能力</th>
                {ROLES.map((item) => (
                  <th key={item} className="center">
                    {roleLabels[item]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_MATRIX.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  {ROLES.map((item) => (
                    <td key={item} className="center">
                      {row.roles[item] ? (
                        <span className="cap-yes" aria-label="允许">
                          ✓
                        </span>
                      ) : (
                        <span className="cap-no" aria-label="不允许">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SectionNote>
          角色能力由服务端 admin_capabilities 决定；表中为用户可理解的摘要。owner
          拥有全部能力与管理员管理权。
        </SectionNote>
      </Panel>
    </>
  )
}
