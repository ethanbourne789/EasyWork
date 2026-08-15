// scripts/e2e-mail-sync-diag.mjs — 直接调 mail_sync 诊断
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx?.pages().find(p => p.url().includes('tauri.localhost')) || ctx?.pages()[0];
if (!page) { console.log('NO PAGE'); process.exit(1); }
await page.waitForTimeout(2000);

page.on('console', m => console.log(`[c:${m.type()}] ${m.text()}`));

// 列账户
const accounts = await page.evaluate(async () => {
  return await window.__TAURI__.core.invoke('mail_list_accounts');
});
console.log('accounts count:', accounts.length);
const qq = accounts.find(a => a.email === '1633856788@qq.com');
console.log('QQ account:', qq ? { id: qq.id, email: qq.email, sync_enabled: qq.sync_enabled, last_synced_at: qq.last_synced_at } : 'NOT FOUND');

// 等 30s 让自动同步跑，然后手动再触发一次
console.log('等 30s 让同步进行...');
await page.waitForTimeout(30000);

// 直接调 mail_sync（同步全部）
console.log('>>> 调用 mail_sync (sync all)');
const r = await page.evaluate(async () => {
  try {
    return { ok: true, result: await window.__TAURI__.core.invoke('mail_sync', {}) };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
console.log('sync result:', JSON.stringify(r, null, 2));

// 同步 QQ 账户
if (qq) {
  console.log('>>> 调用 mail_sync (QQ only)');
  const r2 = await page.evaluate(async (id) => {
    try {
      return { ok: true, result: await window.__TAURI__.core.invoke('mail_sync', { accountId: id }) };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  }, qq.id);
  console.log('QQ sync result:', JSON.stringify(r2, null, 2));
}

await page.waitForTimeout(2000);
await page.screenshot({ path: 'e2e-screenshots/mail_diag_after_sync.png' });
await browser.close();