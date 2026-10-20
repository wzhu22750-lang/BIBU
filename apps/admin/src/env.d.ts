/// <reference types="vite/client" />

declare const __ADMIN_BUILD__: {
  commit: string
  builtAt: string
  mode: string
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_ADMIN_API_URL?: string
  readonly VITE_ADMIN_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
