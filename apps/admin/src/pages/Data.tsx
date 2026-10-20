import { useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../lib/api'
import { useApi } from '../lib/useApi'
import { navigateQuery, routeHref, type RouteState } from '../lib/route'
import type { Paged } from '../lib/types'
import {
  Button,
  CopyButton,
  InlineError,
  PageHeader,
  Panel,
  Pagination,
  StateView,
} from '../components/ui'

const ENTITIES = [
  ['messages', '聊天消息', 'content'],
  ['pings', '互动提醒', 'kind'],
  ['photos', '照片与回忆', 'caption'],
  ['events', '纪念日与事件', 'title'],
  ['daily_tasks', '每日任务', 'title'],
  ['daily_task_completions', '任务回答', 'optional_content'],
  ['couples', '空间资料', 'name'],
  ['profiles', '用户资料', 'name'],
  ['couple_members', '空间成员', 'user_id'],
  ['focus_sessions', '专注状态', 'activity'],
] as const
const LABELS: Record<string, string> = {
  id: '记录 ID',
  couple_id: '空间 ID',
  user_id: '用户 ID',
  sender_id: '发送者 ID',
  uploaded_by: '上传者 ID',
  created_by: '创建者 ID',
  content: '内容',
  kind: '类型',
  caption: '照片说明',
  story: '回忆正文',
  path: '文件路径',
  created_at: '创建时间',
  completed_at: '完成时间',
  task_id: '任务 ID',
  optional_content: '完整回答',
  description: '说明',
  task_date: '任务日期',
  task_type: '任务类型',
  title: '标题',
  name: '名称',
  avatar: '头像',
  slot: '成员席位',
  greeting_title: '寄语标题',
  greeting_subtitle: '寄语正文',
  together_since: '在一起日期',
  closed_at: '封存时间',
  target_at: '目标时间',
  occurred_on: '发生日期',
  event_id: '事件 ID',
  yearly: '每年重复',
  category: '分类',
  activity: '专注内容',
  ends_at: '结束时间',
  allow_reminders: '允许提醒',
}
function display(value: unknown): string {
  if (value === null || value === undefined) return '未设置'
  if (typeof value === 'boolean') return value ? '是' : '否'
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
}
function PhotoPreview({ id }: { id: string }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function open() {
    setBusy(true)
    setError('')
    try {
      const data = await api.get<{ url: string }>(`/data/photos/${id}/image`)
      setUrl(data.url)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="record-photo">
      {url ? (
        <>
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt="照片原图预览"
              onError={() => {
                setUrl('')
                setError('链接已过期或文件不可用，请重新加载')
              }}
            />
          </a>
          <p className="section-note">点击图片打开原图，链接有效期 5 分钟。</p>
        </>
      ) : (
        <Button tone="secondary" loading={busy} onClick={() => void open()}>
          查看照片原图
        </Button>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
export function DataPage({ route }: { route: RouteState }) {
  const params = route.params
  const entity = ENTITIES.find((item) => item[0] === params.get('entity')) || ENTITIES[0]
  const query = params.get('query') || ''
  const coupleId = params.get('couple_id') || ''
  const userId = params.get('user_id') || ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [search, setSearch] = useState({ query, coupleId, userId })
  useEffect(() => setSearch({ query, coupleId, userId }), [query, coupleId, userId])
  const request = {
    entity: entity[0],
    query,
    couple_id: coupleId || undefined,
    user_id: userId || undefined,
    page,
    page_size: 20,
  }
  const state = useApi(`data:${JSON.stringify(request)}`, (signal) =>
    api.get<Paged<Record<string, unknown>>>('/data', request, signal),
  )
  function submit(event: FormEvent) {
    event.preventDefault()
    navigateQuery('/data', params, {
      query: search.query.trim(),
      couple_id: search.coupleId.trim(),
      user_id: search.userId.trim(),
      page: 1,
    })
  }
  return (
    <>
      <PageHeader
        eyebrow="用户与空间"
        title="业务数据"
        description="查看完整业务记录、原文和照片。按类型与关联对象检索，读取操作会记录到操作日志。"
        actions={
          <Button tone="secondary" icon="refresh" loading={state.loading} onClick={state.reload}>
            刷新
          </Button>
        }
      />
      <Panel className="filter-panel" flush>
        <form className="data-filters" onSubmit={submit}>
          <label className="field">
            <span className="field-label">数据类型</span>
            <select
              value={entity[0]}
              onChange={(event) =>
                navigateQuery('/data', params, { entity: event.target.value, page: 1 })
              }
            >
              {ENTITIES.map((item) => (
                <option key={item[0]} value={item[0]}>
                  {item[1]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">搜索完整内容</span>
            <input
              type="search"
              value={search.query}
              maxLength={100}
              onChange={(event) => setSearch({ ...search, query: event.target.value })}
              placeholder="文字或完整 ID"
            />
          </label>
          <label className="field">
            <span className="field-label">空间 ID</span>
            <input
              value={search.coupleId}
              maxLength={36}
              onChange={(event) => setSearch({ ...search, coupleId: event.target.value })}
              placeholder="全部空间"
            />
          </label>
          <label className="field">
            <span className="field-label">用户 ID</span>
            <input
              value={search.userId}
              maxLength={36}
              onChange={(event) => setSearch({ ...search, userId: event.target.value })}
              placeholder="全部用户"
            />
          </label>
          <Button type="submit" icon="search">
            查询
          </Button>
          <Button
            type="button"
            tone="ghost"
            onClick={() => {
              setSearch({ query: '', coupleId: '', userId: '' })
              navigateQuery('/data', params, {
                query: null,
                couple_id: null,
                user_id: null,
                page: 1,
              })
            }}
          >
            重置
          </Button>
        </form>
      </Panel>
      <div className="section-heading">
        <div>
          <h2>{entity[1]}</h2>
          <p>{state.data ? `共 ${state.data.total} 条记录 · 每页 20 条` : '正在读取'}</p>
        </div>
        <span className="data-access-label">完整业务数据</span>
      </div>
      {state.error && <InlineError error={state.error} onRetry={state.reload} />}
      {!state.data ? (
        <StateView kind={state.error ? 'error' : 'loading'} />
      ) : state.data.rows.length === 0 ? (
        <StateView
          kind="empty"
          title="没有符合条件的记录"
          description="试试更换数据类型或清除筛选。"
        />
      ) : (
        <>
          <div className="record-list">
            {state.data.rows.map((row, index) => {
              const id = String(row.id || row.user_id || index)
              const text = display(row[entity[2]])
              return (
                <article className="record-card" key={id}>
                  <header>
                    <span className="record-kind">{entity[1]}</span>
                    <span className="mono">{id}</span>
                    <CopyButton value={id} label="复制 ID" />
                  </header>
                  <p className="record-content">{text || '无文字内容'}</p>
                  {row.couple_id ? (
                    <a
                      className="inline-link mono"
                      href={routeHref(`/couples/${row.couple_id}`, {
                        return_to: routeHref(route.path, route.params),
                      })}
                    >
                      空间 {String(row.couple_id)}
                    </a>
                  ) : null}
                  {entity[0] === 'photos' && <PhotoPreview id={id} />}
                  <details className="record-fields">
                    <summary>全部字段（{Object.keys(row).length}）</summary>
                    <dl>
                      {Object.entries(row).map(([key, value]) => (
                        <div key={key}>
                          <dt>
                            {LABELS[key] || key}
                            <small>{key}</small>
                          </dt>
                          <dd>{display(value)}</dd>
                        </div>
                      ))}
                    </dl>
                    <CopyButton value={JSON.stringify(row, null, 2)} label="复制完整记录" />
                  </details>
                </article>
              )
            })}
          </div>
          <Pagination
            page={state.data.page}
            pageSize={state.data.page_size}
            total={state.data.total}
            onChange={(page) => navigateQuery('/data', params, { page })}
          />
        </>
      )}
    </>
  )
}
