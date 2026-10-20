import type { AdminApiClient, AuthUser, DbError, RpcResult } from './types.ts'

// supabase-js 的 rpc() 返回可等待的 PostgREST 构造器，而不是原生 Promise。
// 这里只做一次明确的契约收窄：把 data 从 unknown 交给泛型调用方，并丢弃
// PostgREST 的 count/status 等管理 API 用不到的字段。禁止再用 as unknown as
// 整体覆盖客户端类型，否则 .catch 之类的契约错误会再次被类型系统隐藏。
export type SupabaseAdminBackend = {
  auth: {
    getUser(token: string): Promise<{
      data: { user: AuthUser | null }
      error: DbError
    }>
  }
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError }>
}

export function createAdminApiClient(backend: SupabaseAdminBackend): AdminApiClient {
  return {
    auth: backend.auth,
    rpc<T = unknown>(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult<T>> {
      return Promise.resolve(backend.rpc(name, args)).then(({ data, error }): RpcResult<T> => ({
        data: data as T,
        error: error ? { code: error.code, message: error.message } : null,
      }))
    },
  }
}
