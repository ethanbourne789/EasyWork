// scripts/e2e-tauri-diag.mjs — 诊断演示登录不跳转的原因
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0]?.pages().find(p => p.url().includes('tauri.localhost'));
if (!page) { console.log('NO PAGE'); process.exit(1); }

const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));

console.log('URL:', page.url());
await page.waitForTimeout(1000);

// 点击演示登录
const btn = page.locator('button').filter({ hasText: /演示/ }).first();
console.log('demo button count:', await page.locator('button').filter({ hasText: /演示/ }).count());
await btn.click();
console.log('clicked, waiting 8s...');
await page.waitForTimeout(8000);

console.log('URL after:', page.url());
const state = await page.evaluate(() => ({
  ls: { ...localStorage },
  bodyText: document.body.innerText.slice(0, 800),
  h1: [...document.querySelectorAll('h1')].map(e => e.textContent.trim()),
}));
console.log('localStorage:', JSON.stringify(state.ls));
console.log('h1:', JSON.stringify(state.h1));
console.log('bodyText:', JSON.stringify(state.bodyText));
console.log('console logs:', JSON.stringify(logs, null, 2));
await page.screenshot({ path: 'e2e-screenshots/_diag_after_demo.png' });
await browser.close();