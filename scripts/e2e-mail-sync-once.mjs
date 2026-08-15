// scripts/e2e-mail-sync-once.mjs — 极简：只调一次 QQ sync，立即读 trace
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx?.pages().find(p => p.url().includes('tauri.localhost')) || ctx?.pages()[0];
if (!page) { console.log('NO PAGE'); process.exit(1); }
await page.waitForTimeout(1500);

const accounts = await page.evaluate(async () => await window.__TAURI__.core.invoke('mail_list_accounts'));
const qq = accounts.find(a => a.email === '1633856788@qq.com');
console.log('QQ id:', qq?.id);

const t0 = Date.now();
const r = await page.evaluate(async (id) => {
  try {
    return { ok: true, result: await window.__TAURI__.core.invoke('mail_sync', { accountId: id }) };
  } catch (e) { return { ok: false, error: String(e) }; }
}, qq.id);
console.log(`sync 耗时 ${Date.now() - t0}ms, 结果:`, JSON.stringify(r, null, 2));

await page.waitForTimeout(1000);
await browser.close();