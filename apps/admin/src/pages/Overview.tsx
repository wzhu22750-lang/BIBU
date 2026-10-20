import { useState } from 'react'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { OverviewData, RecentFailure, RecentTicket } from '../lib/types'
import {
  deliveryStatusLabels,
  detailStatusTone,
  formatDateTime,
  formatNumber,
  formatPercent,
  percentChange,
  rateChange,
  ticketCategoryLabels,
  ticketStatusLabels,
} from '../lib/format'
import { detailHref, navigate, navigateQuery, routeHref, type RouteState } from '../lib/route'
import { RangeControl } from '../components/RangeControl'
import { TrendChart, type TrendMetric } from '../components/TrendChart'
import {
  Button,
  InlineError,
  Panel,
  PageHeader,
  SectionNote,
  StateView,
  StatusPill,
} from '../components/ui'
import { MetricLink, useListRange } from './shared'
import { useAuth } from '../lib/auth'

const TREND_OPTIONS: Array<{ value: TrendMetric; label: string }> = [
  { value: 'new_users', label: '新增注册用户' },
  { value: 'new_couples', label: '新建双人空间' },
  { value: 'mutual_spaces', label: '双向互动空间' },
  { value: 'task_rate', label: '双人任务完成率' },
]

function changeTone(tone: 'up' | 'down' | 'muted'): string {
  if (tone === 'up') return 'delta delta-up'
  if (tone === 'down') return 'delta delta-down'
  return 'delta delta-muted'
}

export function OverviewPage({ route }: { route: RouteState }) {
  const auth = useAuth()
  const { from, to } = useListRange(route.params, 30, 92)
  const [metric, setMetric] = useState<TrendMetric>('new_users')
  const state = useApi(`overview:${from}:${to}`, (signal) =>
    api.get<OverviewData>('/overview', { from, to }, signal),
  )
  const data = state.data

  function applyRange(nextFrom: string, nextTo: string) {
    navigateQuery('/overview', route.params, { from: nextFrom, to: nextTo })
  }

  const ticketsLink = (status: string) => routeHref('/tickets', { status })
  const usersCreatedLink = routeHref('/users', {
    created_from: from,
    created_to: to,
    sort: 'created_at_desc',
  })
  const couplesCreatedLink = routeHref('/couples', {
    from,
    to,
    created_from: from,
    created_to: to,
  })
  const mutualLink = routeHref('/couples', { from, to, mutual: 'true' })
  const taskDoubleLink = routeHref('/couples', { from, to, task: 'double' })
  const taskAssignedLink = routeHref('/couples', { from, to, task: 'assigned' })
  const diagnosticsLink = (failure?: RecentFailure) =>
    routeHref('/diagnostics', {
      from,
      to,
      status: 'failed',
      event_type: failure?.event_type || 'all',
    })
  const deletionLink = routeHref('/users', { filter: 'deletion_pending' })

  const header = (
    <PageHeader
      eyebrow="运营概览"
      title="今天，哔卟被认真使用了吗？"
      description="所有数字都来自服务端已落库记录。日期为北京时间自然日，含首尾两天；每项指标的分子、分母与排除规则见下方口径说明。"
      actions={
        <div className="header-actions">
          <span className="updated-at">
            服务端更新 {data ? formatDateTime(data.data_updated_at) : '—'}
            {state.fetchedAt ? ` · 本页拉取 ${formatDateTime(state.fetchedAt)}` : ''}
          </span>
          <Button tone="secondary" icon="refresh" loading={state.loading} onClick={state.reload}>
            刷新
          </Button>
        </div>
      }
    />
  )

  if (state.loading && !data) {
    return (
      <>
        {header}
        <StateView kind="loading" description="正在读取服务端指标…" />
      </>
    )
  }
  if (state.error && !data) {
    return (
      <>
        {header}
        <StateView
          kind="error"
          title="概览加载失败"
          description={<InlineError error={state.error} />}
          action={<Button onClick={state.reload}>重新加载</Button>}
        />
      </>
    )
  }
  if (!data) return null

  const current = data.current
  const previous = data.previous
  const smallSample = data.small_sample
  const pendingTickets = data.alerts.ticket_pending + data.alerts.ticket_in_progress

  return (
    <>
      {header}
      <div className="toolbar">
        <RangeControl from={from} to={to} onChange={applyRange} maxDays={92} />
      </div>
      {state.error ? <InlineError error={state.error} onRetry={state.reload} /> : null}

      <div className="metric-grid">
        <article className="metric-card">
          <div className="metric-top">
            <span>新增注册用户</span>
            <MetricLink href={usersCreatedLink}>查看名单</MetricLink>
          </div>
          <strong className="metric-value">{formatNumber(current.new_users)}</strong>
          <span className={changeTone(percentChange(current.new_users, previous.new_users).tone)}>
            较上期 {percentChange(current.new_users, previous.new_users).text}
          </span>
          <p className="metric-foot">
            来源 auth.users.created_at · 含微信与邮箱账号 · 排除已删除账号
          </p>
        </article>

        <article className="metric-card">
          <div className="metric-top">
            <span>新建双人空间</span>
            <MetricLink href={couplesCreatedLink}>查看空间</MetricLink>
          </div>
          <strong className="metric-value">{formatNumber(current.new_couples)}</strong>
          <span
            className={changeTone(percentChange(current.new_couples, previous.new_couples).tone)}
          >
            较上期 {percentChange(current.new_couples, previous.new_couples).text}
          </span>
          <p className="metric-foot">来源 couples.created_at · 不含仅创建邀请码但未配对的记录</p>
        </article>

        <article className="metric-card">
          <div className="metric-top">
            <span>双向互动空间</span>
            <MetricLink href={mutualLink}>查看空间</MetricLink>
          </div>
          <strong className="metric-value">{formatNumber(current.mutual_spaces)}</strong>
          <span
            className={changeTone(
              percentChange(current.mutual_spaces, previous.mutual_spaces).tone,
            )}
          >
            较上期 {percentChange(current.mutual_spaces, previous.mutual_spaces).text}
          </span>
          <p className="metric-foot">
            当前恰好 2 名成员，且两人各至少一次消息、提醒、任务完成或照片落库
          </p>
        </article>

        <article className="metric-card">
          <div className="metric-top">
            <span>双人任务完成率</span>
            <MetricLink href={taskDoubleLink}>查看完成空间</MetricLink>
          </div>
          <strong className="metric-value">
            {formatPercent(current.task_rate)}
            {smallSample && <span className="small-sample">样本不足 5，不作精确解读</span>}
          </strong>
          <span className={changeTone(rateChange(current.task_rate, previous.task_rate).tone)}>
            较上期 {rateChange(current.task_rate, previous.task_rate).text}
          </span>
          <p className="metric-foot">
            分子 {formatNumber(current.task_rate_numerator)} / 分母{' '}
            {formatNumber(current.task_rate_denominator)} 个任务 ·{' '}
            <MetricLink href={taskAssignedLink}>查看分母空间</MetricLink>
          </p>
        </article>
      </div>

      <Panel
        title="趋势"
        subtitle={`${from} 至 ${to} · 北京时间 · 上期对比区间 ${previous.from} 至 ${previous.to}`}
        actions={
          <div className="segmented" role="group" aria-label="切换趋势指标">
            {TREND_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={metric === option.value ? 'segment segment-active' : 'segment'}
                aria-pressed={metric === option.value}
                onClick={() => setMetric(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        {metric === 'task_rate' ? (
          <SectionNote>
            每日任务率为当日“双人各有完成记录的任务数 / 当前 2 人空间当日分配任务数”， 分母为 0
            的日期留空，不以 0% 代替。
          </SectionNote>
        ) : null}
        <TrendChart series={data.series} metric={metric} />
      </Panel>

      <div className="split-grid">
        <Panel title="待处理异常" subtitle="只呈现在当前时间仍需要人工跟进的事项">
          <div className="alert-list">
            <button
              type="button"
              className="alert-row"
              onClick={() => navigate('/tickets', { status: 'open' })}
            >
              <span>
                <strong>{formatNumber(pendingTickets)}</strong> 个未解决工单
                <small>
                  待处理 {formatNumber(data.alerts.ticket_pending)} · 处理中{' '}
                  {formatNumber(data.alerts.ticket_in_progress)}
                </small>
              </span>
              <StatusPill tone={pendingTickets > 0 ? 'warn' : 'ok'}>
                {pendingTickets > 0 ? '需跟进' : '已清空'}
              </StatusPill>
            </button>
            <button
              type="button"
              className="alert-row"
              onClick={() => navigate('/diagnostics', { status: 'failed', from, to })}
            >
              <span>
                <strong>{formatNumber(data.alerts.push_failures_24h)}</strong> 个通知事件近 24
                小时有失败
                <small>仅表示服务端写入或推送服务阶段失败，不代表用户已收到</small>
              </span>
              <StatusPill tone={data.alerts.push_failures_24h > 0 ? 'danger' : 'ok'}>
                {data.alerts.push_failures_24h > 0 ? '需排查' : '正常'}
              </StatusPill>
            </button>
            <button
              type="button"
              className="alert-row"
              onClick={() => navigate('/users', { filter: 'deletion_pending' })}
            >
              <span>
                <strong>{formatNumber(data.alerts.deletion_jobs)}</strong> 个账号注销任务待完成
                <small>仅显示已进入 prepared 状态的账号，不展示注销原因</small>
              </span>
              <StatusPill tone={data.alerts.deletion_jobs > 0 ? 'warn' : 'ok'}>
                {data.alerts.deletion_jobs > 0 ? '待处理' : '正常'}
              </StatusPill>
            </button>
            <button
              type="button"
              className="alert-row"
              onClick={() => navigate('/tickets', { status: 'waiting_user' })}
            >
              <span>
                <strong>{formatNumber(data.alerts.ticket_waiting_user)}</strong> 个工单等待用户回复
                <small>等待用户不等于已解决，可在工单页继续跟进</small>
              </span>
              <StatusPill tone={data.alerts.ticket_waiting_user > 0 ? 'info' : 'ok'}>
                {data.alerts.ticket_waiting_user > 0 ? '等待中' : '无'}
              </StatusPill>
            </button>
          </div>
        </Panel>

        <Panel title="近期失败通知" subtitle="24 小时内 provider_rejected / invalid_token">
          {data.recent_failures === null ? (
            <StateView
              kind="denied"
              title="当前角色无诊断权限"
              description="维护或运营角色可查看推送失败详情。"
            />
          ) : data.recent_failures.length === 0 ? (
            <StateView
              kind="empty"
              title="近 24 小时没有失败记录"
              description="无诊断记录不等于推送成功，仅表示未记录失败。"
            />
          ) : (
            <ul className="compact-list">
              {data.recent_failures.map((failure) => (
                <li key={`${failure.event_type}:${failure.event_id}`}>
                  <button
                    type="button"
                    className="compact-row"
                    onClick={() =>
                      navigate('/diagnostics', {
                        status: 'all',
                        event_type: failure.event_type,
                        event_id: failure.event_id,
                        from,
                        to,
                      })
                    }
                  >
                    <span className="mono">
                      {failure.event_type === 'message' ? '消息' : '提醒'} ·{' '}
                      {failure.event_id.slice(0, 8)}
                    </span>
                    <span className="compact-meta">
                      {failure.error_code || '未知错误'} · {failure.attempts} 次 ·{' '}
                      {formatDateTime(failure.last_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="最新用户反馈"
        subtitle="用户主动提交的工单摘要，不含私密聊天或照片内容"
        actions={
          <Button tone="ghost" size="sm" onClick={() => navigate('/tickets', { status: 'open' })}>
            全部工单
          </Button>
        }
        flush
      >
        {data.recent_tickets.length === 0 ? (
          <StateView
            kind="empty"
            title="还没有用户反馈"
            description="用户从设置页提交后会出现在这里。"
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>工单</th>
                  <th>分类</th>
                  <th>状态</th>
                  <th>摘要</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_tickets.map((ticket: RecentTicket) => (
                  <tr key={ticket.id}>
                    <td className="mono">
                      <a className="inline-link" href={detailHref(`/tickets/${ticket.id}`, route)}>
                        {ticket.ticket_no}
                      </a>
                    </td>
                    <td>{ticketCategoryLabels[ticket.category]}</td>
                    <td>
                      <StatusPill tone={detailStatusTone(ticket.status)}>
                        {ticketStatusLabels[ticket.status]}
                      </StatusPill>
                    </td>
                    <td className="text-truncate">{ticket.excerpt}</td>
                    <td>{formatDateTime(ticket.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="指标口径与数据缺口" subtitle="避免把“未采集”误读为 0">
        <div className="definition-grid">
          <div>
            <h3>计算口径</h3>
            <ul className="definition-list">
              <li>日期窗口：Asia/Shanghai 自然日 [开始日 00:00, 结束日次日 00:00)。</li>
              <li>新增用户：auth.users.created_at 落在窗口内，包含微信账号。</li>
              <li>新建空间：couples.created_at 落在窗口内，不还原已删除的历史关系。</li>
              <li>
                双向互动：当前恰好 2 名成员，两人各至少一次消息 / ping / 任务完成 /
                照片服务端写入；以服务端落库为准。
              </li>
              <li>
                任务完成率：仅统计当前 2
                人空间；分子为两人各有完成记录的任务数，分母为窗口内分配给这些空间的任务数。
              </li>
              <li>last_seen_at 不是在线状态；消息与 ping 只证明服务端写入，不证明对方已读。</li>
            </ul>
          </div>
          <div>
            <h3>尚未采集 / 无法计算</h3>
            <ul className="definition-list definition-muted">
              {data.unavailable.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <SectionNote>
              当前没有伪造的 D1/D7/D28
              留存、实时在线或客户端送达数据。若需要这些指标，需先补充采集与历史快照。
            </SectionNote>
          </div>
        </div>
        {auth.can('diagnostics.read') && (
          <p className="definition-links">
            <a href={diagnosticsLink()}>查看通知诊断</a>
            <a href={deletionLink}>查看注销待处理账号</a>
            <a href={ticketsLink('waiting_user')}>查看等待用户工单</a>
            <span>状态说明：{Object.values(deliveryStatusLabels).join(' / ')}</span>
          </p>
        )}
      </Panel>
    </>
  )
}
