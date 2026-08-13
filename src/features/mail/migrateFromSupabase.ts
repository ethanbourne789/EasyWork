import { supabase } from '@/lib/supabase';
import { mailApi } from './mailApi';

/**
 * 首启动时从 Supabase 迁移邮箱账号到本地 SQLite + keyring 存储。
 * 仅在本地数据库无账号时执行，避免重复迁移。
 *
 * 注意：Supabase 中的密码可能是加密存储的（通过 EMAIL_ENC_KEY 加密），
 * 前端 anon key 无法解密。如果密码字段为空或为密文，迁移后用户需要
 * 在设置中重新输入密码。
 */
export async function migrateAccountsFromSupabase(): Promise<{ migrated: number; skipped: number }> {
  // 检查是否已迁移 — 本地已有账号则跳过
  const existing = await mailApi.listAccounts();
  if (existing.length > 0) {
    return { migrated: 0, skipped: existing.length };
  }

  // 从 Supabase 读取邮箱账号
  const { data: accounts, error } = await supabase
    .from('email_accounts')
    .select('*');

  if (error) {
    console.warn('[mail-migrate] 从 Supabase 读取账号失败:', error.message);
    return { migrated: 0, skipped: 0 };
  }

  if (!accounts || accounts.length === 0) {
    return { migrated: 0, skipped: 0 };
  }

  let migrated = 0;
  for (const account of accounts) {
    try {
      await mailApi.addAccount({
        email: account.email,
        displayName: account.display_name ?? undefined,
        username: account.username ?? undefined,
        // 密码可能是加密的，如果密码为空或加密，用户需要重新输入
        password: account.password ?? '',
        imapHost: account.imap_host,
        imapPort: account.imap_port,
        smtpHost: account.smtp_host,
        smtpPort: account.smtp_port,
        useSsl: account.use_ssl ?? true,
      });
      migrated++;
      console.log(`[mail-migrate] 已迁移账号: ${account.email}`);
    } catch (e) {
      console.error(`[mail-migrate] 迁移账号 ${account.email} 失败:`, e);
    }
  }

  return { migrated, skipped: 0 };
}