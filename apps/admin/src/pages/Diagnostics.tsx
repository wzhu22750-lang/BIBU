import { Fragment, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { DiagnosticsData, DiagnosticRow } from '../lib/types'
import {
  deliveryStatusLabels,
  detailStatusTone,
  formatDateTime,
  formatDuration,
  formatNumber,
  stageLabels,
} from '../lib/format'
import { navigate, navigateQuery, type RouteState } from '../lib/route'
import { RangeControl } from '../components/RangeControl'
import {
  Button,
  CopyButton,
  InlineError,
  PageHeader,
  Pagination,
  Panel,
  SectionNote,
  StateView,
  StatusPill,
} from '../components/ui'
import { useListRange } from './shared'

const EVENTS = [
  { value: 'all', label: '消息与提醒' },
  { value: 'message', label: '仅消息' },
  { value: 'ping', label: '仅提醒' },
] as const
const STATUSES = [
  { value: 'all', label: '全部状态' },
  { value: 'accepted', label: '推送已接受' },
  { value: 'failed', label: '推送失败' },
  { value: 'skipped', label: '已跳过' },
  { value: 'unrecorded', label: '无诊断记录' },
] as const

export function DiagnosticsPage({ route }: { route: RouteState }) {
  const params = route.params
  const { from, to } = useListRange(params, 7, 92)
  const page = Math.max(1, Number(params.get('page') || '1') || 1)
  const eventType = EVENTS.some((item) => item.value === params.get('event_type'))
    ? (params.get('event_type') as string)
    : 'all'
  const status = STATUSES.some((item) => item.value === params.get('status'))
    ? (params.get('status') as string)
    : 'all'
  const eventId = params.get('event_id') || ''
  const requestId = params.get('request_id') || ''
  const coupleId = params.get('couple_id') || ''
  const [search, setSearch] = useState({ eventId, requestId, coupleId })
  useEffect(() => setSearch({ eventId, requestId, coupleId }), [eventId, requestId, coupleId])
  const [expanded, setExpanded] = useState<string | null>(null)

  const apiQuery = {
    from,
    to,
    event_type: eventType,
    event_id: eventId || undefined,
    request_id: requestId || undefined,
    couple_id: coupleId || undefined,
    status,
    page,
    page_size: 20,
  }
  const state = useApi(`diagnostics:${JSON.stringify(apiQuery)}`, (signal) =>
    api.get<DiagnosticsData>('/diagnostics', apiQuery, signal),
  )
  const data = state.data
  useEffect(() => {
    if (!data) return
    const row = data.rows.find(
      (item) =>
        item.event_id === eventId ||
        (requestId && item.attempts.some((attempt) => attempt.request_id === requestId)),
    )
    setExpanded(row ? `${row.event_type}:${row.event_id}` : null)
  }, [data, eventId, requestId])

  return (
    <>
      <PageHeader
        eyebrow="互动与通知诊断"
        title="通知诊断"
        description="按事件定位通知，查看投递尝试与失败原因。"
        actions={
          <Button tone="secondary" icon="refresh" loading={state.loading} onClick={state.reload}>
            刷新
          </Button>
        }
      />

      <div className="toolbar">
        <RangeControl
          from={from}
          to={to}
          maxDays={92}
          presetDays={[1, 7, 30]}
          onChange={(nextFrom, nextTo) =>
            navigateQuery('/diagnostics', params, { from: nextFrom, to: nextTo, page: 1 })
          }
        />
        <p className="toolbar-note">
          诊断失败不会阻塞消息或提醒发送；这里的记录是旁路写入。时间段按北京时间自然日。
        </p>
      </div>

      <Panel flush className="filter-panel">
        <form
          className="filter-toolbar"
          onSubmit={(event) => {
            event.preventDefault()
            navigateQuery('/diagnostics', params, {
              event_id: search.eventId.trim() || null,
              request_id: search.requestId.trim() || null,
              couple_id: search.coupleId.trim() || null,
              page: 1,
              status: 'all',
              event_type: 'all',
            })
          }}
        >
          <div className="filter-line">
            <label className="field">
              <span className="field-label">事件 ID</span>
              <input
                value={search.eventId}
                maxLength={36}
                onChange={(event) => setSearch({ ...search, eventId: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">请求 ID</span>
              <input
                value={search.requestId}
                maxLength={36}
                onChange={(event) => setSearch({ ...search, requestId: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">空间 ID</span>
              <input
                value={search.coupleId}
                maxLength={36}
                onChange={(event) => setSearch({ ...search, coupleId: event.target.value })}
              />
            </label>
            <Button type="submit" icon="search">
              精确查询
            </Button>
            <Button
              type="button"
              tone="ghost"
              onClick={() => {
                setSearch({ eventId: '', requestId: '', coupleId: '' })
                navigateQuery('/diagnostics', params, {
                  event_id: null,
                  request_id: null,
                  couple_id: null,
                  page: 1,
                })
              }}
            >
              清除定位
            </Button>
          </div>
          <SectionNote>
            {eventId || requestId
              ? '当前按事件或请求精确定位，不受日期范围限制；仅查询仍保留的数据。'
              : '空间查询与日期范围共同生效；事件 ID 或请求 ID 查询可跨日期定位。'}
          </SectionNote>
        </form>
        <div className="filter-line">
          <label className="select-field">
            <span>事件类型</span>
            <select
              value={eventType}
              onChange={(event) =>
                navigateQuery('/diagnostics', params, { event_type: event.target.value, page: 1 })
              }
            >
              {EVENTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span>诊断状态</span>
            <select
              value={status}
              onChange={(event) =>
                navigateQuery('/diagnostics', params, { status: event.target.value, page: 1 })
              }
            >
              {STATUSES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Panel>

      <Panel
        title="事件诊断"
        subtitle={
          data
            ? `共 ${formatNumber(data.total)} 个事件 · 第 ${data.page} 页 · 每页 ${data.page_size} 条`
            : '正在读取诊断记录'
        }
        flush
        actions={state.loading && data ? <span className="panel-loading">更新中…</span> : undefined}
      >
        {state.error && !data ? (
          <StateView
            kind="error"
            title="诊断列表加载失败"
            description={<InlineError error={state.error} />}
            action={<Button onClick={state.reload}>重新加载</Button>}
          />
        ) : !data ? (
          <StateView kind="loading" />
        ) : data.rows.length === 0 ? (
          <StateView
            kind="empty"
            title="所选区间没有匹配事件"
            description="无记录不等于全部成功：可能只是该时间段没有消息或提醒。"
          />
        ) : (
          <>
            {state.error ? <InlineError error={state.error} onRetry={state.reload} /> : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>事件</th>
                    <th>空间 / 发送者</th>
                    <th>发生时间</th>
                    <th>结论</th>
                    <th>尝试</th>
                    <th>最近尝试</th>
                    <th>错误</th>
                    <th>Token 末尾</th>
                    <th aria-label="展开" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const key = `${row.event_type}:${row.event_id}`
                    const isOpen = expanded === key
                    return (
                      <Fragment key={key}>
                        <tr
                          className="row-link"
                          tabIndex={0}
                          aria-expanded={isOpen}
                          onClick={() => setExpanded(isOpen ? null : key)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') setExpanded(isOpen ? null : key)
                          }}
                        >
                          <td>
                            <strong>{row.event_type === 'message' ? '消息' : '提醒'}</strong>
                            <small className="block-muted mono">{row.event_id}</small>
                          </td>
                          <td onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              className="inline-link"
                              onClick={() => navigate(`/couples/${row.couple_id}`, { from, to })}
                            >
                              {row.couple_id}
                            </button>
                            <small className="block-muted mono">
                              发送者 {row.sender_id ? `${row.sender_id}` : '系统'}
                            </small>
                          </td>
                          <td>{formatDateTime(row.created_at)}</td>
                          <td>
                            <StatusPill tone={detailStatusTone(row.delivery_status)}>
                              {deliveryStatusLabels[row.delivery_status]}
                            </StatusPill>
                            <small className="block-muted">{describeStatus(row)}</small>
                          </td>
                          <td>
                            {formatNumber(row.attempt_count)}
                            <small className="block-muted">
                              接受 {row.accepted_count} · 失败 {row.failed_count} · 跳过{' '}
                              {row.skipped_count}
                            </small>
                          </td>
                          <td>
                            {formatDateTime(row.last_attempt_at)}
                            <small className="block-muted">{formatDuration(row.duration_ms)}</small>
                          </td>
                          <td>
                            {row.error_code ? (
                              <span className="mono">{row.error_code}</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="mono">
                            {row.token_suffix ? `…${row.token_suffix}` : '—'}
                          </td>
                          <td className="row-chevron">
                            <span aria-hidden="true">{isOpen ? '⌃' : '⌄'}</span>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="detail-row">
                            <td colSpan={9}>
                              <div className="attempt-panel">
                                <div className="attempt-head">
                                  <strong>投递尝试明细</strong>
                                  <CopyButton
                                    label="复制排障摘要"
                                    value={[
                                      `事件：${row.event_type} / ${row.event_id}`,
                                      `空间：${row.couple_id}`,
                                      `状态：${deliveryStatusLabels[row.delivery_status]}`,
                                      `尝试：${row.attempt_count}；接受 ${row.accepted_count}；失败 ${row.failed_count}`,
                                      ...row.attempts.map(
                                        (attempt) =>
                                          `${attempt.created_at} | ${attempt.request_id} | ${attempt.stage} | ${attempt.error_code || '无错误码'}`,
                                      ),
                                      '推送服务接受不代表客户端收到。',
                                    ].join('\n')}
                                  />
                                  {row.request_id && (
                                    <span className="copy-row">
                                      <span className="mono">请求 {row.request_id}</span>
                                      <CopyButton value={row.request_id} label="复制请求 ID" />
                                    </span>
                                  )}
                                </div>
                                {row.attempts.length === 0 ? (
                                  <p className="muted">
                                    没有诊断记录。可能是发送时诊断服务失败，或该事件没有可投递设备。
                                  </p>
                                ) : (
                                  <div className="table-wrap">
                                    <table className="nested-table">
                                      <thead>
                                        <tr>
                                          <th>阶段</th>
                                          <th>HTTP</th>
                                          <th>错误码</th>
                                          <th>耗时</th>
                                          <th>接收者</th>
                                          <th>平台</th>
                                          <th>Token 末尾</th>
                                          <th>时间</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row.attempts.map((attempt, index) => (
                                          <tr key={`${attempt.request_id}:${index}`}>
                                            <td>{stageLabels[attempt.stage] || attempt.stage}</td>
                                            <td>{attempt.provider_http_status ?? '—'}</td>
                                            <td className="mono">{attempt.error_code || '—'}</td>
                                            <td>{formatDuration(attempt.duration_ms)}</td>
                                            <td className="mono">
                                              {attempt.recipient_user_id
                                                ? `${attempt.recipient_user_id}`
                                                : '—'}
                                            </td>
                                            <td>{attempt.device_platform || '—'}</td>
                                            <td className="mono">
                                              {attempt.token_suffix
                                                ? `…${attempt.token_suffix}`
                                                : '—'}
                                            </td>
                                            <td>{formatDateTime(attempt.created_at)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                                <SectionNote>
                                  尝试明细来自事件发送时的旁路诊断，不含推送标题、正文或完整个推响应。
                                </SectionNote>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              onChange={(next) => navigateQuery('/diagnostics', params, { page: next })}
            />
          </>
        )}
      </Panel>

      <Panel title="采集覆盖与限制" subtitle="未采集的阶段会明确标注，不伪造回执">
        <div className="split-grid">
          <div>
            <h3 className="mini-heading">已采集</h3>
            <ul className="definition-list">
              {data?.collected_stages.map((item: string) => <li key={item}>{item}</li>) || (
                <li>加载中…</li>
              )}
            </ul>
          </div>
          <div>
            <h3 className="mini-heading">尚未采集</h3>
            <ul className="definition-list definition-muted">
              {data?.uncollected_stages.map((item: string) => <li key={item}>{item}</li>) || (
                <li>加载中…</li>
              )}
            </ul>
          </div>
        </div>
        <SectionNote>
          本页不提供“重新推送”按钮。重复推送需要单独评估幂等与用户打扰风险；当前版本只做诊断。
        </SectionNote>
      </Panel>
    </>
  )
}

function describeStatus(row: DiagnosticRow): string {
  if (row.delivery_status === 'accepted') return '至少一个设备被个推接受'
  if (row.delivery_status === 'failed') return '无设备被接受，需排查'
  if (row.delivery_status === 'skipped') return '没有可投递设备或已跳过'
  return '没有诊断记录，无法判断'
}
