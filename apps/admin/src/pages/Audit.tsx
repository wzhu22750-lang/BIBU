import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { AuditRow, Paged } from '../lib/types'
import {
  formatDateTime,
  formatJsonSummary,
  formatNumber,
  isValidDate,
  roleLabels,
} from '../lib/format'
import { navigateQuery, type RouteState } from '../lib/route'
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
import { Field } from './shared'

const RESULTS = [
  { value: 'all', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failure', label: '失败' },
] as const

export function AuditPage({ route }: { route: RouteState }) {
  const params = route.params
  const page = Math.max(1, Number(params.get('page') || '1') || 1)
  const success = RESULTS.some((item) => item.value === params.get('success'))
    ? (params.get('success') as string)
    : 'all'
  const query = params.get('query') || ''
  const from = isValidDate(params.get('from') || '') ? params.get('from')! : ''
  const to = isValidDate(params.get('to') || '') ? params.get('to')! : ''
  const [draftQuery, setDraftQuery] = useState(query)
  const [draftFrom, setDraftFrom] = useState(from)
  const [draftTo, setDraftTo] = useState(to)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    setDraftQuery(query)
    setDraftFrom(from)
    setDraftTo(to)
  }, [query, from, to])

  const apiQuery = {
    query,
    success,
    from: from || undefined,
    to: to || undefined,
    page,
    page_size: 20,
  }
  const state = useApi(`audit:${JSON.stringify(apiQuery)}`, (signal) =>
    api.get<Paged<AuditRow>>('/audit', apiQuery, signal),
  )
  const data = state.data

  function update(updates: Record<string, string | number | null | undefined>) {
    navigateQuery('/audit', params, { ...updates, page: updates.page ?? 1 })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if ((draftFrom && !isValidDate(draftFrom)) || (draftTo && !isValidDate(draftTo))) {
      setError('日期格式无效')
      return
    }
    if (draftFrom && draftTo && draftFrom > draftTo) {
      setError('开始日期不能晚于结束日期')
      return
    }
    if (draftFrom && draftTo) {
      const span = Math.round(
        (Date.parse(`${draftTo}T00:00:00Z`) - Date.parse(`${draftFrom}T00:00:00Z`)) / 86_400_000,
      )
      if (span > 365) {
        setError('审计日期范围不能超过 365 天')
        return
      }
    }
    setError('')
    update({
      query: draftQuery.trim() || null,
      from: draftFrom || null,
      to: draftTo || null,
    })
  }

  return (
    <>
      <PageHeader
        eyebrow="审计日志"
        title="操作日志"
        description="管理写操作、失败尝试与初始化动作都会留下记录。普通管理 API 不能修改或删除审计；数据库触发器也拒绝更新与删除，但这不是加密不可篡改存证。"
        actions={
          <Button tone="secondary" icon="refresh" loading={state.loading} onClick={state.reload}>
            刷新
          </Button>
        }
      />

      <Panel flush className="filter-panel">
        <form className="filter-toolbar" onSubmit={submit}>
          <div className="filter-line">
            <Field label="搜索">
              <input
                type="search"
                value={draftQuery}
                maxLength={100}
                placeholder="动作、目标 ID、操作者、请求 ID 或错误码"
                onChange={(event) => setDraftQuery(event.target.value)}
              />
            </Field>
            <Field label="结果">
              <select value={success} onChange={(event) => update({ success: event.target.value })}>
                {RESULTS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="开始日期">
              <input
                type="date"
                value={draftFrom}
                onChange={(event) => setDraftFrom(event.target.value)}
              />
            </Field>
            <Field label="结束日期">
              <input
                type="date"
                value={draftTo}
                onChange={(event) => setDraftTo(event.target.value)}
              />
            </Field>
            <div className="filter-actions">
              <Button type="submit" icon="search">
                应用
              </Button>
              <Button
                type="button"
                tone="ghost"
                onClick={() => {
                  setDraftQuery('')
                  setDraftFrom('')
                  setDraftTo('')
                  update({ query: null, from: null, to: null })
                }}
              >
                清除
              </Button>
            </div>
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </Panel>

      <Panel
        title="操作记录"
        subtitle={
          data
            ? `共 ${formatNumber(data.total)} 条 · 第 ${data.page} 页 · 每页 ${data.page_size} 条${from || to ? '' : '（全部时间）'}`
            : '正在读取审计记录'
        }
        flush
        actions={state.loading && data ? <span className="panel-loading">更新中…</span> : undefined}
      >
        {state.error && !data ? (
          <StateView
            kind="error"
            title="审计日志加载失败"
            description={<InlineError error={state.error} />}
            action={<Button onClick={state.reload}>重新加载</Button>}
          />
        ) : !data ? (
          <StateView kind="loading" />
        ) : data.rows.length === 0 ? (
          <StateView
            kind="empty"
            title="没有匹配的审计记录"
            description="尝试扩大日期范围或清除搜索条件。"
          />
        ) : (
          <>
            {state.error ? <InlineError error={state.error} onRetry={state.reload} /> : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>操作者</th>
                    <th>动作</th>
                    <th>目标</th>
                    <th>结果</th>
                    <th>请求 ID</th>
                    <th aria-label="展开" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const isOpen = expanded === row.id
                    return (
                      <Fragment key={row.id}>
                        <tr
                          className="row-link"
                          tabIndex={0}
                          aria-expanded={isOpen}
                          onClick={() => setExpanded(isOpen ? null : row.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') setExpanded(isOpen ? null : row.id)
                          }}
                        >
                          <td>{formatDateTime(row.created_at)}</td>
                          <td>
                            <strong>{row.actor_label}</strong>
                            <small className="block-muted">
                              {row.actor_role in roleLabels
                                ? roleLabels[row.actor_role as keyof typeof roleLabels]
                                : row.actor_role === 'system'
                                  ? '系统 / 脚本'
                                  : row.actor_role}
                            </small>
                          </td>
                          <td className="mono">{row.action}</td>
                          <td>
                            {row.target_type}
                            <small className="block-muted mono">{row.target_id || '—'}</small>
                          </td>
                          <td>
                            <StatusPill tone={row.success ? 'ok' : 'danger'}>
                              {row.success ? '成功' : '失败'}
                            </StatusPill>
                            {row.error_code && (
                              <small className="block-muted mono">{row.error_code}</small>
                            )}
                          </td>
                          <td>
                            <span className="copy-row">
                              <span className="mono">{row.request_id}</span>
                              <CopyButton value={row.request_id} label="复制" />
                            </span>
                          </td>
                          <td className="row-chevron">
                            <span aria-hidden="true">{isOpen ? '⌃' : '⌄'}</span>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="detail-row">
                            <td colSpan={7}>
                              <dl className="audit-detail">
                                <div>
                                  <dt>理由</dt>
                                  <dd>{row.reason || '未填写'}</dd>
                                </div>
                                <div>
                                  <dt>变更摘要</dt>
                                  <dd className="mono">{formatJsonSummary(row.summary)}</dd>
                                </div>
                                <div>
                                  <dt>完整请求 ID</dt>
                                  <dd className="copy-row">
                                    <span className="mono">{row.request_id}</span>
                                    <CopyButton value={row.request_id} label="复制请求 ID" />
                                  </dd>
                                </div>
                              </dl>
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
              onChange={(next) => navigateQuery('/audit', params, { page: next })}
            />
          </>
        )}
      </Panel>

      <SectionNote>
        审计记录包含敏感操作元数据（如目标用户 ID 与理由），不包含聊天正文、照片、密码或完整推送
        Token。 如需更强的不可篡改保证，需要额外接入外部日志归档或签名链；当前实现仅为数据库级防改。
      </SectionNote>
    </>
  )
}
