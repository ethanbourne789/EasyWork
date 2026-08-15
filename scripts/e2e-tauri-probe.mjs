// scripts/e2e-tauri-probe.mjs
// 探索脚本：连接真实 WebView2（Tauri），dump 页面结构，点击演示登录
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const CDP = 'http://127.0.0.1:9222';
const DIR = 'e2e-screenshots';
mkdirSync(DIR, { recursive: true });

const browser = await chromium.connectOverCDP(CDP);
const contexts = browser.contexts();
console.log('contexts:', contexts.length);
const page = contexts[0]?.pages().find(p => p.url().includes('tauri.localhost')) || contexts[0]?.pages()[0];
if (!page) { console.log('NO PAGE FOUND'); process.exit(1); }

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

console.log('URL:', page.url());
console.log('TITLE:', await page.title());
await page.waitForTimeout(2000);

async function dump(tag) {
  const info = await page.evaluate(() => {
    const vis = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const btns = [...document.querySelectorAll('button')].filter(vis).map(b => b.textContent.trim()).filter(Boolean);
    const inputs = [...document.querySelectorAll('input')].filter(vis).map(i => ({ ph: i.placeholder, type: i.type }));
    const links = [...document.querySelectorAll('a')].filter(vis).map(a => a.textContent.trim()).filter(Boolean);
    const h1 = [...document.querySelectorAll('h1')].filter(vis).map(e => e.textContent.trim());
    return { btns, inputs, links, h1 };
  });
  console.log(`--- ${tag} ---`);
  console.log('h1:', JSON.stringify(info.h1));
  console.log('buttons:', JSON.stringify(info.btns));
  console.log('inputs:', JSON.stringify(info.inputs));
  console.log('links:', JSON.stringify(info.links));
  await page.screenshot({ path: `${DIR}/_probe_${tag.replace(/\W+/g, '_')}.png` });
}

await dump('login');

// 点击演示登录
const demoBtn = page.locator('button').filter({ hasText: /演示/ });
if (await demoBtn.count() > 0) {
  console.log('>>> clicking 演示登录');
  await demoBtn.first().click();
  await page.waitForTimeout(6000); // 等播种数据 + 跳转
  console.log('URL after demo:', page.url());
  await dump('after_demo');
} else {
  console.log('!!! demo button NOT found');
}

// 导航栏结构（在 dashboard 上）
const navInfo = await page.evaluate(() => {
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return [...document.querySelectorAll('nav a')].filter(vis).map(a => a.textContent.trim());
}).catch(e => 'nav err: ' + e.message);
console.log('nav links:', JSON.stringify(navInfo));

console.log('errors:', JSON.stringify(errors));
writeFileSync(`${DIR}/_probe_result.json`, JSON.stringify({ url: page.url(), errors }, null, 2));
await browser.close();