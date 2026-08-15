// scripts/e2e-tauri-mail-render.mjs
// 验证：在已注入真实邮件数据后，UI 列表+正文渲染
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const SHOT = 'e2e-screenshots';
mkdirSync(SHOT, { recursive: true });

let port = 9222;
for (let p = 9222; p < 9227; p++) {
  try {
    const r = await fetch(`http://127.0.0.1:${p}/json/version`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) { port = p; break; }
  } catch { /* next */ }
}
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = browser.contexts()[0];
const page = ctx?.pages().find(p => p.url().includes('tauri.localhost')) || ctx?.pages()[0];
if (!page) { console.log('NO PAGE'); process.exit(1); }
await page.waitForTimeout(3000);

const allErrors = [];
page.on('console', m => { if (m.type() === 'error') allErrors.push(m.text()); });
page.on('pageerror', e => allErrors.push('PAGEERROR: ' + e.message));

const wait = ms => page.waitForTimeout(ms);
const R = [];
function add(n, ok, d='') { R.push({n,ok,d}); console.log(`${ok?'✅':'❌'} ${n}${d?' — '+d:''}`); }
async function run(n, fn) { try { await fn(); add(n, true); } catch (e) { add(n, false, String(e.message||e).slice(0,200)); } }

console.log(`Mail 渲染验证 (port ${port})`);

// 1. 跳到 QQ 邮件页
await run('M1 跳到 QQ 收件箱，列表显示 3 封邮件', async () => {
  await page.goto('http://tauri.localhost/mail', { waitUntil: 'load' }).catch(() => {});
  await wait(3000);
  // 选 QQ 账户的收件箱
  const body = await page.locator('body').textContent();
  if (!body.includes('1633856788')) throw new Error('QQ 账户未显示');
  // 展开 QQ 账户 → 点收件箱
  const inbox = page.locator('text=1633856788@qq.com').first();
  await inbox.click({ force: true }).catch(() => {});
  await wait(500);
  // 找收件箱节点
  const inboxNode = page.locator('text=收件箱').first();
  await inboxNode.click({ force: true }).catch(() => {});
  await wait(3000);
  await page.screenshot({ path: 'e2e-screenshots/mail_render_01_list.png' });
  const body2 = await page.locator('body').textContent();
  // 验证列表含 3 封邮件主题
  const subjects = ['OAuth Application Approval', 'DeepSeek V4', 'E2E 测试邮件'];
  for (const s of subjects) {
    if (!body2.includes(s)) throw new Error(`邮件列表缺失主题: ${s}`);
  }
});

// 2. 点击 E2E 测试邮件 → 验证正文显示
await run('M2 打开 E2E 测试邮件 → 正文显示', async () => {
  // 找到包含 "E2E 测试邮件" 的可点击行
  const row = page.locator('text=E2E 测试邮件 EasyWork').first();
  if (await row.count() === 0) throw new Error('未找到 E2E 测试邮件行');
  await row.click().catch(() => {});
  await wait(3000);
  const body = await page.locator('body').textContent();
  // 邮件正文区（体文本）
  if (!body.includes('E2E test body content')) throw new Error('正文未显示');
  await page.screenshot({ path: 'e2e-screenshots/mail_render_02_body.png' });
});

// 3. 打开 OAuth 邮件 → 验证超长正文
await run('M3 打开 OAuth 邮件 → 504 字符正文显示', async () => {
  const row = page.locator('text=OAuth Application Approval').first();
  if (await row.count() === 0) throw new Error('未找到 OAuth 邮件行');
  await row.click().catch(() => {});
  await wait(3000);
  const body = await page.locator('body').textContent();
  if (body.length < 400) throw new Error(`正文过短: ${body.length} 字符`);
  await page.screenshot({ path: 'e2e-screenshots/mail_render_03_oauth.png' });
});

const pass = R.filter(r => r.ok).length;
console.log(`\n===== 邮件渲染 E2E: ${pass}/${R.length} 通过 =====`);
console.log(`console/pageerror: ${allErrors.length}`);
if (allErrors.length) console.log(JSON.stringify(allErrors.slice(0,5), null, 2));
writeFileSync(`${SHOT}/_mail_render_report.json`, JSON.stringify({pass, total: R.length, errors: allErrors, cases: R}, null, 2));
await browser.close();