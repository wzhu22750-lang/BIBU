import { registerDeviceInstallation } from './lib/api'
import { BibuNative } from './native'
import { parseRoute } from './lib/routes'
import { recoverPendingAccountDeletion } from './lib/accountDeletionRecovery'
import { useEffect, useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import type { Session } from '@supabase/supabase-js'
import { configured, errorText, supabase } from './lib/supabase'
import {
  clearWechatParamsFromLocation,
  describeWechatError,
  exchangeWechatTicket,
  readWechatParamsFromLocation,
} from './lib/wechatAuth'
import { useBibu } from './hooks/useBibu'
import { useSpace } from './hooks/useSpace'
import { registerDevicePush, storePushToken } from './lib/pushRegistration'
import {
  disableFeedback,
  loadFeedbackEnabled,
  restoreFeedback,
  storeFeedbackEnabled,
} from './lib/notifications'
import type { Page } from './lib/types'
import { Shell } from './components/Shell'
import { SplashScreen } from './components/SplashScreen'
import { AnimatePresence } from 'framer-motion'
import { ToastContext, Button } from './components/ui'
import { Icon } from './components/PixelArt'
import { PingEffect } from './components/PingEffect'
import { Home } from './pages/Home'
import { Chat } from './pages/Chat'
import { Events } from './pages/Events'
import { Photos } from './pages/Photos'
import { Focus } from './pages/Focus'
import { Settings } from './pages/Settings'
import { Wardrobe } from './pages/Wardrobe'
import { Auth, Onboarding } from './pages/Auth'
function Workspace({
  session,
  demo,
  exitDemo,
}: {
  session: Session | null
  demo: boolean
  exitDemo: () => void
}) {
  const controller = useSpace(session, demo),
    [route, setRoute] = useState(() => parseRoute(window.location.hash)),
    [sound, setSound] = useState<boolean>(() => loadFeedbackEnabled())
  const page = route.page
  const bibu = useBibu(controller, demo)
  useEffect(() => {
    if (route.action === 'bibu' && controller.space?.couple && !bibu.busy) {
      void bibu.send('哔卟哔卟')
      // Clear action param from hash so it doesn't re-trigger
      window.location.hash = '#home'
    }
  }, [route.action, controller.space?.couple, bibu.busy])
  useEffect(() => {
    // 声音/震动偏好持久化到本机：退出或刷新后保持开启，声音在首次点击时自动恢复
    storeFeedbackEnabled(sound)
    if (sound) restoreFeedback()
    else disableFeedback()
    return () => disableFeedback()
  }, [sound])
  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  function navigate(value: Page) {
    const update = () => {
      setRoute({ page: value })
      window.location.hash = value
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      ;(document as any).startViewTransition(update)
    } else {
      update()
    }
  }
  if (controller.loading)
    return (
      <div className="loading-screen">
        <span className="loading-pixel">♥</span>
        <h2>正在连接我们的小宇宙…</h2>
      </div>
    )
  if (!controller.space)
    return (
      <div className="loading-screen">
        <h2>暂时没能打开小宇宙</h2>
        <p role="alert">{controller.error}</p>
        <Button onClick={() => void controller.reload()}>重新连接</Button>
        <Button tone="white" onClick={() => void controller.signOut().catch(() => {})}>
          退出并重新登录
        </Button>
      </div>
    )
  if (!controller.space.couple) return <Onboarding controller={controller} />
  return (
    <>
      <Shell
        page={page}
        navigate={navigate}
        space={controller.space}
        demo={demo}
        connection={controller.connection}
        bibu={bibu}
      >
        {controller.cachedAt && (
          <div className="waiting-banner" role="status">
            当前显示本机离线快照，保存于 {new Date(controller.cachedAt).toLocaleString()}
            。成员与记录可能已变化；照片需联网重新获取，待发消息仍须服务器验证权限。
          </div>
        )}
        {controller.cacheError && (
          <div className="error-banner" role="alert">
            本机快照保存失败：{controller.cacheError}。云端数据不受影响。
          </div>
        )}
        {controller.error && (
          <div className="error-banner" role="alert">
            同步失败，以下可能是旧数据：{controller.error}
            <button onClick={() => void controller.reload()}>重试</button>
          </div>
        )}
        {!controller.space.partner && page !== 'chat' && (
          <div className="waiting-banner">
            你的空间已准备好，去「空间设置」生成邀请码，邀请 TA 加入。
            <button onClick={() => navigate('settings')}>生成邀请码 →</button>
          </div>
        )}
        {page === 'home' && (
          <Home controller={controller} navigate={navigate} demo={demo} bibu={bibu} />
        )}{' '}
        {page === 'chat' && (
          <Chat controller={controller} demo={demo} referenceId={route.referenceId} />
        )}{' '}
        {page === 'events' && <Events controller={controller} referenceId={route.referenceId} />}{' '}
        {page === 'photos' && <Photos controller={controller} demo={demo} />}{' '}
        {page === 'focus' && <Focus controller={controller} />}{' '}
        {page === 'wardrobe' && (
          <Wardrobe controller={controller} navigate={navigate} initialMode={route.wardrobeMode} />
        )}{' '}
        {page === 'settings' && (
          <Settings
            controller={controller}
            navigate={navigate}
            demo={demo}
            exitDemo={exitDemo}
            sound={sound}
            setSound={setSound}
          />
        )}
      </Shell>
      {controller.ping && <PingEffect ping={controller.ping} onClose={controller.dismissPing} />}
    </>
  )
}
export default function App() {
  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    void BibuNative.deepLinks
      .listen((route) => {
        window.location.hash = route
      })
      .then((cleanup) => {
        if (disposed) cleanup()
        else stop = cleanup
      })
      .catch((error) => console.warn('无法初始化通知跳转', errorText(error)))
    return () => {
      disposed = true
      stop?.()
    }
  }, [])
  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    void BibuNative.push
      .listenAction((route) => {
        window.location.hash = route
      })
      .then((cleanup) => {
        if (disposed) cleanup()
        else stop = cleanup
      })
      .catch(() => {})
    return () => {
      disposed = true
      stop?.()
    }
  }, [])
  const [session, setSession] = useState<Session | null>(null),
    [initializing, setInitializing] = useState(configured),
    [demo, setDemo] = useState(!configured),
    [splashVisible, setSplashVisible] = useState(true),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(null)
  // 启动屏只做展示：主界面在它下方照常初始化，不阻塞启动。
  const hideSplash = useCallback(() => setSplashVisible(false), [])
  useEffect(() => {
    if (!session || !configured) return
    let active = true
    let stop: (() => void) | undefined
    void (async () => {
      try {
        // Install the refresh listener before the first registration call so a
        // very fast push notification callback cannot be lost. The silent attempt only
        // repairs an already-granted installation; the visible Settings action
        // remains the place that asks for notification permission.
        const cleanup = await BibuNative.push.listenRegistration((token) => {
          if (active)
            void registerDeviceInstallation(session.user.id, token, 'bibu-0.1.0')
              .then(() => storePushToken(token))
              .catch(() => {})
        })
        if (!active) {
          cleanup()
          return
        }
        stop = cleanup
        const result = await registerDevicePush(
          session.user.id,
          'bibu-0.1.0',
          BibuNative,
          undefined,
          false,
        )
        if (active && result.stored && result.token) storePushToken(result.token)
      } catch {
        // Push is optional; the Settings panel exposes the actionable reason.
      }
    })()
    return () => {
      active = false
      stop?.()
    }
  }, [session?.user.id])
  useEffect(() => {
    void recoverPendingAccountDeletion().then((errors) => {
      if (errors.length)
        setToast({ message: `上次注销后的本机清理未完全确认：${errors.join('；')}`, error: true })
    })
  }, [])
  // 微信快捷登录/绑定回跳处理：
  // 1. 登录回跳携带 wechat_ticket：向服务端原子换取合法 Supabase 会话并写入客户端
  // 2. 绑定回跳携带 wechat_bind=success：提示绑定成功
  // 3. 授权取消或错误携带 wechat_error：提示普通用户易懂的说明文案
  useEffect(() => {
    const params = readWechatParamsFromLocation(window.location)
    if (!params.ticket && !params.error && !params.bindSuccess) return
    clearWechatParamsFromLocation()

    if (params.error) {
      setToast({ message: describeWechatError(params.error), error: true })
      return
    }
    if (params.bindSuccess) {
      setToast({ message: '微信绑定成功！后续可用微信或邮箱快捷登录同一账号', error: false })
      return
    }
    if (params.ticket) {
      void exchangeWechatTicket(params.ticket)
        .then(() => {
          setToast({ message: '微信快捷登录成功，欢迎回家！', error: false })
        })
        .catch((err) => {
          setToast({ message: describeWechatError(err), error: true })
        })
    }
  }, [])
  useEffect(() => {
    if (!supabase) return
    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) {
        setSession(next)
        setInitializing(false)
      }
    })
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          if (error) setToast({ message: errorText(error), error: true })
          setSession(data.session)
          setInitializing(false)
        }
      })
      .catch((e) => {
        if (active) {
          setToast({ message: errorText(e), error: true })
          setInitializing(false)
        }
      })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = CapApp.addListener('backButton', ({ canGoBack }) => {
      const dialogs = document.querySelectorAll('dialog[open]')
      // 取最后一个（DOM 树中最深/最新）的弹窗，避免嵌套的日期/时间选择器打开时
      // 返回键误关外层表单弹窗。
      const dialog = dialogs[dialogs.length - 1] as HTMLDialogElement | undefined
      if (dialog) {
        dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
        return
      }
      if (document.querySelector('.dock-more')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        return
      }
      const route = parseRoute(window.location.hash)
      if (route.page !== 'home' || window.location.hash !== '#home') {
        if (canGoBack) window.history.back()
        else window.location.hash = '#home'
        return
      }
      void CapApp.exitApp()
    })
    return () => {
      void listener.then((handle) => handle.remove())
    }
  }, [])
  // 个推透传消息统一由原生 BibuGTIntentService 渲染系统通知（含进程被杀场景），
  // WebView 不再为 push 弹通知，避免双重通知。
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !supabase) return
    let active = true
    const consumed = new Set<string>()
    const exchange = async (raw: string | undefined) => {
      if (!raw || !active) return
      try {
        const url = new URL(raw)
        // Auth callbacks use the app's exact custom scheme and no host/path.
        // Do not exchange arbitrary deep-link query parameters as PKCE codes.
        if (
          url.protocol !== 'love.bibu.space:' ||
          url.hostname ||
          !['', '/'].includes(url.pathname)
        )
          return
        const code = url.searchParams.get('code')
        if (!code || code.length < 10 || code.length > 4096 || /[\u0000-\u001f\u007f]/.test(code))
          return
        if (consumed.has(code)) return
        consumed.add(code)
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (active && error) setToast({ message: errorText(error), error: true })
      } catch (e) {
        if (active) setToast({ message: errorText(e), error: true })
      }
    }
    const listener = CapApp.addListener('appUrlOpen', (data) => {
      void exchange(data.url)
    })
    void CapApp.getLaunchUrl()
      .then((data) => exchange(data?.url))
      .catch((error) => {
        if (active) console.warn('无法读取冷启动登录链接', errorText(error))
      })
    return () => {
      active = false
      void listener.then((l) => l.remove())
    }
  }, [])
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), toast.error ? 12000 : 4500)
      return () => clearTimeout(t)
    }
  }, [toast])
  return (
    <ToastContext.Provider value={(message, error = false) => setToast({ message, error })}>
      <a
        href="#main"
        className="skip-link"
        onClick={(event) => {
          // `#main` is a document fragment, not an application page. Prevent
          // the hash router from interpreting the accessibility link as Home.
          event.preventDefault()
          const main = document.getElementById('main')
          main?.focus({ preventScroll: false })
        }}
      >
        跳到主要内容
      </a>
      {initializing && !demo ? (
        <div className="loading-screen">正在连接…</div>
      ) : demo || session ? (
        <Workspace
          key={demo ? 'demo' : session!.user.id}
          session={session}
          demo={demo}
          exitDemo={() => setDemo(false)}
        />
      ) : (
        <Auth enterDemo={() => setDemo(true)} />
      )}{' '}
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          <Icon name={toast.error ? 'close' : 'check'} size={18} />
          <span>{toast.message}</span>
          <button aria-label="关闭提示" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}{' '}
      <AnimatePresence>
        {splashVisible && <SplashScreen key="splash" onDone={hideSplash} />}
      </AnimatePresence>
    </ToastContext.Provider>
  )
}
