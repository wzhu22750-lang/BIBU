import { useAuth } from '../lib/auth'
import { routeHref } from '../lib/route'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { CoupleDetail } from '../lib/types'
import {
  detailStatusTone,
  formatDateTime,
  formatNumber,
  ticketCategoryLabels,
  ticketStatusLabels,
} from '../lib/format'
import { navigate, navigateQuery, type RouteState } from '../lib/route'
import { RangeControl } from '../components/RangeControl'
import {
  Button,
  DetailGrid,
  InlineError,
  PageHeader,
  Panel,
  StateView,
  StatusPill,
} from '../components/ui'
import { BackButton, useListRange } from './shared'

export function CoupleDetailPage({ route }: { route: RouteState }) {
  const auth = useAuth()
  const id = route.path.split('/')[2]
  const { from, to } = useListRange(route.params, 30, 92)
  const state = useApi(`couple:${id}:${from}:${to}`, (signal) =>
    api.get<CoupleDetail>(`/couples/${id}`, { from, to }, signal),
  )
  const detail = state.data

  return (
    <>
      <BackButton fallback="/couples" />
      <PageHeader
        eyebrow="空间详情"
        title={detail?.name || '双人空间'}
        description="空间资料、成员与互动统计；完整内容可从业务数据进入。"
        actions={
          <Button tone="secondary" icon="refresh" loading={state.loading} onClick={state.reload}>
            刷新
          </Button>
        }
      />

      {state.error && !detail ? (
        <StateView
          kind="error"
          title="空间详情加载失败"
          description={<InlineError error={state.error} />}
          action={<Button onClick={state.reload}>重新加载</Button>}
        />
      ) : !detail ? (
        <StateView kind="loading" />
      ) : (
        <>
          {auth.can('data.read') && (
            <nav className="context-links" aria-label="空间业务记录">
              {[
                ['messages', '聊天消息'],
                ['photos', '照片与回忆'],
                ['daily_task_completions', '任务回答'],
                ['pings', '互动提醒'],
                ['couples', '完整空间资料'],
              ].map(([entity, label]) => (
                <a key={entity} href={routeHref('/data', { entity, couple_id: id })}>
                  {label}
                  <span aria-hidden="true">→</span>
                </a>
              ))}
            </nav>
          )}
          <div className="toolbar">
            <RangeControl
              from={from}
              to={to}
              onChange={(nextFrom, nextTo) =>
                navigateQuery(route.path, route.params, { from: nextFrom, to: nextTo })
              }
              maxDays={92}
            />
            <p className="toolbar-note">
              统计窗口为北京时间 [{from} 00:00, {to} 次日 00:00)。
            </p>
          </div>

          <div className="metric-grid metric-grid-4">
            <article className="metric-card">
              <span className="metric-label">消息</span>
              <strong className="metric-value">{formatNumber(detail.stats.messages)}</strong>
              <p className="metric-foot">窗口内服务端写入条数，不含正文</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">提醒（ping）</span>
              <strong className="metric-value">{formatNumber(detail.stats.pings)}</strong>
              <p className="metric-foot">窗口内服务端写入次数</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">照片</span>
              <strong className="metric-value">{formatNumber(detail.stats.photos_in_range)}</strong>
              <p className="metric-foot">
                窗口内上传 · 累计 {formatNumber(detail.stats.photos_total)}
              </p>
            </article>
            <article className="metric-card">
              <span className="metric-label">双人任务</span>
              <strong className="metric-value">
                {formatNumber(detail.stats.tasks_double)} /{' '}
                {formatNumber(detail.stats.tasks_assigned)}
              </strong>
              <p className="metric-foot">
                双人各有完成 / 分配 · 单人完成 {formatNumber(detail.stats.tasks_single)}
              </p>
            </article>
          </div>

          <div className="split-grid">
            <Panel title="生命周期" subtitle="来自空间记录，不还原已删除历史">
              <DetailGrid
                columns={2}
                items={[
                  { label: '空间 ID', value: <span className="mono">{detail.id}</span> },
                  {
                    label: '状态',
                    value: detail.closed_at ? (
                      <StatusPill tone="muted">已封存</StatusPill>
                    ) : (
                      <StatusPill tone="ok">配对中</StatusPill>
                    ),
                  },
                  { label: '创建时间', value: formatDateTime(detail.created_at) },
                  { label: '封存时间', value: formatDateTime(detail.closed_at) },
                  { label: '在一起起始', value: detail.together_since || '未设置' },
                  { label: '成员数', value: `${detail.members.length} 人` },
                ]}
              />
            </Panel>

            <Panel title="最近活动" subtitle="服务端落库时间；不是在线状态">
              <DetailGrid
                columns={2}
                items={[
                  { label: '最近消息', value: formatDateTime(detail.last_activity.message_at) },
                  { label: '最近提醒', value: formatDateTime(detail.last_activity.ping_at) },
                  { label: '最近照片', value: formatDateTime(detail.last_activity.photo_at) },
                  { label: '最近任务', value: formatDateTime(detail.last_activity.task_at) },
                  {
                    label: '近 30 天推送失败',
                    value: formatNumber(detail.stats.push_failures_30d),
                  },
                  { label: '未解决工单', value: formatNumber(detail.stats.tickets_open) },
                ]}
              />
            </Panel>
          </div>

          <Panel title="成员" subtitle="不提供解除配对或替换成员的入口" flush>
            {detail.members.length === 0 ? (
              <StateView kind="empty" title="空间内没有成员记录" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>成员</th>
                      <th>席位</th>
                      <th>邮箱</th>
                      <th>账号创建</th>
                      <th>最近登录</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.members.map((member) => (
                      <tr
                        key={member.user_id}
                        className="row-link"
                        tabIndex={0}
                        onClick={() => navigate(`/users/${member.user_id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') navigate(`/users/${member.user_id}`)
                        }}
                      >
                        <td>
                          <div className="identity-cell">
                            <span className="avatar-dot" aria-hidden="true">
                              {member.name.slice(0, 1)}
                            </span>
                            <span>
                              <strong>{member.name}</strong>
                              <small className="mono">{member.user_id}</small>
                            </span>
                          </div>
                        </td>
                        <td>{member.slot + 1}</td>
                        <td>{member.email_masked || '无邮箱'}</td>
                        <td>{formatDateTime(member.created_at)}</td>
                        <td>{formatDateTime(member.last_sign_in_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="相关工单"
            subtitle="只含该空间成员提交的工单；工单正文仅在该工单详情中查看"
            flush
          >
            {detail.tickets.length === 0 ? (
              <StateView kind="empty" title="该空间没有工单" />
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
                        onClick={() => navigate(`/tickets/${ticket.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') navigate(`/tickets/${ticket.id}`)
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
        </>
      )}
    </>
  )
}
