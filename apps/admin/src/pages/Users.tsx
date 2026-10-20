import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useApi } from '../lib/useApi'
import type { Paged, UserRow } from '../lib/types'
import {
  accountStatusLabels,
  addDays,
  businessToday,
  detailStatusTone,
  formatDate,
  formatDateTime,
  formatNumber,
  isValidDate,
} from '../lib/format'
import { detailHref, navigateQuery, type RouteState } from '../lib/route'
import {
  Button,
  InlineError,
  PageHeader,
  Pagination,
  Panel,
  PrivacyNote,
  StateView,
  StatusPill,
} from '../components/ui'

const FILTERS = [
  { value: 'all', label: '全部账号' },
  { value: 'paired', label: '已配对' },
  { value: 'unpaired', label: '未配对' },
  { value: 'deletion_pending', label: '注销处理中' },
  { value: 'banned', label: '已封禁' },
] as const

const SORTS = [
  { value: 'created_at_desc', label: '注册时间（新→旧）' },
  { value: 'created_at_asc', label: '注册时间（旧→新）' },
  { value: 'name_asc', label: '昵称（A→Z）' },
  { value: 'name_desc', label: '昵称（Z→A）' },
  { value: 'devices_desc', label: '设备数（多→少）' },
] as const

type SearchType = 'name' | 'id' | 'email'

export function UsersPage({ route }: { route: RouteState }) {
  const auth = useAuth()
  const canSearchEmail = auth.can('users.search_email')
  const params = route.params
  const page = Math.max(1, Number(params.get('page') || '1') || 1)
  const query = params.get('query') || ''
  const searchParam = params.get('search') || 'name'
  const search: SearchType =
    searchParam === 'id' || (searchParam === 'email' && canSearchEmail) ? searchParam : 'name'
  const filter = FILTERS.some((item) => item.value === params.get('filter'))
    ? (params.get('filter') as string)
    : 'all'
  const sort = SORTS.some((item) => item.value === params.get('sort'))
    ? (params.get('sort') as string)
    : 'created_at_desc'
  const createdFrom = isValidDate(params.get('created_from') || '')
    ? params.get('created_from')!
    : ''
  const createdTo = isValidDate(params.get('created_to') || '') ? params.get('created_to')! : ''

  const [draftQuery, setDraftQuery] = useState(query)
  const [draftSearch, setDraftSearch] = useState<SearchType>(search)
  const [draftFrom, setDraftFrom] = useState(createdFrom)
  const [draftTo, setDraftTo] = useState(createdTo)
  const [error, setError] = useState('')

  useEffect(() => {
    setDraftQuery(query)
    setDraftSearch(search)
    setDraftFrom(createdFrom)
    setDraftTo(createdTo)
    setError('')
  }, [query, search, createdFrom, createdTo])

  const apiQuery = {
    query,
    search,
    filter,
    sort,
    page,
    page_size: 20,
    created_from: createdFrom || undefined,
    created_to: createdTo || undefined,
  }
  const state = useApi(`users:${JSON.stringify(apiQuery)}`, (signal) =>
    api.get<Paged<UserRow>>('/users', apiQuery, signal),
  )

  function update(updates: Record<string, string | number | null | undefined>) {
    navigateQuery('/users', params, { ...updates, page: updates.page ?? 1 })
  }

  function searchSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSearchEmail && draftSearch === 'email') {
      setError('当前角色不能按账号邮箱检索')
      return
    }
    setError('')
    update({ query: draftQuery.trim(), search: draftSearch })
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
      setError('注册日期格式无效')
      return
    }
    if (draftFrom && draftTo && draftFrom > draftTo) {
      setError('注册开始日期不能晚于结束日期')
      return
    }
    if (draftFrom && draftTo) {
      const span = Math.round(
        (Date.parse(`${draftTo}T00:00:00Z`) - Date.parse(`${draftFrom}T00:00:00Z`)) / 86_400_000,
      )
      if (span > 365) {
        setError('注册日期范围不能超过 365 天')
        return
      }
    }
    setError('')
    update({ created_from: draftFrom || null, created_to: draftTo || null })
  }

  const data = state.data

  return (
    <>
      <PageHeader
        eyebrow="用户"
        title="账号与设备"
        description="按账号状态、配对情况与注册日期查找用户。邮箱仅显示掩码；不会展示聊天内容、照片或登录凭据。"
        actions={
          <Button tone="secondary" icon="refresh" loading={state.loading} onClick={state.reload}>
            刷新
          </Button>
        }
      />

      <Panel flush className="filter-panel">
        <form className="filter-toolbar" onSubmit={searchSubmit}>
          <div className="search-line">
            <label className="input-with-icon">
              <span className="visually-hidden">搜索用户</span>
              <input
                type="search"
                value={draftQuery}
                maxLength={100}
                placeholder={
                  draftSearch === 'email'
                    ? '输入完整邮箱精确匹配'
                    : draftSearch === 'id'
                      ? '输入完整用户 UUID'
                      : '按昵称搜索'
                }
                onChange={(event) => setDraftQuery(event.target.value)}
              />
            </label>
            <label className="select-field">
              <span className="visually-hidden">检索方式</span>
              <select
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value as SearchType)}
              >
                <option value="name">昵称</option>
                <option value="id">用户 ID（精确）</option>
                {canSearchEmail && <option value="email">邮箱（精确）</option>}
              </select>
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
              <span>账号状态</span>
              <select value={filter} onChange={(event) => update({ filter: event.target.value })}>
                {FILTERS.map((item) => (
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
            <div className="date-range-inline" role="group" aria-label="注册日期筛选">
              <label className="date-field">
                <span>注册起</span>
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
                <span>注册止</span>
                <input
                  type="date"
                  value={draftTo}
                  onChange={(event) => setDraftTo(event.target.value)}
                />
              </label>
              <Button type="button" tone="secondary" size="sm" onClick={() => applyCreated(null)}>
                应用注册日期
              </Button>
              <Button type="button" tone="ghost" size="sm" onClick={() => applyCreated(7)}>
                近 7 天注册
              </Button>
            </div>
          </div>
          {(error || createdFrom) && (
            <div className="filter-foot">
              {error ? (
                <span className="field-error" role="alert">
                  {error}
                </span>
              ) : null}
              {createdFrom || createdTo ? (
                <span className="filter-active">
                  注册日期 {createdFrom || '不限'} 至 {createdTo || '不限'}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => update({ created_from: null, created_to: null })}
                  >
                    清除
                  </button>
                </span>
              ) : null}
            </div>
          )}
        </form>
      </Panel>

      <PrivacyNote>
        页面只返回掩码邮箱、配对状态、设备数量与最近活动时间；客服与运营可写备注，但不能修改用户资料、密码或强制解绑。
      </PrivacyNote>

      <Panel
        title="用户列表"
        subtitle={
          data
            ? `共 ${formatNumber(data.total)} 个账号 · 第 ${data.page} 页 · 每页 ${data.page_size} 条`
            : '正在读取账号列表'
        }
        flush
        actions={state.loading && data ? <span className="panel-loading">更新中…</span> : undefined}
      >
        {state.error && !data ? (
          <StateView
            kind="error"
            title="用户列表加载失败"
            description={<InlineError error={state.error} />}
            action={<Button onClick={state.reload}>重新加载</Button>}
          />
        ) : !data ? (
          <StateView kind="loading" />
        ) : data.rows.length === 0 ? (
          <StateView
            kind="empty"
            title="没有符合条件的账号"
            description="尝试清除搜索或调整账号状态与注册日期筛选。"
          />
        ) : (
          <>
            {state.error ? <InlineError error={state.error} onRetry={state.reload} /> : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>注册</th>
                    <th>配对空间</th>
                    <th className="num">设备</th>
                    <th className="num">未解决工单</th>
                    <th>最近登录</th>
                    <th>状态</th>
                    <th aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((user) => (
                    <tr key={user.user_id}>
                      <td>
                        <div className="identity-cell">
                          <span className="avatar-dot" aria-hidden="true">
                            {user.name.slice(0, 1)}
                          </span>
                          <span>
                            <a
                              className="inline-link"
                              href={detailHref(`/users/${user.user_id}`, route)}
                            >
                              <strong>{user.name}</strong>
                            </a>
                            <small>{user.email_masked || '无邮箱（微信或匿名）'}</small>
                            <small className="mono">{user.user_id.slice(0, 8)}…</small>
                          </span>
                        </div>
                      </td>
                      <td>{formatDate(user.created_at)}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        {user.couple_id ? (
                          <a className="inline-link" href={`#/couples/${user.couple_id}`}>
                            {user.couple_closed_at ? '已封存' : '配对中'} ·{' '}
                            {user.couple_member_count} 人
                          </a>
                        ) : (
                          <span className="muted">未配对</span>
                        )}
                      </td>
                      <td className="num">{formatNumber(user.device_count)}</td>
                      <td className="num">{formatNumber(user.open_ticket_count)}</td>
                      <td>{formatDateTime(user.last_sign_in_at)}</td>
                      <td>
                        <StatusPill tone={detailStatusTone(user.account_status)}>
                          {accountStatusLabels[user.account_status]}
                        </StatusPill>
                      </td>
                      <td className="row-chevron">
                        <span aria-hidden="true">›</span>
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
              onChange={(next) => navigateQuery('/users', params, { page: next })}
            />
          </>
        )}
      </Panel>
    </>
  )
}
