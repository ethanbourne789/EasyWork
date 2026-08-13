-- ============================================================
-- 0029 邮箱密码加密函数：密钥参数化
-- 背景：0028 使用 current_setting('app.email_encryption_key', true) 读取 GUC，
--   但 ALTER DATABASE SET 需要 superuser 权限，Supabase CLI login 角色无法设置。
--   Vault.create_secret 同样受限。改为由调用方（Edge Function / 维护脚本）显式传入密钥。
-- 兼容性：enc_key 默认值仍回退到 GUC，便于在 SET app.email_encryption_key 的会话中直接调用。
-- 安全：密钥不落 DB，仅在 Edge Function env（EMAIL_ENC_KEY）与调用栈中流转。
-- ============================================================

-- 1) 重建加密函数：明文 + 密钥 -> base64 密文
DROP FUNCTION IF EXISTS public.encrypt_email_password(TEXT);
CREATE OR REPLACE FUNCTION public.encrypt_email_password(
  plaintext TEXT,
  enc_key   TEXT DEFAULT current_setting('app.email_encryption_key', true)
)
RETURNS TEXT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN plaintext IS NULL THEN NULL
    WHEN enc_key IS NULL OR enc_key = '' THEN NULL
    ELSE encode(extensions.pgp_sym_encrypt(plaintext, enc_key), 'base64')
  END;
$$;

-- 2) 重建解密函数：base64 密文 + 密钥 -> 明文
DROP FUNCTION IF EXISTS public.decrypt_email_password(TEXT);
CREATE OR REPLACE FUNCTION public.decrypt_email_password(
  ciphertext TEXT,
  enc_key    TEXT DEFAULT current_setting('app.email_encryption_key', true)
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN ciphertext IS NULL THEN NULL
    WHEN enc_key IS NULL OR enc_key = '' THEN NULL
    ELSE extensions.pgp_sym_decrypt(decode(ciphertext, 'base64'), enc_key)
  END;
$$;

-- 3) 权限：解密仅 service_role；加密 authenticated + service_role
REVOKE EXECUTE ON FUNCTION public.encrypt_email_password(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrypt_email_password(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT, TEXT) TO service_role;

-- 4) 注释
COMMENT ON FUNCTION public.encrypt_email_password(TEXT, TEXT)
  IS '加密邮箱密码：返回 base64 编码的 PGP 对称加密结果。密钥由调用方传入（Edge Function 从 EMAIL_ENC_KEY env 读取）。';
COMMENT ON FUNCTION public.decrypt_email_password(TEXT, TEXT)
  IS '解密邮箱密码：仅 service_role 可调用。密钥由调用方传入。';
