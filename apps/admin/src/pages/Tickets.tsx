import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { Paged, TicketRow } from '../lib/types'
import {
  detailStatusTone,
  formatDateTime,
  formatNumber,
  ticketCategoryLabels,
  ticketStatusLabels,
} from '../lib/format'
import { detailHref, navigateQuery, type RouteState } from '../lib/route'
import {
  Button,
  InlineError,
  PageHeader,
  Pagination,
  Panel,
  StateView,
  StatusPill,
} from '../components/ui'

const STATUSES = [
  { value: 'open', label: '未解决（默认）' },
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'in_progress', label: '处理中' },
  { value: 'waiting_user', label: '等待用户' },
  { value: 'resolved', label: '已解决' },
] as const
const CATEGORIES = [
  { value: 'all', label: '全部分类' },
  { value: 'bug', label: '故障' },
  { value: 'account', label: '账号' },
  { value: 'notification', label: '通知' },
  { value: 'data', label: '数据' },
  { value: 'privacy', label: '隐私' },
  { value: 'other', label: '其他' },
] as const
const VIEWS = [
  { value: 'all', label: '全部工单' },
  { value: 'mine', label: '我的工单' },
  { value: 'unassigned', label: '未指派' },
  { value: 'user_replied', label: '用户有新回复' },
] as const
const SORTS = [
  { value: 'waiting_asc', label: '等待回复最久' },
  { value: 'updated_desc', label: '最近更新' },
  { value: 'created_desc', label: '最近创建' },
] as const

export function TicketsPage({ route }: { route: RouteState }) {
  const params = route.params
  const page = Math.max(1, Number(params.get('page') || '1') || 1)
  const status = STATUSES.some((item) => item.value === params.get('status'))
    ? (params.get('status') as string)
    : 'open'
  const category = CATEGORIES.some((item) => item.value === params.get('category'))
    ? (params.get('category') as string)
    : 'all'
  const sort = SORTS.some((item) => item.value === params.get('sort'))
    ? (params.get('sort') as string)
    : 'updated_desc'
  const view = VIEWS.some((item) => item.value === params.get('view')) ? params.get('view')! : 'all'
  const query = params.get('query') || ''
  const [draftQuery, setDraftQuery] = useState(query)

  useEffect(() => setDraftQuery(query), [query])

  const apiQuery = { view, status, category, sort, query, page, page_size: 20 }
  const state = useApi(`tickets:${JSON.stringify(apiQuery)}`, (signal) =>
    api.get<Paged<TicketRow>>('/tickets', apiQuery, signal),
  )

  function update(updates: Record<string, string | number | null | undefined>) {
    navigateQuery('/tickets', params, { ...updates, page: updates.page ?? 1 })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    update({ query: draftQuery.trim() })
  }

  const data = state.data

  return (
    <>
      <PageHeader
        eyebrow="反馈工单"
        title="工单处理"
        description="集中处理用户反馈，跟进等待回复的事项。"
        actions={
          <Button tone="secondary" icon="refresh" loading={state.loading} onClick={state.reload}>
            刷新
          </Button>
        }
      />

      <Panel flush className="filter-panel">
        <form className="filter-toolbar" onSubmit={submit}>
          <div className="search-line">
            <label className="input-with-icon">
              <span className="visually-hidden">搜索工单</span>
              <input
                type="search"
                value={draftQuery}
                maxLength={100}
                placeholder="工单号、摘要或用户 ID"
                onChange={(event) => setDraftQuery(event.target.value)}
              />
            </label>
            <Button type="submit" icon="search">
              搜索
            </Button>
            {query && (
              <Button
                type="button"
                tone="ghost"
                onClick={() => {
                  setDraftQuery('')
                  update({ query: null })
                }}
              >
                清除搜索
              </Button>
            )}
          </div>
          <div className="filter-line">
            <label className="select-field">
              <span>待办视图</span>
              <select value={view} onChange={(event) => update({ view: event.target.value })}>
                {VIEWS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>状态</span>
              <select value={status} onChange={(event) => update({ status: event.target.value })}>
                {STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>分类</span>
              <select
                value={category}
                onChange={(event) => update({ category: event.target.value })}
              >
                {CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>排序</span>
              <select value={sort} onChange={(event) => update({ sort: event.target.value })}>
                {SORTS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </form>
      </Panel>

      <Panel
        title="工单列表"
        subtitle={
          data
            ? `共 ${formatNumber(data.total)} 个工单 · 第 ${data.page} 页 · 每页 ${data.page_size} 条`
            : '正在读取工单列表'
        }
        flush
        actions={state.loading && data ? <span className="panel-loading">更新中…</span> : undefined}
      >
        {state.error && !data ? (
          <StateView
            kind="error"
            title="工单列表加载失败"
            description={<InlineError error={state.error} />}
            action={<Button onClick={state.reload}>重新加载</Button>}
          />
        ) : !data ? (
          <StateView kind="loading" />
        ) : data.rows.length === 0 ? (
          <StateView
            kind="empty"
            title="没有符合条件的工单"
            description="用户从设置页提交反馈后会出现在这里。"
          />
        ) : (
          <>
            {state.error ? <InlineError error={state.error} onRetry={state.reload} /> : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>工单</th>
                    <th>用户</th>
                    <th>分类</th>
                    <th>状态</th>
                    <th>处理人</th>
                    <th>摘要</th>
                    <th>等待回复</th>
                    <th>更新</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((ticket) => (
                    <tr key={ticket.id}>
                      <td className="mono">
                        <a
                          className="inline-link"
                          href={detailHref(`/tickets/${ticket.id}`, route)}
                        >
                          {ticket.ticket_no}
                        </a>
                      </td>
                      <td>
                        <div className="identity-cell">
                          <span className="avatar-dot" aria-hidden="true">
                            {ticket.user_name.slice(0, 1)}
                          </span>
                          <span>
                            <strong>{ticket.user_name}</strong>
                            <small>{ticket.email_masked || '无邮箱'}</small>
                          </span>
                        </div>
                      </td>
                      <td>{ticketCategoryLabels[ticket.category]}</td>
                      <td>
                        <StatusPill tone={detailStatusTone(ticket.status)}>
                          {ticketStatusLabels[ticket.status]}
                          {ticket.user_replied ? ' · 有新回复' : ''}
                        </StatusPill>
                      </td>
                      <td>{ticket.assignee_name || '未指派'}</td>
                      <td className="text-truncate">{ticket.excerpt}</td>
                      <td>
                        {ticket.waiting_since ? (
                          <>
                            <span>{waitingLabel(ticket.waiting_since)}</span>
                            <small className="block-muted">
                              自 {formatDateTime(ticket.waiting_since)}
                            </small>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{formatDateTime(ticket.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              onChange={(next) => navigateQuery('/tickets', params, { page: next })}
            />
          </>
        )}
      </Panel>
    </>
  )
}

function waitingLabel(since: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 60000))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours} 小时` : `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`
}
