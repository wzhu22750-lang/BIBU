import { clearTicketDrafts } from './ticketDraft'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, api, errorMessage, isAuthFailure, setAuthFailureHandler } from './api'
import { ADMIN_EMAIL, supabase } from './supabase'
import type { AdminSession, AuthContextData } from './types'

export type Gate = 'loading' | 'signed_out' | 'denied' | 'ready' | 'error'
export type DeniedReason = 'not_admin' | 'uninitialized' | 'suspended' | 'session_expired'

type AuthState = {
  gate: Gate
  context: AuthContextData | null
  session: AdminSession | null
  email: string | null
  error: string | null
  deniedReason: DeniedReason | null
}

type AuthContextValue = AuthState & {
  signIn: (password: string) => Promise<void>
  signOut: () => Promise<void>
  retry: () => Promise<void>
  revalidate: () => Promise<void>
  can: (capability: string) => boolean
}

const INITIAL: AuthState = {
  gate: 'loading',
  context: null,
  session: null,
  email: null,
  error: null,
  deniedReason: null,
}

const AuthContext = createContext<AuthContextValue | null>(null)

function mapLoginError(error: { message?: string; code?: string; status?: number }): string {
  const message = (error.message || '').toLowerCase()
  if (message.includes('invalid login credentials')) return '邮箱或密码不正确'
  if (message.includes('email not confirmed')) return '该账号邮箱尚未验证，请联系所有者处理'
  if (error.status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return '登录尝试过于频繁，请稍后再试'
  }
  return '暂时无法登录，请稍后重试'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL)
  const runId = useRef(0)
  const gateRef = useRef<Gate>('loading')
  gateRef.current = state.gate

  const evaluate = useCallback(async (silent = false) => {
    const currentRun = ++runId.current
    if (!silent) setState((previous) => ({ ...previous, gate: 'loading', error: null }))
    const apply = (next: Partial<AuthState>) => {
      if (currentRun !== runId.current) return
      setState((previous) => ({ ...previous, ...next }))
    }

    try {
      const { data, error } = await supabase.auth.getSession()
      if (currentRun !== runId.current) return
      if (error || !data.session) {
        apply({
          gate: 'signed_out',
          context: null,
          session: null,
          email: null,
          error: null,
          deniedReason: null,
        })
        return
      }
      const email = data.session.user.email || null
      const context = await api.authContext()
      if (currentRun !== runId.current) return

      if (!context.initialized) {
        apply({
          gate: 'denied',
          context,
          email,
          session: null,
          deniedReason: 'uninitialized',
          error: null,
        })
        return
      }
      if (!context.is_admin) {
        apply({
          gate: 'denied',
          context,
          email,
          session: null,
          deniedReason: 'not_admin',
          error: null,
        })
        return
      }
      if (context.status === 'suspended') {
        apply({
          gate: 'denied',
          context,
          email,
          session: null,
          deniedReason: 'suspended',
          error: null,
        })
        return
      }
      if (!context.session_alive) {
        apply({
          gate: 'denied',
          context,
          email,
          session: null,
          deniedReason: 'session_expired',
          error: null,
        })
        return
      }
      const session = await api.session()
      apply({
        gate: 'ready',
        context,
        session,
        email,
        error: null,
        deniedReason: null,
      })
    } catch (error) {
      if (currentRun !== runId.current) return
      if (error instanceof ApiError) {
        if (error.code === 'not_admin') {
          apply({ gate: 'denied', deniedReason: 'not_admin', session: null, error: null })
          return
        }
        if (error.code === 'admin_suspended') {
          apply({ gate: 'denied', deniedReason: 'suspended', session: null, error: null })
          return
        }
        if (error.code === 'unauthorized' || error.code === 'session_expired') {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
          apply({
            gate: 'signed_out',
            context: null,
            session: null,
            email: null,
            error: '登录已失效，请重新登录',
            deniedReason: null,
          })
          return
        }
      }
      apply({
        gate: 'error',
        session: null,
        error: errorMessage(error),
      })
    }
  }, [])

  useEffect(() => {
    void evaluate()
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearTicketDrafts()
        runId.current += 1
        setState({ ...INITIAL, gate: 'signed_out' })
      } else if (event === 'TOKEN_REFRESHED' && gateRef.current === 'ready') {
        void evaluate(true)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [evaluate])

  useEffect(() => {
    setAuthFailureHandler(() => {
      void evaluate(true)
    })
    return () => setAuthFailureHandler(null)
  }, [evaluate])

  const revalidate = useCallback(async () => {
    if (gateRef.current !== 'ready') return
    try {
      const session = await api.session()
      setState((previous) => ({ ...previous, session }))
    } catch (error) {
      if (isAuthFailure(error)) void evaluate(true)
    }
  }, [evaluate])

  useEffect(() => {
    if (state.gate !== 'ready') return
    let last = 0
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - last < 60_000) return
      last = Date.now()
      void revalidate()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void revalidate()
    }, 120_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [state.gate, revalidate])

  const signIn = useCallback(
    async (password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password,
      })
      if (error) throw new Error(mapLoginError(error))
      await evaluate()
    },
    [evaluate],
  )

  const signOut = useCallback(async () => {
    clearTicketDrafts()
    runId.current += 1
    // signOut({scope:'local'}) 会请求 GoTrue 撤销当前会话，再清理本地凭据。
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    setState({ ...INITIAL, gate: 'signed_out' })
  }, [])

  const retry = useCallback(async () => {
    await evaluate()
  }, [evaluate])

  const can = useCallback(
    (capability: string) => Boolean(state.session?.actor.capabilities.includes(capability)),
    [state.session],
  )

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signOut, retry, revalidate, can }),
    [state, signIn, signOut, retry, revalidate, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return value
}
