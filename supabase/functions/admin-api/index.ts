import { createClient } from 'npm:@supabase/supabase-js@2'
import { createAdminApiClient } from './client.ts'
import { createHandler } from './handler.ts'

const DEFAULT_ORIGINS = [
  'https://www.515171.xyz',
  'https://515171.xyz',
  'https://admin.515171.xyz',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
]

const url = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const allowedOrigins = (Deno.env.get('ADMIN_ALLOWED_ORIGINS') || DEFAULT_ORIGINS.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const envLabel = Deno.env.get('ADMIN_ENV_LABEL') || 'production'

if (!url || !serviceKey) {
  Deno.serve(
    () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'not_ready',
            message: 'admin-api 尚未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY',
          },
        }),
        { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
      ),
  )
} else {
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  Deno.serve(
    createHandler({
      client: createAdminApiClient(supabase),
      allowedOrigins,
      envLabel,
    }),
  )
}
