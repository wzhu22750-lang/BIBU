import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { CoupleRow, Paged } from '../lib/types'
import {
  addDays,
  businessToday,
  formatDate,
  formatDateTime,
  formatNumber,
  isValidDate,
} from '../lib/format'
import { detailHref, navigateQuery, type RouteState } from '../lib/route'
import { RangeControl } from '../components/RangeControl'
import {
  Button,
  InlineError,
  PageHeader,
  Pagination,
  Panel,
  StateView,
  StatusPill,
} from '../components/ui'
import { useListRange } from './shared'

const STATES = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '配对中' },
  { value: 'sealed', label: '已封存' },
] as const
const PAIRS = [
  { value: 'all', label: '全部成员数' },
  { value: 'complete', label: '双人完整' },
  { value: 'incomplete', label: '不足两人' },
] as const
const MUTUAL = [
  { value: 'all', label: '互动不限' },
  { value: 'true', label: '仅双向互动' },
  { value: 'false', label: '仅非双向互动' },
] as const
const TASKS = [
  { value: 'all', label: '任务不限' },
  { value: 'double', label: '有双人完成任务' },
  { value: 'single', label: '有单人完成任务' },
  { value: 'assigned', label: '有分配任务' },
  { value: 'none', label: '无分配任务' },
] as const
const SORTS = [
  { value: 'created_at_desc', label: '创建时间（新→旧）' },
  { value: 'created_at_asc', label: '创建时间（旧→新）' },
  { value: 'name_asc', label: '空间名称（A→Z）' },
] as const

export function CouplesPage({ route }: { route: RouteState }) {
  const params = route.params
  const { from, to } = useListRange(params, 30, 92)
  const page = Math.max(1, Number(params.get('page') || '1') || 1)
  const stateValue = STATES.some((item) => item.value === params.get('state'))
    ? (params.get('state') as string)
    : 'all'
  const pair = PAIRS.some((item) => item.value === params.get('pair'))
    ? (params.get('pair') as string)
    : 'all'
  const mutual = MUTUAL.some((item) => item.value === params.get('mutual'))
    ? (params.get('mutual') as string)
    : 'all'
  const task = TASKS.some((item) => item.value === params.get('task'))
    ? (params.get('task') as string)
    : 'all'
  const sort = SORTS.some((item) => item.value === params.get('sort'))
    ? (params.get('sort') as string)
    : 'created_at_desc'
  const createdFrom = isValidDate(params.get('created_from') || '')
    ? params.get('created_from')!
    : ''
  const createdTo = isValidDate(params.get('created_to') || '') ? params.get('created_to')! : ''
  const [draftFrom, setDraftFrom] = useState(createdFrom)
  const [draftTo, setDraftTo] = useState(createdTo)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraftFrom(createdFrom)
    setDraftTo(createdTo)
    setError('')
  }, [createdFrom, createdTo])

  const apiQuery = {
    from,
    to,
    page,
    page_size: 20,
    state: stateValue,
    pair,
    mutual: mutual === 'all' ? undefined : mutual,
    task,
    sort,
    created_from: createdFrom || undefined,
    created_to: createdTo || undefined,
  }
  const state = useApi(`couples:${JSON.stringify(apiQuery)}`, (signal) =>
    api.get<Paged<CoupleRow>>('/couples', apiQuery, signal),
  )

  function update(updates: Record<string, string | number | null | undefined>) {
    navigateQuery('/couples', params, { ...updates, page: updates.page ?? 1 })
  }

  function applyCreated(days: number | null) {
    if (days !== null) {
      const end = businessToday()
      const start = addDays(end, -(days - 1))
      setDraftFrom(start)
      setDraftTo(end)
      update({ created_from: start, created_to: end })
      return
    }
    if (!draftFrom && !draftTo) {
      update({ created_from: null, created_to: null })
      return
    }
    if ((draftFrom && !isValidDate(draftFrom)) || (draftTo && !isValidDate(draftTo))) {
      setError('创建日期格式无效')
      return
    }
    if (draftFrom && draftTo && draftFrom > draftTo) {
      setError('创建开始日期不能晚于结束日期')
      return
    }
    if (draftFrom && draftTo) {
      const span = Math.round(
        (Date.parse(`${draftTo}T00:00:00Z`) - Date.parse(`${draftFrom}T00:00:00Z`)) / 86_400_000,
      )
      if (span > 365) {
        setError('创建日期范围不能超过 365 天')
        return
      }
    }
    setError('')
    update({ created_from: draftFrom || null, created_to: draftTo || null })
  }

  const data = state.data
  const activeFilters =
    stateValue !== 'all' ||
    pair !== 'all' ||
    mutual !== 'all' ||
    task !== 'all' ||
    createdFrom ||
    createdTo

  return (
    <>
      <PageHeader
        eyebrow="双人空间"
        title="双人空间"
        description="查看成员关系、互动表现与空间内的业务记录。"
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
          onChange={(nextFrom, nextTo) => update({ from: nextFrom, to: nextTo, page: 1 })}
          maxDays={92}
        />
        <p className="toolbar-note">
          活跃窗口用于统计消息、提醒、照片与任务；创建日期是独立筛选条件。空间创建于窗口之前也会被计入活跃统计。
        </p>
      </div>

      <Panel flush className="filter-panel">
        <div className="filter-line">
          <label className="select-field">
            <span>空间状态</span>
            <select value={stateValue} onChange={(event) => update({ state: event.target.value })}>
              {STATES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span>成员数</span>
            <select value={pair} onChange={(event) => update({ pair: event.target.value })}>
              {PAIRS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span>双向互动</span>
            <select value={mutual} onChange={(event) => update({ mutual: event.target.value })}>
              {MUTUAL.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span>任务</span>
            <select value={task} onChange={(event) => update({ task: event.target.value })}>
              {TASKS.map((item) => (
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
        <div className="filter-line">
          <div className="date-range-inline" role="group" aria-label="创建日期筛选">
            <label className="date-field">
              <span>创建起</span>
              <input
                type="date"
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.target.value)}
              />
            </label>
            <span className="range-dash" aria-hidden="true">
              –
            </span>
            <label className="date-field">
              <span>创建止</span>
              <input
                type="date"
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
              />
            </label>
            <Button type="button" tone="secondary" size="sm" onClick={() => applyCreated(null)}>
              应用创建日期
            </Button>
            <Button type="button" tone="ghost" size="sm" onClick={() => applyCreated(7)}>
              近 7 天创建
            </Button>
          </div>
          {activeFilters && (
            <Button
              tone="ghost"
              size="sm"
              onClick={() =>
                update({
                  state: null,
                  pair: null,
                  mutual: null,
                  task: null,
                  created_from: null,
                  created_to: null,
                })
              }
            >
              清除筛选
            </Button>
          )}
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </Panel>

      <Panel
        title="空间列表"
        subtitle={
          data
            ? `共 ${formatNumber(data.total)} 个空间 · 第 ${data.page} 页 · 每页 ${data.page_size} 条`
            : '正在读取空间列表'
        }
        flush
        actions={state.loading && data ? <span className="panel-loading">更新中…</span> : undefined}
      >
        {state.error && !data ? (
          <StateView
            kind="error"
            title="空间列表加载失败"
            description={<InlineError error={state.error} />}
            action={<Button onClick={state.reload}>重新加载</Button>}
          />
        ) : !data ? (
          <StateView kind="loading" />
        ) : data.rows.length === 0 ? (
          <StateView
            kind="empty"
            title="没有符合条件的空间"
            description="调整活跃窗口、状态、互动或创建日期筛选后再试。"
          />
        ) : (
          <>
            {state.error ? <InlineError error={state.error} onRetry={state.reload} /> : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>空间 / 成员</th>
                    <th>创建</th>
                    <th className="num">消息</th>
                    <th className="num">提醒</th>
                    <th className="num">照片</th>
                    <th className="num">任务（分配 / 双人）</th>
                    <th>双向互动</th>
                    <th>最近活动</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((couple) => (
                    <tr key={couple.id}>
                      <td>
                        <div className="space-cell">
                          <a
                            className="inline-link"
                            href={detailHref(`/couples/${couple.id}`, route, { from, to })}
                          >
                            <strong>{couple.name || '未命名空间'}</strong>
                          </a>
                          <small className="mono">{couple.id}</small>
                          <div className="member-chips">
                            {couple.members.map((member) => (
                              <span key={member.user_id} className="member-chip">
                                {member.name}
                                <small>{member.email_masked || '无邮箱'}</small>
                              </span>
                            ))}
                            {couple.members.length === 0 && (
                              <span className="muted">无成员记录</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{formatDate(couple.created_at)}</td>
                      <td className="num">{formatNumber(couple.messages)}</td>
                      <td className="num">{formatNumber(couple.pings)}</td>
                      <td className="num">
                        {formatNumber(couple.photos_in_range)}
                        <small className="block-muted">
                          累计 {formatNumber(couple.photos_total)}
                        </small>
                      </td>
                      <td className="num">
                        {formatNumber(couple.tasks_assigned)} / {formatNumber(couple.tasks_double)}
                        {couple.tasks_single > 0 && (
                          <small className="block-muted">
                            单人完成 {formatNumber(couple.tasks_single)}
                          </small>
                        )}
                      </td>
                      <td>
                        <StatusPill tone={couple.mutual ? 'ok' : 'muted'}>
                          {couple.mutual ? '双向' : '未达双向'}
                        </StatusPill>
                      </td>
                      <td>{formatDateTime(couple.last_activity_at)}</td>
                      <td>
                        {couple.closed_at ? (
                          <StatusPill tone="muted">已封存</StatusPill>
                        ) : (
                          <StatusPill tone="ok">配对中</StatusPill>
                        )}
                        {couple.tickets_open > 0 && (
                          <small className="block-muted">{couple.tickets_open} 个工单</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              onChange={(next) => navigateQuery('/couples', params, { page: next })}
            />
          </>
        )}
      </Panel>
    </>
  )
}
