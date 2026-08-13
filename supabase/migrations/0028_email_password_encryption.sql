-- email_accounts.password 加密存储（H2）
-- 使用 pgcrypto 的 pgp_sym_encrypt 加密，密钥由环境变量 SUPABASE_EMAIL_ENCRYPTION_KEY 提供
-- 注意：此迁移仅创建加密/解密函数，不自动迁移存量数据（需手动迁移）
-- Edge Function 需传入加密密钥才能解密密码

-- 确保 pgcrypto 扩展存在
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 加密函数：传入明文密码，返回加密文本（base64 编码便于存储在 text 列）
-- 使用方法：UPDATE email_accounts SET password = encrypt_email_password('明文密码') WHERE id = ...;
-- 注意：pgcrypto 安装在 extensions schema，需全限定函数名
CREATE OR REPLACE FUNCTION public.encrypt_email_password(plaintext TEXT)
RETURNS TEXT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.pgp_sym_encrypt(plaintext, current_setting('app.email_encryption_key', true)), 'base64');
$$;

-- 解密函数：传入 base64 编码的加密文本，返回明文密码
-- 仅 service_role 可调用（通过 GRANT 控制）
CREATE OR REPLACE FUNCTION public.decrypt_email_password(ciphertext TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_decrypt(decode(ciphertext, 'base64'), current_setting('app.email_encryption_key', true));
$$;

-- 仅 service_role 可调用解密函数
REVOKE EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_email_password(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_email_password(TEXT) TO authenticated, service_role;

-- 注意：存量数据迁移需手动执行，步骤：
-- 1. 在 Supabase Dashboard 设置 secret: SUPABASE_EMAIL_ENCRYPTION_KEY
-- 2. 执行: SET app.email_encryption_key = 'your-secret-key';
-- 3. UPDATE email_accounts SET password = encrypt_email_password(password) WHERE password NOT LIKE '-----BEGIN%';
-- 4. Edge Function 需通过 RPC 调用 decrypt_email_password 获取明文
