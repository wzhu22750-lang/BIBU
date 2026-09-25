import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { parseRoute } from '../lib/routes'
export type CapabilityResult = { supported: boolean; reason?: string }
export type NotificationPermission = CapabilityResult & { granted: boolean }
export type NotificationInput = {
  id: number
  title: string
  body: string
  route: string
  channel?: 'messages'
}
export type ScreenTimeResult = CapabilityResult & {
  granted: boolean
  milliseconds: number | null
  from?: number
  to?: number
  timezone?: string
  metric?: 'screen_interactive' | 'app_foreground'
}
export type ReminderInput = NotificationInput & { at: number }
export type ReminderRecord = ReminderInput & {
  status: 'scheduled' | 'posted' | 'blocked' | 'expired' | 'failed'
}
export type PushRegistration = CapabilityResult & { token?: string }
export type PushReceived = {
  id?: string
  title?: string
  body?: string
  data?: Record<string, unknown>
}
export interface PushDiagnostics {
  cid: string
  isPushOnline: boolean
  notificationsEnabled: boolean
  sdkVersion: string
  deviceModel: string
  androidVersion: string
}

export interface WidgetEventInput {
  name: string
  daysRemaining: number
  targetAt?: string
  yearly?: boolean
}

export interface WidgetSyncInput {
  days?: number
  togetherSince?: string
  partnerName?: string
  events?: WidgetEventInput[]
  photoUrls?: string[]
  supabaseUrl?: string
  anonKey?: string
  accessToken?: string
}

interface DevicePlugin {
  scheduleReminder(input: ReminderInput): Promise<CapabilityResult>
  pushReady(): Promise<CapabilityResult & { configured: boolean }>
  pushRegistration(): Promise<PushRegistration>
  pushUnregister(): Promise<CapabilityResult>
  getPushDiagnostics(): Promise<PushDiagnostics>
  cancelReminder(input: { id: number }): Promise<CapabilityResult>
  listReminders(): Promise<CapabilityResult & { items: ReminderRecord[] }>
  usagePermission(): Promise<NotificationPermission>
  openUsageSettings(): Promise<CapabilityResult>
  screenTimeToday(input: { packageName?: string }): Promise<ScreenTimeResult>
  notificationPermission(): Promise<NotificationPermission>
  requestNotificationPermission(): Promise<NotificationPermission>
  notify(input: NotificationInput): Promise<CapabilityResult>
  vibrate(input: { pattern: number[] }): Promise<CapabilityResult>
  syncWidgetData(input: WidgetSyncInput): Promise<CapabilityResult>
  launchRoute(): Promise<{ route?: string }>
  addListener(
    event: 'deepLink' | 'pushCid',
    listener: (value: { route?: string; token?: string }) => void,
  ): Promise<PluginListenerHandle>
}
const plugin = registerPlugin<DevicePlugin>('BiboDevice')
const native = () => Capacitor.getPlatform() === 'android'
export const isAndroidApp = native
const unavailable = (reason: string): CapabilityResult => ({ supported: false, reason })
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
export function safeNativeRoute(value: string) {
  const parsed = parseRoute(value)
  // Only internal application fragments; never execute/open an arbitrary URL.
  if (!/^#(home|chat|events|photos|focus|settings)(\?|$)/.test(value)) return '#home'
  const key = parsed.page === 'chat' ? 'message' : 'event'
  return `#${parsed.page}${parsed.referenceId ? `?${key}=${encodeURIComponent(parsed.referenceId)}` : ''}`
}
export const BibuNative = {
  notifications: {
    async show(input: NotificationInput): Promise<CapabilityResult> {
      if (!native()) return unavailable('系统通知仅在 Android 应用内可用')
      if (!Number.isInteger(input.id) || input.id < 1 || input.id > 2147483647)
        throw new Error('通知 ID 无效')
      const { channel, ...rest } = input
      return plugin.notify({
        ...rest,
        title: input.title.slice(0, 80),
        body: input.body.slice(0, 240),
        route: safeNativeRoute(input.route),
        // Only allow-listed native channels; anything else falls back to default.
        ...(channel === 'messages' ? { channel } : {}),
      })
    },
  },
  permissions: {
    async usageAccess(): Promise<NotificationPermission> {
      return native()
        ? plugin.usagePermission()
        : { ...unavailable('Web 无法读取 Android 使用情况权限'), granted: false }
    },
    async openUsageAccessSettings(): Promise<CapabilityResult> {
      return native()
        ? plugin.openUsageSettings()
        : unavailable('请在 Android 应用中授权使用情况访问')
    },
    async notifications(): Promise<NotificationPermission> {
      return native()
        ? plugin.notificationPermission()
        : { ...unavailable('Web 不申请 Android 权限'), granted: false }
    },
    async requestNotifications(): Promise<NotificationPermission> {
      return native()
        ? plugin.requestNotificationPermission()
        : { ...unavailable('请在 Android 应用中开启系统通知'), granted: false }
    },
  },
  vibration: {
    async pulse(pattern: readonly number[]): Promise<CapabilityResult> {
      if (
        pattern.length < 1 ||
        pattern.length > 20 ||
        pattern.some((n) => !Number.isFinite(n) || n < 0 || n > 1000) ||
        pattern.reduce((a, b) => a + b, 0) > 5000
      )
        throw new Error('震动节奏无效')
      if (native()) return plugin.vibrate({ pattern: [...pattern] })
      try {
        return typeof navigator !== 'undefined' && navigator.vibrate?.([...pattern])
          ? { supported: true }
          : unavailable('此浏览器不支持震动')
      } catch {
        return unavailable('设备未允许震动')
      }
    },
  },
  reminders: {
    async schedule(input: ReminderInput): Promise<CapabilityResult> {
      if (!native()) return unavailable('本机定时提醒仅在 Android 应用中可用')
      if (!Number.isInteger(input.id) || input.id < 1 || input.id > 2147483647)
        throw new Error('提醒 ID 无效')
      if (
        !Number.isFinite(input.at) ||
        input.at <= Date.now() ||
        input.at - Date.now() > 366 * 86400000
      )
        throw new Error('请选择未来一年内的提醒时间')
      return plugin.scheduleReminder({
        ...input,
        title: input.title.slice(0, 80),
        body: input.body.slice(0, 240),
        route: safeNativeRoute(input.route),
      })
    },
    async cancel(id: number): Promise<CapabilityResult> {
      if (!native()) return unavailable('此环境没有 Android 本机提醒')
      if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new Error('提醒 ID 无效')
      return plugin.cancelReminder({ id })
    },
    async list(): Promise<CapabilityResult & { items: ReminderRecord[] }> {
      return native()
        ? plugin.listReminders()
        : { ...unavailable('本机提醒仅在 Android 应用中可用'), items: [] }
    },
  },
  push: {
    async register(options: { requestPermission?: boolean } = {}): Promise<PushRegistration> {
      if (!native()) return unavailable('远程 Push 设备注册仅在 Android 应用中可用')
      try {
        const ready = await plugin.pushReady()
        if (!ready.configured)
          return {
            supported: false,
            reason: 'Android 未配置个推 GETUI_APPID，未调用 Push 注册',
          }
        let permission = await plugin.notificationPermission()
        if (!permission.granted) {
          if (options.requestPermission === false)
            return { supported: true, reason: '系统通知权限尚未开启，未主动弹出权限请求' }
          permission = await plugin.requestNotificationPermission()
        }
        if (!permission.granted) return { supported: true, reason: 'Android 系统通知权限未开启' }
        // 通知渠道由原生 BibuNotifications.ensureChannels 统一创建（个推/提醒共用），
        // 这里不需要再建。CID 由原生个推 SDK 获取。
        const registration = await withTimeout(
          plugin.pushRegistration(),
          20000,
          '个推 CID 获取超时；请确认 GETUI_APPID 已配置且应用已联网',
        )
        const cid = registration?.token
        if (!cid || cid.length < 20)
          return { supported: false, reason: 'Android 返回了无效的 Push CID' }
        return { supported: true, token: cid }
      } catch (error) {
        return {
          supported: false,
          reason: error instanceof Error ? error.message : '个推 CID 获取失败',
        }
      }
    },
    async listenReceived(): Promise<() => void> {
      // 个推透传消息统一由原生 GTIntentService 渲染系统通知（进程被杀也能弹），
      // 不再转发给 WebView，避免双重通知。
      if (!native()) return () => {}
      return () => {}
    },
    async listenRegistration(listener: (token: string) => void): Promise<() => void> {
      if (!native()) return () => {}
      let last: string | undefined
      const handle = await plugin.addListener('pushCid', (value) => {
        const token = value.token
        if (token && token.length >= 20 && token !== last) {
          last = token
          listener(token)
        }
      })
      try {
        const current = await plugin.pushRegistration()
        if (
          current?.supported &&
          current.token &&
          current.token.length >= 20 &&
          current.token !== last
        ) {
          last = current.token
          listener(current.token)
        }
      } catch {
        // CID 尚未就绪时，由 pushCid 事件补发
      }
      return () => {
        void handle.remove()
      }
    },
    async unregister(): Promise<CapabilityResult> {
      if (!native()) return unavailable('Web 没有 Android Push CID')
      try {
        await plugin.pushUnregister()
        return { supported: true }
      } catch (error) {
        return {
          supported: false,
          reason: error instanceof Error ? error.message : 'Push CID 注销失败',
        }
      }
    },
    async listenAction(listener: (route: string) => void): Promise<() => void> {
      if (!native()) return () => {}
      // 个推通知点击 → 原生通知 PendingIntent → MainActivity → deepLink 事件
      const handle = await plugin.addListener('deepLink', (value) => {
        if (value.route) listener(safeNativeRoute(value.route))
      })
      try {
        const initial = await plugin.launchRoute()
        if (initial.route) listener(safeNativeRoute(initial.route))
      } catch {
        // 冷启动意图读取失败时忽略
      }
      return () => {
        void handle.remove()
      }
    },
    async getDiagnostics(): Promise<PushDiagnostics & { supported: boolean }> {
      if (!native()) {
        return {
          supported: false,
          cid: '',
          isPushOnline: false,
          notificationsEnabled: false,
          sdkVersion: 'Web',
          deviceModel: navigator.userAgent,
          androidVersion: 'N/A',
        }
      }
      try {
        const diag = await plugin.getPushDiagnostics()
        return { supported: true, ...diag }
      } catch {
        return {
          supported: false,
          cid: '',
          isPushOnline: false,
          notificationsEnabled: false,
          sdkVersion: 'unknown',
          deviceModel: 'unknown',
          androidVersion: 'unknown',
        }
      }
    },
  },
  screenTime: {
    async today(packageName?: string): Promise<ScreenTimeResult> {
      if (packageName && !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(packageName))
        throw new Error('请输入有效 App 包名，例如 com.example.app')
      return native()
        ? plugin.screenTimeToday({ packageName: packageName || undefined })
        : { ...unavailable('Web 无法读取真实屏幕使用量'), granted: false, milliseconds: null }
    },
  },
  deepLinks: {
    async listen(listener: (route: string) => void): Promise<() => void> {
      if (!native()) return () => {}
      const handle = await plugin.addListener('deepLink', (value) =>
        listener(safeNativeRoute(value.route ?? '#home')),
      )
      try {
        const initial = await plugin.launchRoute()
        if (initial.route) listener(safeNativeRoute(initial.route))
      } catch (error) {
        await handle.remove()
        throw error
      }
      return () => {
        void handle.remove()
      }
    },
  },
  widget: {
    async syncData(input: WidgetSyncInput): Promise<CapabilityResult> {
      if (!native()) return unavailable('桌面组件仅在 Android 应用内可用')
      try {
        const payload: WidgetSyncInput = {
          days: typeof input.days === 'number' ? input.days : undefined,
          togetherSince: input.togetherSince || undefined,
          partnerName: input.partnerName ? input.partnerName.slice(0, 30) : undefined,
          events: Array.isArray(input.events)
            ? input.events.slice(0, 5).map((e) => ({
                name: (e.name || '').slice(0, 40),
                daysRemaining: Math.max(0, Math.floor(Number(e.daysRemaining) || 0)),
                targetAt: e.targetAt,
                yearly: Boolean(e.yearly),
              }))
            : [],
          photoUrls: Array.isArray(input.photoUrls)
            ? input.photoUrls.filter((u): u is string => typeof u === 'string' && !!u).slice(0, 3)
            : [],
          supabaseUrl: input.supabaseUrl || undefined,
          anonKey: input.anonKey || undefined,
          accessToken: input.accessToken || undefined,
        }
        return await plugin.syncWidgetData(payload)
      } catch (err) {
        return unavailable(err instanceof Error ? err.message : '桌面组件同步失败')
      }
    },
  },
}
export const BiboNative = BibuNative
