import { api } from '../lib/api'
import { useApi } from '../lib/useApi'
import type { SystemHealth } from '../lib/types'
import { formatDateTime, formatNumber, stageLabels } from '../lib/format'
import { navigate } from '../lib/route'
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
} from '../components/ui'
import type { RouteState } from '../lib/route'

export function SystemPage({ route: _route }: { route: RouteState }) {
  const state = useApi('system', (signal) => api.get<SystemHealth>('/system', undefined, signal))
  const data = state.data
  const build = __ADMIN_BUILD__

  return (
    <>
      <PageHeader
        eyebrow="系统状态"
        title="系统状态"
        description="这里只展示真实可取得的数据库与诊断计数，不伪造 CPU、内存、实时在线人数或图表。"
        actions={
          <Button tone="secondary" icon="refresh" loading={state.loading} onClick={state.reload}>
            刷新
          </Button>
        }
      />

      {state.error && !data ? (
        <StateView
          kind="error"
          title="系统状态加载失败"
          description={<InlineError error={state.error} />}
          action={<Button onClick={state.reload}>重新加载</Button>}
        />
      ) : !data ? (
        <StateView kind="loading" />
      ) : (
        <>
          <div className="metric-grid metric-grid-4">
            <article className="metric-card">
              <span className="metric-label">管理 API</span>
              <strong className="metric-value">
                <StatusPill tone="ok">在线</StatusPill>
              </strong>
              <p className="metric-foot">本次请求已通过身份、会话与能力校验</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">数据库</span>
              <strong className="metric-value">
                <StatusPill tone={data.database === 'ok' ? 'ok' : 'danger'}>
                  {data.database === 'ok' ? '正常' : data.database}
                </StatusPill>
              </strong>
              <p className="metric-foot">服务端时间 {formatDateTime(data.database_time)}</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">近 24 小时推送失败</span>
              <strong className="metric-value">
                {formatNumber(data.counts.push_failures_24h)}
              </strong>
              <p className="metric-foot">
                尝试 {formatNumber(data.counts.push_attempts_24h)} 次 ·{' '}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => navigate('/diagnostics', { status: 'failed' })}
                >
                  查看诊断
                </button>
              </p>
            </article>
            <article className="metric-card">
              <span className="metric-label">近 7 天审计失败</span>
              <strong className="metric-value">
                {formatNumber(data.counts.audit_failures_7d)}
              </strong>
              <p className="metric-foot">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => navigate('/audit', { success: 'failure' })}
                >
                  查看失败记录
                </button>
              </p>
            </article>
          </div>

          <Panel title="数据规模" subtitle="直接来自数据库计数，按请求时刻计算">
            <DetailGrid
              columns={3}
              items={[
                { label: '账号总数', value: formatNumber(data.counts.users) },
                { label: '双人空间总数', value: formatNumber(data.counts.couples) },
                { label: '未解决工单', value: formatNumber(data.counts.open_tickets) },
                { label: '近 24h 推送尝试', value: formatNumber(data.counts.push_attempts_24h) },
                { label: '近 24h 推送失败', value: formatNumber(data.counts.push_failures_24h) },
                { label: '近 7 天审计失败', value: formatNumber(data.counts.audit_failures_7d) },
              ]}
            />
          </Panel>

          <div className="split-grid">
            <Panel
              title="最近审计失败"
              subtitle="最多 5 条；错误码为脱敏后类别"
              actions={
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={() => navigate('/audit', { success: 'failure' })}
                >
                  全部
                </Button>
              }
              flush
            >
              {data.recent_audit_failures.length === 0 ? (
                <StateView kind="empty" title="没有审计失败记录" />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>时间</th>
                        <th>动作</th>
                        <th>目标</th>
                        <th>错误码</th>
                        <th>请求 ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_audit_failures.map((item) => (
                        <tr key={`${item.request_id}:${item.created_at}`}>
                          <td>{formatDateTime(item.created_at)}</td>
                          <td className="mono">{item.action}</td>
                          <td>
                            {item.target_type}
                            <small className="block-muted mono">{item.target_id || '—'}</small>
                          </td>
                          <td className="mono">{item.error_code || '—'}</td>
                          <td>
                            <span className="copy-row">
                              <span className="mono">{item.request_id}</span>
                              <CopyButton value={item.request_id} label="复制" />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel
              title="最近推送失败"
              subtitle="近 24 小时，最多 5 条"
              actions={
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={() => navigate('/diagnostics', { status: 'failed' })}
                >
                  全部
                </Button>
              }
              flush
            >
              {data.recent_push_failures.length === 0 ? (
                <StateView kind="empty" title="近 24 小时没有失败记录" />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>事件</th>
                        <th>尝试</th>
                        <th>错误码</th>
                        <th>最近时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_push_failures.map((item) => (
                        <tr key={`${item.event_type}:${item.event_id}`}>
                          <td>
                            {item.event_type === 'message' ? '消息' : '提醒'}
                            <small className="block-muted mono">{item.event_id}</small>
                          </td>
                          <td>{formatNumber(item.attempts)}</td>
                          <td className="mono">{item.error_code || '—'}</td>
                          <td>{formatDateTime(item.last_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <Panel title="构建与采集覆盖" subtitle="缺少的采集项会明确列出，不显示伪造指标">
            <DetailGrid
              columns={2}
              items={[
                { label: '管理台提交', value: <span className="mono">{build.commit}</span> },
                { label: '构建时间', value: formatDateTime(build.builtAt) },
                { label: '构建模式', value: build.mode },
                { label: '数据库版本', value: <span className="mono">{data.pg_version}</span> },
                {
                  label: '诊断保留',
                  value: `${data.diagnostic_retention_days} 天`,
                },
                {
                  label: '已采集阶段',
                  value: data.diagnostic_coverage.collected.join(' / '),
                },
                {
                  label: '未采集阶段',
                  value: data.diagnostic_coverage.not_collected.join(' / '),
                },
              ]}
            />
            <SectionNote>
              数据库状态来自一次真实查询，不代表持续可用性监控；推送失败数与审计失败数为计数快照，
              不提供趋势推断。阶段字典：{Object.values(stageLabels).join(' / ')}。
            </SectionNote>
          </Panel>
        </>
      )}
    </>
  )
}
