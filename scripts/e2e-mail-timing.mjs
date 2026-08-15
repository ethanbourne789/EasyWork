// 测命令耗时对比：list_accounts vs mail_sync(QQ)
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx?.pages().find(p => p.url().includes('tauri.localhost')) || ctx?.pages()[0];
if (!page) { console.log('NO PAGE'); process.exit(1); }
await page.waitForTimeout(1000);

const t0 = Date.now();
const accounts = await page.evaluate(async () => await window.__TAURI__.core.invoke('mail_list_accounts'));
console.log(`mail_list_accounts 耗时 ${Date.now() - t0}ms, 账户数=${accounts.length}`);

const qq = accounts.find(a => a.email === '1633856788@qq.com');
const t1 = Date.now();
const r1 = await page.evaluate(async (id) => {
  try { return { ok: true, r: await window.__TAURI__.core.invoke('mail_sync', { accountId: id }) }; }
  catch (e) { return { ok: false, e: String(e) }; }
}, qq.id);
console.log(`mail_sync(QQ) 第1次 耗时 ${Date.now() - t1}ms → ${JSON.stringify(r1)}`);

await page.waitForTimeout(500);
const t2 = Date.now();
const r2 = await page.evaluate(async (id) => {
  try { return { ok: true, r: await window.__TAURI__.core.invoke('mail_sync', { accountId: id }) }; }
  catch (e) { return { ok: false, e: String(e) }; }
}, qq.id);
console.log(`mail_sync(QQ) 第2次 耗时 ${Date.now() - t2}ms → ${JSON.stringify(r2)}`);

await browser.close();