import { useEffect, useState } from 'react'
import type { SpaceController } from '../hooks/useSpace'
import {
  clearStoredPushToken,
  readStoredPushToken,
  registerDevicePush,
  storePushToken,
  unregisterDevicePush,
} from '../lib/pushRegistration'
import { disableFeedback, enableFeedback } from '../lib/notifications'
import { BibuNative, type NotificationPermission, type PushDiagnostics } from '../native'
import { Button } from './ui'

export function PushRegistrationPanel({
  controller,
  sound,
  setSound,
}: {
  controller: SpaceController
  sound?: boolean
  setSound?: (on: boolean) => void
}) {
  const initialToken = readStoredPushToken()
  const [registered, setRegistered] = useState(Boolean(initialToken))
  const [token, setToken] = useState<string | undefined>(initialToken)
  const [busy, setBusy] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [diagnostics, setDiagnostics] = useState<PushDiagnostics | null>(null)
  const [copiedCid, setCopiedCid] = useState(false)
  const [copiedReport, setCopiedReport] = useState(false)

  async function refreshDiagnostics() {
    try {
      const diag = await BibuNative.push.getDiagnostics()
      setDiagnostics(diag)
      if (diag.cid && !token) {
        setToken(diag.cid)
      }
    } catch {
      // 忽略非原生环境
    }
  }

  useEffect(() => {
    let active = true
    void BibuNative.permissions
      .notifications()
      .then((value) => {
        if (active) setPermission(value)
      })
      .catch(() => {})
    void refreshDiagnostics()

    const interval = setInterval(() => {
      void refreshDiagnostics()
    }, 8000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  const copyCid = async () => {
    const targetCid = diagnostics?.cid || token || ''
    if (!targetCid) return
    try {
      await navigator.clipboard.writeText(targetCid)
      setCopiedCid(true)
      setTimeout(() => setCopiedCid(false), 2000)
    } catch {
      setStatusMsg('复制失败')
    }
  }

  const handleTestLocalMessage = async () => {
    setBusy(true)
    setStatusMsg('正在发送通知横幅测试...')
    try {
      await BibuNative.notifications.show({
        id: 999,
        title: 'BIBU！想念通道测试',
        body: '收到来自伴侣的想念，系统通知与个推通道完全畅通！',
        route: '#chat',
        channel: 'messages',
      })
      setStatusMsg('测试横幅已投递，请查看手机通知栏')
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : '发送失败')
    } finally {
      setBusy(false)
    }
  }

  const handleRefreshRegistration = async () => {
    setBusy(true)
    setStatusMsg('正在检查状态并激活长连接...')
    try {
      const reg = await BibuNative.push.register()
      const currentToken = reg.token || diagnostics?.cid || token
      if (!currentToken) throw new Error('未获取到个推 CID')
      storePushToken(currentToken)
      setToken(currentToken)
      if (controller.space?.me?.id) {
        await registerDevicePush(controller.space.me.id, currentToken)
      }
      setRegistered(true)
      await refreshDiagnostics()
      setStatusMsg('长连接已重新激活，CID 登记成功！')
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : '激活失败')
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async () => {
    setBusy(true)
    setStatusMsg('正在撤销登记...')
    try {
      const currentToken = token || diagnostics?.cid
      if (currentToken && controller.space?.me?.id) {
        await unregisterDevicePush(controller.space.me.id, currentToken)
      }
      clearStoredPushToken()
      setToken(undefined)
      setRegistered(false)
      setStatusMsg('已从云端撤销登记')
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : '撤销失败')
    } finally {
      setBusy(false)
    }
  }

  const handleCopyReport = async () => {
    const report = [
      '--- BIBU GETUI PUSH REPORT ---',
      `time: ${new Date().toISOString()}`,
      `cid: ${diagnostics?.cid || token || 'NONE'}`,
      `isPushOnline: ${diagnostics?.isPushOnline ?? 'UNKNOWN'}`,
      `sdkVersion: ${diagnostics?.sdkVersion || '3.3.15.0'}`,
      `deviceModel: ${diagnostics?.deviceModel || 'N/A'}`,
      `androidVersion: ${diagnostics?.androidVersion || 'N/A'}`,
      `notificationPermission: ${permission?.granted ? 'GRANTED' : 'DENIED'}`,
      `registeredOnServer: ${registered}`,
      '------------------------------',
    ].join('\n')

    try {
      await navigator.clipboard.writeText(report)
      setCopiedReport(true)
      setTimeout(() => setCopiedReport(false), 2000)
      setStatusMsg('排查报告已复制到剪贴板')
    } catch {
      setStatusMsg('写入剪贴板失败')
    }
  }

  const isOnline = diagnostics?.isPushOnline === true
  const cidValue = diagnostics?.cid || token || ''

  return (
    <div className="retro-cartridge telegram-card">
      <div className="retro-window-bar bar-green">
        <span className="micro">
          <i className="sq" /> TELEGRAM · 想念信报箱
        </span>
        <div className="dots">•••</div>
      </div>

      <div className="retro-cartridge-body">
        <div className="telegram-station-box">
          {/* 状态指示胶囊 */}
          <div className="telegram-status-bar">
            {isOnline ? (
              <span className="telegram-status-pill is-online">
                <i className="pixel-status-square online" /> 链路通畅 · 在线 (ONLINE)
              </span>
            ) : (
              <span className="telegram-status-pill is-offline">
                <i className="pixel-status-square offline" /> 等待心跳 · 离线 (OFFLINE)
              </span>
            )}
            <span className="telegram-meta-pill">
              个推 SDK v{diagnostics?.sdkVersion || '3.3.15'}
            </span>
          </div>

          {/* CID 条带 */}
          <div className="telegram-cid-strip">
            <span className="telegram-cid-label">设备 CID</span>
            <span className="telegram-cid-value" title={cidValue}>
              {cidValue ? cidValue : '未分配 (点击激活)'}
            </span>
            {cidValue ? (
              <button type="button" className="telegram-copy-btn" onClick={() => void copyCid()}>
                {copiedCid ? '已复制 ✓' : '复制'}
              </button>
            ) : null}
          </div>

          {/* 状态徽章条目 */}
          <div className="telegram-meta-pills">
            <span className="telegram-meta-pill">
              机型:{' '}
              {diagnostics?.deviceModel
                ? `${diagnostics.deviceModel} (API ${diagnostics.androidVersion || '?'})`
                : 'Web / 本地环境'}
            </span>
            <span className="telegram-meta-pill">
              通知栏: {permission?.granted ? '已授权 ✓' : '未授权'}
            </span>
            <span className="telegram-meta-pill">伴侣链路: {registered ? '已绑定' : '未绑定'}</span>
          </div>

          {/* 提示消息 */}
          {statusMsg ? (
            <p className="telegram-hint-note alert">✦ {statusMsg}</p>
          ) : (
            <p className="telegram-hint-note">
              ✦ 当伴侣在远方发送想念或留言时，系统将通过本信箱即时唤醒提醒
            </p>
          )}

          {/* 按钮组 */}
          <div className="telegram-actions-grid">
            <Button tone="green" disabled={busy} onClick={() => void handleRefreshRegistration()}>
              {busy ? '正在激活…' : '重新检查 / 激活'}
            </Button>
            <Button tone="yellow" disabled={busy} onClick={() => void handleTestLocalMessage()}>
              自测通知横幅
            </Button>
            <Button tone="white" disabled={busy} onClick={() => void handleCopyReport()}>
              {copiedReport ? '已复制报告 ✓' : '复制排查报告'}
            </Button>
            {registered && (
              <Button tone="white" disabled={busy} onClick={() => void handleRevoke()}>
                撤销设备登记
              </Button>
            )}
          </div>
        </div>

        {/* 声音与震动设置嵌入在信报箱底部 */}
        {setSound && (
          <div className="retro-feedback-row" style={{ marginTop: '12px' }}>
            <div className="feedback-text">
              <h4>触感与声音音效</h4>
              <p>{sound ? '本页已授权，播放 8-bit 音效与振动' : '点击开启声音与触感振动反馈'}</p>
            </div>
            <button
              type="button"
              className={`toggle ${sound ? 'active' : ''}`}
              onClick={() => {
                if (sound) {
                  disableFeedback()
                  setSound(false)
                } else {
                  void enableFeedback()
                  setSound(true)
                }
              }}
              aria-label={sound ? '关闭声音与震动' : '开启声音与震动'}
            >
              <span />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
