import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react'
import { Capacitor } from '@capacitor/core'
import { Button, useTask, useToast } from './ui'
import { Icon } from './PixelArt'
import { db, errorText } from '../lib/supabase'
import {
  SupportTicketDetailController,
  type SupportTicketDetail,
  type SupportTicketStatus,
} from '../lib/supportTicketDetail'
import './SupportFeedback.css'

type Category = 'bug' | 'account' | 'notification' | 'data' | 'privacy' | 'other'

type TicketSummary = {
  id: string
  ticket_no: string
  category: Category
  status: SupportTicketStatus
  created_at: string
  updated_at: string
  resolved_at: string | null
  excerpt: string
  reply_count: number
}

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: 'bug', label: '故障 / 报错' },
  { value: 'account', label: '账号与登录' },
  { value: 'notification', label: '消息与提醒' },
  { value: 'data', label: '数据与导出' },
  { value: 'privacy', label: '隐私与安全' },
  { value: 'other', label: '其他问题' },
]

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  pending: '待处理',
  in_progress: '处理中',
  waiting_user: '等待你的回复',
  resolved: '已解决',
}

function formatTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function SupportFeedback() {
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [category, setCategory] = useState<Category>('bug')
  const [description, setDescription] = useState('')
  const { busy, run } = useTask()
  const toast = useToast()
  const createOperation = useRef<{ key: string; fingerprint: string } | null>(null)
  const controllerRef = useRef<SupportTicketDetailController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new SupportTicketDetailController({
      load: async (ticketId) => {
        const { data, error } = await db().rpc('my_support_ticket', { p_ticket_id: ticketId })
        if (error) throw error
        if (!data) throw new Error('工单不存在或不属于当前账号')
        return data as SupportTicketDetail
      },
      reply: async (ticketId, body, idempotencyKey) => {
        const { data, error } = await db().rpc('reply_my_support_ticket_v2', {
          p_idempotency_key: idempotencyKey,
          p_ticket_id: ticketId,
          p_body: body,
        })
        if (error) throw error
        if (!data) throw new Error('回复未返回工单内容，请刷新后确认')
        return data as SupportTicketDetail
      },
      createIdempotencyKey: () => crypto.randomUUID(),
      describeError: errorText,
    })
  }
  const controller = controllerRef.current
  const detailState = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  )

  const loadTickets = useCallback(async () => {
    setListLoading(true)
    setListError('')
    try {
      const { data, error } = await db().rpc('my_support_tickets')
      if (error) throw error
      setTickets((data as TicketSummary[] | null) || [])
    } catch (error) {
      setListError(errorText(error))
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  function openTicket(id: string) {
    void controller.toggle(id)
  }

  function submitTicket(event: FormEvent) {
    event.preventDefault()
    const body = description.trim()
    if (body.length < 10) {
      toast('请至少描述 10 个字，方便我们定位问题', true)
      return
    }
    const fingerprint = `${category}|${body}`
    if (!createOperation.current || createOperation.current.fingerprint !== fingerprint) {
      createOperation.current = { key: crypto.randomUUID(), fingerprint }
    }
    const idempotencyKey = createOperation.current.key
    void run(async () => {
      const { data, error } = await db().rpc('create_support_ticket_v2', {
        p_idempotency_key: idempotencyKey,
        p_category: category,
        p_description: body,
        p_app_version: /^[A-Za-z0-9._-]{1,40}$/.test(__BIBU_BUILD__.commit)
          ? __BIBU_BUILD__.commit
          : 'unknown',
        p_platform:
          Capacitor.getPlatform() === 'android'
            ? 'android'
            : Capacitor.getPlatform() === 'ios'
              ? 'ios'
              : 'web',
      })
      if (error) throw error
      createOperation.current = null
      setDescription('')
      const created = (data as SupportTicketDetail | null) || null
      if (created) controller.showCreated(created)
      toast('反馈已提交，可在下方查看处理进度')
      await loadTickets()
    })
  }

  function submitReply(event: FormEvent) {
    event.preventDefault()
    const ticketId = detailState.openId
    if (!ticketId) return
    const body = (detailState.drafts[ticketId] || '').trim()
    if (!body) {
      toast('请输入回复内容', true)
      return
    }
    void controller.submitReply(ticketId, body).then(async (ok) => {
      if (!ok) return
      toast('已回复，客服会在处理后同步进展')
      await loadTickets()
    })
  }

  return (
    <div className="retro-cartridge support-cartridge">
      <div className="retro-window-bar bar-green">
        <span className="micro">
          <i className="sq" /> HELP DESK · 帮助与反馈
        </span>
        <div className="dots">■ ■ ■</div>
      </div>
      <div className="retro-cartridge-body support-body">
        <p className="support-lead">
          遇到故障、账号或提醒问题，可以在这里留言。客服能看到你提交的内容与处理记录，但不会看到聊天正文、照片或密码。
        </p>

        <form className="support-form" onSubmit={submitTicket}>
          <div className="support-form-top">
            <label>
              问题分类
              <select
                value={category}
                disabled={busy}
                onChange={(event) => setCategory(event.target.value as Category)}
              >
                {CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <span className={`support-counter ${description.trim().length > 2000 ? 'over' : ''}`}>
              {description.trim().length} / 2000
            </span>
          </div>
          <label>
            发生了什么
            <textarea
              rows={4}
              minLength={10}
              maxLength={2000}
              value={description}
              disabled={busy}
              placeholder="请描述出现问题的页面、操作步骤和大致时间；涉及提醒问题时，请说明是否只在某台设备上出现。"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <p className="support-privacy">
            <Icon name="lock" size={12} />
            提交时会附带应用版本与平台类型，用于定位问题。不会自动上传聊天内容、照片、密码或完整推送凭据。
          </p>
          <p className="support-retry-note">
            提交失败时，保持本页用相同内容重试会复用同一操作编号；刷新页面后请先刷新列表，确认是否已经提交，再决定是否重发。
          </p>
          <Button tone="green" type="submit" disabled={busy || description.trim().length < 10}>
            <Icon name="send" size={14} />
            {busy ? '正在提交…' : '提交反馈'}
          </Button>
        </form>

        <div className="support-history">
          <div className="support-history-head">
            <strong>我的反馈</strong>
            <button
              type="button"
              className="support-refresh"
              disabled={listLoading}
              onClick={() => void loadTickets()}
            >
              <Icon name="undo" size={12} />
              {listLoading ? '读取中…' : '刷新'}
            </button>
          </div>

          {listError ? (
            <div className="support-error" role="alert">
              <span>{listError}</span>
              <button type="button" onClick={() => void loadTickets()}>
                重试
              </button>
            </div>
          ) : listLoading && tickets.length === 0 ? (
            <p className="support-empty">正在读取你的反馈记录…</p>
          ) : tickets.length === 0 ? (
            <p className="support-empty">
              还没有提交过反馈。遇到问题时，写下发生时间与操作步骤，会更容易定位。
            </p>
          ) : (
            <ul className="support-ticket-list">
              {tickets.map((ticket) => {
                const isOpen = detailState.openId === ticket.id
                const activeDetail =
                  isOpen && detailState.detail?.id === ticket.id ? detailState.detail : null
                const detailError = isOpen ? detailState.error : ''
                const draft = detailState.drafts[ticket.id] || ''
                const submitError = detailState.submitErrors[ticket.id] || ''
                return (
                  <li key={ticket.id} className={isOpen ? 'support-ticket open' : 'support-ticket'}>
                    <button
                      type="button"
                      className="support-ticket-head"
                      aria-expanded={isOpen}
                      onClick={() => openTicket(ticket.id)}
                    >
                      <span className="support-ticket-title">
                        <span className="mono">{ticket.ticket_no}</span>
                        <span className={`support-status status-${ticket.status}`}>
                          {STATUS_LABELS[ticket.status]}
                        </span>
                      </span>
                      <span className="support-ticket-meta">
                        {CATEGORIES.find((item) => item.value === ticket.category)?.label ||
                          '其他问题'}
                        {' · '}
                        {formatTime(ticket.updated_at)}
                        {ticket.reply_count > 0 ? ` · ${ticket.reply_count} 条可见消息` : ''}
                      </span>
                      <span className="support-ticket-excerpt">{ticket.excerpt}</span>
                      <span className="support-chevron" aria-hidden="true">
                        {isOpen ? '▴' : '▾'}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="support-detail">
                        {detailError ? (
                          <div className="support-error" role="alert">
                            <span>{detailError}</span>
                            <button type="button" onClick={() => void controller.reload(ticket.id)}>
                              重新读取
                            </button>
                          </div>
                        ) : detailState.loading || !activeDetail ? (
                          <p className="support-empty">正在读取工单详情…</p>
                        ) : (
                          <>
                            <div className="support-detail-meta">
                              <span>提交于 {formatTime(activeDetail.created_at)}</span>
                              {activeDetail.resolved_at && (
                                <span>解决于 {formatTime(activeDetail.resolved_at)}</span>
                              )}
                            </div>
                            <p className="support-description">{activeDetail.description}</p>

                            {activeDetail.messages.length === 0 ? (
                              <p className="support-empty">
                                客服尚未回复。你提交的新回复会补充到这条工单中。
                              </p>
                            ) : (
                              <ol className="support-thread">
                                {activeDetail.messages.map((message) => (
                                  <li
                                    key={message.id}
                                    className={`support-message from-${message.author_type}`}
                                  >
                                    <div className="support-message-head">
                                      <strong>
                                        {message.author_type === 'user'
                                          ? '我'
                                          : message.author_type === 'admin'
                                            ? 'BIBU 客服'
                                            : '系统'}
                                      </strong>
                                      <time>{formatTime(message.created_at)}</time>
                                    </div>
                                    <p>{message.body}</p>
                                  </li>
                                ))}
                              </ol>
                            )}

                            {activeDetail.status === 'resolved' ? (
                              <p className="support-resolved-note">
                                这条反馈已解决并关闭。如果问题再次出现，请提交一条新的反馈。
                              </p>
                            ) : (
                              <form className="support-reply" onSubmit={submitReply}>
                                <label>
                                  补充说明
                                  <textarea
                                    rows={3}
                                    maxLength={2000}
                                    value={draft}
                                    disabled={Boolean(detailState.submittingId)}
                                    placeholder="补充复现步骤、设备型号或客服需要的信息"
                                    onChange={(event) =>
                                      controller.setDraft(ticket.id, event.target.value)
                                    }
                                  />
                                </label>
                                {submitError && (
                                  <p className="support-submit-error" role="alert">
                                    {submitError}
                                  </p>
                                )}
                                <Button
                                  tone="white"
                                  type="submit"
                                  disabled={Boolean(detailState.submittingId) || !draft.trim()}
                                >
                                  <Icon name="send" size={13} />
                                  {detailState.submittingId === ticket.id
                                    ? '正在发送…'
                                    : '回复这条反馈'}
                                </Button>
                              </form>
                            )}
                            <p className="support-retry-note">
                              提交失败时，保持本页用相同内容重试会复用同一操作编号；刷新页面后请先刷新列表，确认是否已经提交，再决定是否重发。
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
