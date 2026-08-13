/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** 演示账号邮箱（对应 supabase/seed.sql，公开标识，非机密）。 */
  readonly VITE_DEMO_EMAIL?: string;
  /** 演示账号密码：仅存在于本地 .env（已被 gitignore），切勿提交真实凭据。 */
  readonly VITE_DEMO_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}