import { useTicketDraft } from '../lib/ticketDraft'
import { useState, type FormEvent } from 'react'
import { ApiError, api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLogicalSubmission, withRequestId } from '../lib/idempotency'
import { useApi } from '../lib/useApi'
import type { AdminMember, TicketDetail, TicketStatus } from '../lib/types'
import {
  detailStatusTone,
  formatDateTime,
  ticketCategoryLabels,
  ticketStatusLabels,
} from '../lib/format'
import { navigate, type RouteState } from '../lib/route'
import {
  Button,
  CopyButton,
  DetailGrid,
  InlineError,
  PageHeader,
  Panel,
  SectionNote,
  StateView,
  StatusPill,
  useToast,
} from '../components/ui'
import { BackButton } from './shared'

const NEXT_STATUS: Record<TicketStatus, TicketStatus[]> = {
  pending: ['in_progress', 'waiting_user', 'resolved'],
  in_progress: ['waiting_user', 'resolved'],
  waiting_user: ['in_progress', 'resolved'],
  resolved: ['in_progress'],
}

export function TicketDetailPage({ route }: { route: RouteState }) {
  const auth = useAuth()
  const toast = useToast()
  const id = route.path.split('/')[2]
  const state = useApi(`ticket:${id}`, (signal) =>
    api.get<TicketDetail>(`/tickets/${id}`, undefined, signal),
  )
  const canWrite = auth.can('tickets.write')
  const canManageAdmins = auth.can('admins.manage')
  const adminsState = useApi(`ticket-admins:${canManageAdmins}`, (signal) =>
    canManageAdmins
      ? api.get<{ rows: AdminMember[] }>('/admins', undefined, signal)
      : Promise.resolve({ rows: [] as AdminMember[] }),
  )
  const { draft, setDraft, storageFailed } = useTicketDraft(auth.session!.actor.user_id, id)
  const replyBody = draft.body
  const replyReason = draft.reason
  const setReplyBody = (body: string) => setDraft((value) => ({ ...value, body }))
  const setReplyReason = (reason: string) => setDraft((value) => ({ ...value, reason }))
  const [composeMode, setComposeMode] = useState<'reply' | 'note'>('reply')
  const [noteBody, setNoteBody] = useState('')
  const [statusReason, setStatusReason] = useState('')
  const [assignReason, setAssignReason] = useState('')
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | ''>('')
  const [assignee, setAssignee] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const submission = useLogicalSubmission()

  async function run(
    action: string,
    payload: Record<string, unknown>,
    success: string,
  ): Promise<Record<string, unknown> | null> {
    if (busy || !state.data || state.loading) return null
    payload = { ...payload, expected_updated_at: state.data.updated_at }
    setBusy(action)
    setFormError('')
    try {
      const result = await api.post<Record<string, unknown>>(
        `/tickets/${id}/actions`,
        payload,
        submission.begin(payload),
      )
      submission.succeed()
      toast(withRequestId(success, result), 'success')
      state.reload()
      adminsState.reload()
      return result
    } catch (error) {
      if (error instanceof ApiError && error.code === 'conflict') {
        setFormError(
          '工单已更新或请求发生冲突。已刷新最新内容，请核对会话和状态后再提交；草稿已保留。',
        )
        state.reload()
      } else setFormError(errorMessage(error))
      return null
    } finally {
      setBusy(null)
    }
  }

  function submitReply(event: FormEvent) {
    event.preventDefault()
    if (replyBody.trim().length === 0) {
      setFormError('回复内容不能为空')
      return
    }
    void run(
      'reply',
      {
        action: 'reply',
        body: replyBody.trim(),
        reason: replyReason.trim() || undefined,
        status: draft.status,
      },
      draft.status === 'resolved' ? '回复已发送，工单已解决' : '回复已发送，正在等待用户',
    ).then((result) => {
      if (!result) return
      setDraft({ body: '', reason: '', status: 'waiting_user' })
    })
  }

  function submitNote(event: FormEvent) {
    event.preventDefault()
    if (noteBody.trim().length === 0) {
      setFormError('内部备注不能为空')
      return
    }
    void run(
      'note',
      { action: 'note', body: noteBody.trim() },
      '内部备注已保存（用户不可见）',
    ).then((result) => {
      if (result) setNoteBody('')
    })
  }

  function submitStatus(event: FormEvent) {
    event.preventDefault()
    if (!pendingStatus) {
      setFormError('请选择目标状态')
      return
    }
    if (statusReason.trim().length < 2) {
      setFormError('状态变更需填写至少 2 个字的理由')
      return
    }
    void run(
      'status',
      { action: 'status', status: pendingStatus, reason: statusReason.trim() },
      '工单状态已更新并写入审计',
    ).then((result) => {
      if (!result) return
      setStatusReason('')
      setPendingStatus('')
    })
  }

  function submitAssign(target?: string) {
    if (assignReason.trim().length < 2) {
      setFormError('指派工单需填写至少 2 个字的理由')
      return
    }
    const payload: Record<string, unknown> = {
      action: 'assign',
      reason: assignReason.trim(),
    }
    if (target) payload.assignee_id = target
    void run('assign', payload, '工单处理人已更新').then((result) => {
      if (!result) return
      setAssignReason('')
      setAssignee('')
    })
  }

  const detail = state.data

  return (
    <>
      <BackButton fallback="/tickets" />
      <PageHeader
        eyebrow="工单详情"
        title={detail ? `${detail.ticket_no} · ${detail.user_name}` : '反馈工单'}
        description="阅读反馈、回复用户并跟进处理进度。"
        actions={
          <Button tone="secondary" icon="refresh" loading={state.loading} onClick={state.reload}>
            刷新
          </Button>
        }
      />

      {state.error && !detail ? (
        <StateView
          kind="error"
          title="工单加载失败"
          description={<InlineError error={state.error} />}
          action={<Button onClick={state.reload}>重新加载</Button>}
        />
      ) : !detail ? (
        <StateView kind="loading" />
      ) : (
        <>
          <div className="ticket-layout">
            <div className="ticket-main">
              <Panel title="用户描述" subtitle="用户提交时的原始描述，不做自动改写">
                <p className="ticket-description">{detail.description}</p>
              </Panel>

              <Panel title="会话记录" subtitle="内部备注带明确标识，绝不会同步给用户">
                {detail.messages.length === 0 ? (
                  <StateView kind="empty" title="还没有会话消息" />
                ) : (
                  <ol className="thread">
                    {detail.messages.map((message) => (
                      <li
                        key={message.id}
                        className={`thread-item thread-${message.visibility} thread-author-${message.author_type}`}
                      >
                        <div className="thread-head">
                          <strong>{message.author_label}</strong>
                          <span>
                            {message.author_type === 'user'
                              ? '用户'
                              : message.author_type === 'admin'
                                ? '管理员'
                                : '系统'}
                            {message.visibility === 'internal' && (
                              <StatusPill tone="warn">内部备注 · 用户不可见</StatusPill>
                            )}
                          </span>
                          <time>{formatDateTime(message.created_at)}</time>
                        </div>
                        <p>{message.body}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </Panel>

              {canWrite && (
                <div className="ticket-composer">
                  <div className="view-tabs" role="group" aria-label="选择回复方式">
                    <button
                      className={composeMode === 'reply' ? 'active' : ''}
                      type="button"
                      aria-pressed={composeMode === 'reply'}
                      onClick={() => setComposeMode('reply')}
                    >
                      回复用户
                    </button>
                    <button
                      className={composeMode === 'note' ? 'active' : ''}
                      type="button"
                      aria-pressed={composeMode === 'note'}
                      onClick={() => setComposeMode('note')}
                    >
                      内部备注
                    </button>
                  </div>
                  {formError && (
                    <p className="inline-error" role="alert">
                      {formError}
                    </p>
                  )}
                  {composeMode === 'reply' && (
                    <Panel title="回复用户" subtitle="此内容会出现在用户的帮助与反馈中">
                      {detail.status === 'resolved' ? (
                        <SectionNote>
                          工单已解决，不能直接回复。请先在“处理动作”中把状态改为“处理中”。
                        </SectionNote>
                      ) : (
                        <form className="mini-form" onSubmit={submitReply}>
                          <fieldset
                            disabled={Boolean(busy) || state.loading}
                            className="reply-fields"
                          >
                            <SectionNote>
                              {storageFailed
                                ? '浏览器无法保存草稿，请保持此页打开。'
                                : '草稿仅保存在当前标签页，24 小时内可恢复；退出登录时清除。'}
                            </SectionNote>
                            <label className="field">
                              <span className="field-label">回复内容</span>
                              <textarea
                                rows={4}
                                maxLength={2000}
                                value={replyBody}
                                placeholder="说明处理结果或需要用户补充的信息"
                                onChange={(event) => setReplyBody(event.target.value)}
                              />
                              <span className="field-hint">{replyBody.trim().length} / 2000</span>
                            </label>
                            <label className="field">
                              <span className="field-label">操作理由（可选，留空使用默认）</span>
                              <input
                                value={replyReason}
                                maxLength={300}
                                onChange={(event) => setReplyReason(event.target.value)}
                              />
                            </label>
                            <label className="field">
                              <span className="field-label">发送后状态</span>
                              <select
                                value={draft.status}
                                onChange={(event) =>
                                  setDraft((value) => ({
                                    ...value,
                                    status: event.target.value as 'waiting_user' | 'resolved',
                                  }))
                                }
                              >
                                <option value="waiting_user">等待用户回复</option>
                                <option value="resolved">已解决</option>
                              </select>
                            </label>
                            <Button
                              type="submit"
                              icon="check"
                              loading={busy === 'reply'}
                              disabled={!replyBody.trim()}
                            >
                              {draft.status === 'resolved' ? '回复并解决' : '回复并等待用户'}
                            </Button>
                          </fieldset>
                        </form>
                      )}
                    </Panel>
                  )}

                  {composeMode === 'note' && (
                    <Panel title="内部备注" subtitle="仅管理台可见，不发送给用户">
                      <form className="mini-form" onSubmit={submitNote}>
                        <label className="field">
                          <span className="field-label">备注内容</span>
                          <textarea
                            rows={4}
                            maxLength={2000}
                            value={noteBody}
                            placeholder="例如：与推送诊断的 request_id 关联，等待个推回执"
                            onChange={(event) => setNoteBody(event.target.value)}
                          />
                          <span className="field-hint">{noteBody.trim().length} / 2000</span>
                        </label>
                        <Button
                          type="submit"
                          tone="secondary"
                          icon="lock"
                          loading={busy === 'note'}
                        >
                          保存内部备注
                        </Button>
                      </form>
                    </Panel>
                  )}
                </div>
              )}
            </div>
            <aside className="ticket-sidebar">
              <Panel title="工单信息">
                <DetailGrid
                  columns={2}
                  items={[
                    {
                      label: '状态',
                      value: (
                        <StatusPill tone={detailStatusTone(detail.status)}>
                          {ticketStatusLabels[detail.status]}
                        </StatusPill>
                      ),
                    },
                    { label: '分类', value: ticketCategoryLabels[detail.category] },
                    { label: '处理人', value: detail.assignee_name || '未指派' },
                    { label: '创建时间', value: formatDateTime(detail.created_at) },
                    { label: '最近更新', value: formatDateTime(detail.updated_at) },
                    { label: '解决时间', value: formatDateTime(detail.resolved_at) },
                    {
                      label: '用户',
                      value: (
                        <button
                          type="button"
                          className="inline-link"
                          onClick={() => navigate(`/users/${detail.user_id}`)}
                        >
                          {detail.user_name} · {detail.email_masked || '无邮箱'}
                        </button>
                      ),
                    },
                    {
                      label: '关联空间',
                      value: detail.couple_id ? (
                        <button
                          type="button"
                          className="inline-link"
                          onClick={() => navigate(`/couples/${detail.couple_id}`)}
                        >
                          {detail.couple_id}
                        </button>
                      ) : (
                        '未关联'
                      ),
                    },
                    {
                      label: '客户端',
                      value:
                        [detail.client_platform, detail.client_app_version]
                          .filter(Boolean)
                          .join(' · ') || '未上报',
                    },
                    {
                      label: '工单 ID',
                      value: (
                        <span className="copy-row">
                          <span className="mono">{detail.id}</span>
                          <CopyButton value={detail.id} label="复制" />
                        </span>
                      ),
                    },
                  ]}
                />
              </Panel>

              <Panel
                title="处理动作"
                subtitle={
                  canWrite ? '调整工单状态或指定处理人' : '当前角色只能查看，不能回复或变更状态'
                }
              >
                {canWrite ? (
                  <div className="action-stack">
                    <form className="mini-form" onSubmit={submitStatus}>
                      <label className="field">
                        <span className="field-label">变更状态</span>
                        <select
                          value={pendingStatus}
                          onChange={(event) =>
                            setPendingStatus(event.target.value as TicketStatus | '')
                          }
                        >
                          <option value="">选择目标状态</option>
                          {NEXT_STATUS[detail.status].map((next) => (
                            <option key={next} value={next}>
                              {ticketStatusLabels[next]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span className="field-label">变更理由</span>
                        <input
                          value={statusReason}
                          maxLength={300}
                          placeholder="例如：已确认问题并给出修复时间"
                          onChange={(event) => setStatusReason(event.target.value)}
                        />
                      </label>
                      <Button type="submit" size="sm" loading={busy === 'status'}>
                        更新状态
                      </Button>
                    </form>

                    <form
                      className="mini-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        submitAssign(assignee || undefined)
                      }}
                    >
                      <label className="field">
                        <span className="field-label">指派处理人</span>
                        {canManageAdmins ? (
                          <select
                            value={assignee}
                            onChange={(event) => setAssignee(event.target.value)}
                          >
                            <option value="">指派给我自己</option>
                            {(adminsState.data?.rows || [])
                              .filter(
                                (admin) =>
                                  admin.status === 'active' &&
                                  admin.user_id !== detail.assigned_admin_id,
                              )
                              .map((admin) => (
                                <option key={admin.user_id} value={admin.user_id}>
                                  {admin.display_name || '管理员'} · {admin.user_id}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <span className="muted">当前角色只能指派给自己</span>
                        )}
                      </label>
                      <label className="field">
                        <span className="field-label">指派理由</span>
                        <input
                          value={assignReason}
                          maxLength={300}
                          placeholder="说明为什么由该管理员处理"
                          onChange={(event) => setAssignReason(event.target.value)}
                        />
                      </label>
                      <Button type="submit" size="sm" tone="secondary" loading={busy === 'assign'}>
                        确认指派
                      </Button>
                    </form>

                    {formError && (
                      <p className="field-error" role="alert">
                        {formError}
                      </p>
                    )}
                    <p className="field-hint">
                      提交失败时会保留输入；如结果不明确，可先查看操作日志。
                    </p>
                  </div>
                ) : (
                  <SectionNote>客服或运营角色可回复与处理工单。</SectionNote>
                )}
              </Panel>
            </aside>
          </div>
        </>
      )}
    </>
  )
}
