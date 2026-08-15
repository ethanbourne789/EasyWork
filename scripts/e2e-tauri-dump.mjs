// scripts/e2e-tauri-dump.mjs — dump 当前页面结构（导航/标题/卡片/按钮）
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0]?.pages().find(p => p.url().includes('tauri.localhost'));
if (!page) { console.log('NO PAGE'); process.exit(1); }

console.log('URL:', page.url());
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
  const q = sel => [...document.querySelectorAll(sel)].filter(vis).map(e => e.textContent.trim()).filter(Boolean);
  return {
    h1: q('h1'), h2: q('h2'), h3: q('h3'),
    nav: q('nav a'),
    buttons: q('button').slice(0, 40),
    cards: q('[class*="card"]').slice(0, 20),
    body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500),
  };
});
console.log('h1:', JSON.stringify(info.h1));
console.log('h2:', JSON.stringify(info.h2.slice(0, 10)));
console.log('nav:', JSON.stringify(info.nav));
console.log('buttons:', JSON.stringify(info.buttons.slice(0, 25)));
console.log('cards:', JSON.stringify(info.cards.slice(0, 12)));
console.log('body:', JSON.stringify(info.body));
await page.screenshot({ path: 'e2e-screenshots/_dump_dashboard.png' });
await browser.close();