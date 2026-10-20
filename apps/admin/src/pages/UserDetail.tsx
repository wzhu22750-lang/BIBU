import { useState, type FormEvent } from 'react'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLogicalSubmission, withRequestId } from '../lib/idempotency'
import { useApi } from '../lib/useApi'
import type { UserDetail } from '../lib/types'
import {
  accountStatusLabels,
  detailStatusTone,
  formatDateTime,
  formatNumber,
  stageLabels,
  ticketCategoryLabels,
  ticketStatusLabels,
} from '../lib/format'
import type { RouteState } from '../lib/route'
import {
  Button,
  CopyButton,
  DetailGrid,
  InlineError,
  Panel,
  PageHeader,
  PrivacyNote,
  SectionNote,
  StateView,
  StatusPill,
  useToast,
} from '../components/ui'
import { BackButton } from './shared'

export function UserDetailPage({ route }: { route: RouteState }) {
  const auth = useAuth()
  const toast = useToast()
  const userId = route.path.split('/')[2]
  const state = useApi(`user:${userId}`, (signal) =>
    api.get<UserDetail>(`/users/${userId}`, undefined, signal),
  )
  const canWriteNotes = auth.can('users.notes.write')
  const [body, setBody] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const submission = useLogicalSubmission()

  async function submitNote(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (body.trim().length < 2) {
      setFormError('备注至少 2 个字')
      return
    }
    if (reason.trim().length < 2) {
      setFormError('请填写至少 2 个字的操作理由')
      return
    }
    setSaving(true)
    setFormError('')
    const payload = { body: body.trim(), reason: reason.trim() }
    try {
      const result = await api.post<Record<string, unknown>>(
        `/users/${userId}/notes`,
        payload,
        submission.begin(payload),
      )
      submission.succeed()
      toast(withRequestId('备注已保存，并写入审计日志', result), 'success')
      setBody('')
      setReason('')
      state.reload()
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <BackButton fallback="/users" />
      <PageHeader
        eyebrow="用户详情"
        title={state.data?.name || '用户'}
        description="账号、配对空间、设备与客服备注。此页不展示聊天正文、任务答案、照片原图或完整推送 Token。"
        actions={
          <Button tone="secondary" icon="refresh" loading={state.loading} onClick={state.reload}>
            刷新
          </Button>
        }
      />

      {state.error && !state.data ? (
        <StateView
          kind="error"
          title="用户详情加载失败"
          description={<InlineError error={state.error} />}
          action={<Button onClick={state.reload}>重新加载</Button>}
        />
      ) : !state.data ? (
        <StateView kind="loading" />
      ) : (
        <UserDetailBody detail={state.data} />
      )}

      {state.data && (
        <Panel
          title="管理员备注"
          subtitle="仅管理员可见；用户端不会看到备注内容。每条备注都会记录操作者、理由与时间。"
        >
          {canWriteNotes ? (
            <form className="note-form" onSubmit={submitNote}>
              <label className="field">
                <span className="field-label">备注内容</span>
                <textarea
                  value={body}
                  rows={3}
                  maxLength={2000}
                  placeholder="例如：已定位推送失败原因，等待用户重新打开 App 注册设备"
                  onChange={(event) => setBody(event.target.value)}
                />
                <span className="field-hint">{body.trim().length} / 2000</span>
              </label>
              <label className="field">
                <span className="field-label">操作理由</span>
                <input
                  value={reason}
                  maxLength={300}
                  placeholder="为什么现在写这条备注"
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              {formError && (
                <p className="field-error" role="alert">
                  {formError}
                </p>
              )}
              <p className="field-hint">
                失败后保持本页用相同内容重试会复用同一操作编号；刷新页面后请先在审计日志确认是否已保存，再决定是否重发。
              </p>
              <Button type="submit" icon="plus" loading={saving}>
                添加备注
              </Button>
            </form>
          ) : (
            <SectionNote>当前角色只读，无法添加备注。</SectionNote>
          )}

          {state.data.notes.length === 0 ? (
            <StateView
              kind="empty"
              title="还没有备注"
              description="客服记录的处理信息会显示在这里。"
            />
          ) : (
            <ul className="note-list">
              {state.data.notes.map((note) => (
                <li key={note.id}>
                  <div className="note-head">
                    <strong>{note.author_label}</strong>
                    <time>{formatDateTime(note.created_at)}</time>
                  </div>
                  <p>{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  )
}

function UserDetailBody({ detail }: { detail: UserDetail }) {
  return (
    <>
      {detail.account_status === 'deletion_pending' && (
        <div className="notice notice-warn" role="status">
          该账号存在待完成的注销任务。注销流程属于高风险操作，后台不提供直接删除按钮。
        </div>
      )}
      {detail.account_status === 'banned' && (
        <div className="notice notice-danger" role="status">
          该账号当前处于封禁状态。本管理台不提供解封或改密操作。
        </div>
      )}

      <div className="split-grid">
        <Panel title="账号" subtitle="邮箱与身份均由服务端账号记录派生">
          <DetailGrid
            items={[
              { label: '昵称', value: detail.name },
              { label: '掩码邮箱', value: detail.email_masked || '无邮箱（微信或匿名）' },
              {
                label: '邮箱验证',
                value: detail.email_confirmed ? '已验证' : '未验证',
              },
              {
                label: '账号状态',
                value: (
                  <StatusPill tone={detailStatusTone(detail.account_status)}>
                    {accountStatusLabels[detail.account_status]}
                  </StatusPill>
                ),
              },
              { label: '注册时间', value: formatDateTime(detail.created_at) },
              { label: '最近登录', value: formatDateTime(detail.last_sign_in_at) },
              {
                label: '用户 ID',
                value: (
                  <span className="copy-row">
                    <span className="mono">{detail.user_id}</span>
                    <CopyButton value={detail.user_id} label="复制 ID" />
                  </span>
                ),
                wide: true,
              },
            ]}
          />
        </Panel>

        <Panel
          title="配对空间"
          subtitle="只显示关系与成员，不展示空间内私密内容"
          actions={
            detail.couple ? (
              <Button
                tone="ghost"
                size="sm"
                onClick={() => {
                  window.location.hash = `#/couples/${detail.couple!.id}`
                }}
              >
                查看空间
              </Button>
            ) : undefined
          }
        >
          {detail.couple ? (
            <div className="couple-summary">
              <DetailGrid
                columns={2}
                items={[
                  { label: '空间名称', value: detail.couple.name },
                  {
                    label: '空间 ID',
                    value: <span className="mono">{detail.couple.id.slice(0, 8)}…</span>,
                  },
                  { label: '创建时间', value: formatDateTime(detail.couple.created_at) },
                  {
                    label: '状态',
                    value: detail.couple.closed_at ? (
                      <StatusPill tone="muted">已封存</StatusPill>
                    ) : (
                      <StatusPill tone="ok">配对中</StatusPill>
                    ),
                  },
                ]}
              />
              <div className="member-list">
                {detail.couple.members.map((member) => (
                  <div key={member.user_id} className="member-row">
                    <span className="avatar-dot" aria-hidden="true">
                      {member.name.slice(0, 1)}
                    </span>
                    <span>
                      <strong>{member.name}</strong>
                      <small>
                        席位 {member.slot + 1} · {member.email_masked || '无邮箱'}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <StateView kind="empty" title="尚未配对" description="该用户目前不在任何双人空间中。" />
          )}
        </Panel>
      </div>

      <div className="split-grid">
        <Panel title="设备" subtitle="Token 只显示末尾 6 位；用于判断设备是否仍在上报" flush>
          {detail.devices.length === 0 ? (
            <StateView
              kind="empty"
              title="没有登记设备"
              description="用户打开 App 并授权通知后会登记设备。"
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>平台</th>
                    <th>版本</th>
                    <th>Token 末尾</th>
                    <th>最近上报</th>
                    <th>最近推送阶段</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.devices.map((device) => (
                    <tr key={device.id}>
                      <td>{device.platform}</td>
                      <td>{device.app_version || '未知'}</td>
                      <td className="mono">…{device.token_suffix}</td>
                      <td>{formatDateTime(device.last_seen_at)}</td>
                      <td>
                        {device.last_delivery_stage
                          ? stageLabels[device.last_delivery_stage] || device.last_delivery_stage
                          : '无诊断记录'}
                        {device.last_delivery_at && (
                          <small className="block-muted">
                            {formatDateTime(device.last_delivery_at)}
                          </small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="近 30 天通知诊断" subtitle="服务端写入统计，不代表客户端已收到">
          <DetailGrid
            columns={2}
            items={[
              { label: '尝试次数', value: formatNumber(detail.diagnostics_30d.attempts) },
              { label: '失败次数', value: formatNumber(detail.diagnostics_30d.failures) },
            ]}
          />
          <SectionNote>
            失败仅包含个推拒绝与无效设备。客户端送达与用户打开回执尚未采集。
          </SectionNote>
          {detail.deletion_job && (
            <p className="block-muted">
              注销任务状态：{detail.deletion_job.status} · 准备于{' '}
              {formatDateTime(detail.deletion_job.prepared_at)}
            </p>
          )}
        </Panel>
      </div>

      <Panel title="相关反馈工单" subtitle="最近 10 条，不包含其他用户工单" flush>
        {detail.tickets.length === 0 ? (
          <StateView kind="empty" title="该用户还没有工单" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>工单号</th>
                  <th>分类</th>
                  <th>状态</th>
                  <th>创建</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {detail.tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="row-link"
                    tabIndex={0}
                    onClick={() => {
                      window.location.hash = `#/tickets/${ticket.id}`
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') window.location.hash = `#/tickets/${ticket.id}`
                    }}
                  >
                    <td className="mono">{ticket.ticket_no}</td>
                    <td>{ticketCategoryLabels[ticket.category]}</td>
                    <td>
                      <StatusPill tone={detailStatusTone(ticket.status)}>
                        {ticketStatusLabels[ticket.status]}
                      </StatusPill>
                    </td>
                    <td>{formatDateTime(ticket.created_at)}</td>
                    <td>{formatDateTime(ticket.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <PrivacyNote>
        页面不返回聊天正文、任务答案、照片路径或签名地址、邀请码、空间寄语，也不提供修改账号资料或强制解绑的能力。
      </PrivacyNote>
    </>
  )
}
