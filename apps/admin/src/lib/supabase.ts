import { createClient } from '@supabase/supabase-js'

// 管理台只使用浏览器公开凭据；所有管理数据仍由 admin-api 与 RLS 控制。
export const DEFAULT_URL = 'https://zqwzdoejxsfscisudacu.supabase.co'
export const DEFAULT_KEY = 'sb_publishable_nxRhiAvRRQ_lwAQ9vaz_Og_yEqfC-V8'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || DEFAULT_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || DEFAULT_KEY

export const SUPABASE_URL = url
export const SUPABASE_KEY = key
// 管理台只展示密码框，登录邮箱固定为专用管理员账号。
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL?.trim() || 'admin@515171.xyz'
export const ADMIN_API_URL =
  import.meta.env.VITE_ADMIN_API_URL?.trim().replace(/\/+$/, '') ||
  `${url.replace(/\/+$/, '')}/functions/v1/admin-api`

export const supabase = createClient(url, key, {
  auth: {
    storageKey: 'bibu-admin-auth',
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
