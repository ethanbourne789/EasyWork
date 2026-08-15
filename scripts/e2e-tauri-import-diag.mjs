// scripts/e2e-tauri-import-diag.mjs — 直接调用 data_import_all 验证后端
import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'node:fs';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx?.pages().find(p => p.url().includes('tauri.localhost')) || ctx?.pages()[0];
if (!page) { console.log('NO PAGE'); process.exit(1); }
await page.waitForTimeout(3000);

// 找最新备份
const SHOT = 'e2e-screenshots';
const backups = readdirSync(SHOT).filter(f => /p1_backup_\d+\.json/.test(f)).sort();
const dump = JSON.parse(readFileSync(`${SHOT}/${backups[backups.length - 1]}`, 'utf-8'));
const TS = Date.now();
const first = dump.tasks[0];
dump.tasks[0] = { ...first, id: `e2e-direct-${TS}`, title: `E2E直调-${TS}` };

console.log('has __TAURI__:', await page.evaluate(() => !!window.__TAURI__));
console.log('has __TAURI_INTERNALS__:', await page.evaluate(() => !!window.__TAURI_INTERNALS__));

try {
  const result = await page.evaluate(async (data) => {
    try {
      if (window.__TAURI__?.core?.invoke) {
        return { ok: true, via: '__TAURI__.core', result: await window.__TAURI__.core.invoke('data_import_all', { data }) };
      }
      if (window.__TAURI_INTERNALS__?.invoke) {
        return { ok: true, via: '__TAURI_INTERNALS__', result: await window.__TAURI_INTERNALS__.invoke('data_import_all', { data }) };
      }
      return { ok: false, via: 'none', error: 'no invoke access' };
    } catch (e) {
      return { ok: false, via: 'try', error: String(e?.message || e), stack: String(e?.stack || '').slice(0, 300) };
    }
  }, dump);
  console.log('direct import result:', JSON.stringify(result, null, 2));
} catch (e) {
  console.log('page.evaluate failed:', e.message);
}

await browser.close();