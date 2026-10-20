export type AdminRole = 'owner' | 'operator' | 'support' | 'maintainer'

export type AdminActor = {
  found: boolean
  user_id?: string
  role?: AdminRole
  status?: 'active' | 'suspended'
  display_name?: string
  session_alive?: boolean
  capabilities?: string[]
}

export type AuthUser = {
  id: string
  email?: string | null
}

export type DbError = {
  code?: string
  message?: string
} | null

export type RpcResult<T> = {
  data: T
  error: DbError
}

export type AdminApiClient = {
  auth: {
    getUser(token: string): Promise<{
      data: { user: AuthUser | null }
      error: DbError
    }>
  }
  // supabase-js 的 PostgREST 构造器只承诺 PromiseLike（有 then，没有 catch）。
  // 这里保留真实契约，调用方必须用 await/try-catch，不能假设是原生 Promise。
  rpc<T = unknown>(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult<T>>
}

export type JwtClaims = {
  sub?: string
  session_id?: string
  exp?: number
}

export type HandlerOptions = {
  client: AdminApiClient
  allowedOrigins: string[]
  envLabel: string
  now?: () => Date
}
