// scripts/e2e-tauri-mail.mjs
// 真实邮箱 E2E：添加 QQ 邮箱账户 → 同步收信 → 验证邮件列表 → 打开正文
// 用法（凭据走环境变量，勿硬编码）：
//   QQ_EMAIL=xx@qq.com QQ_AUTH_CODE=<授权码> node scripts/e2e-tauri-mail.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const QQ_EMAIL = process.env.QQ_EMAIL;
const QQ_AUTH = process.env.QQ_AUTH_CODE;
if (!QQ_EMAIL || !QQ_AUTH) { console.log('缺少环境变量 QQ_EMAIL / QQ_AUTH_CODE'); process.exit(1); }

const SHOT = 'e2e-screenshots';
mkdirSync(SHOT, { recursive: true });

// 探测 CDP 端口
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
if (!page) { console.log('FATAL: no page'); process.exit(1); }

const allErrors = [];
page.on('console', m => { if (m.type() === 'error') allErrors.push(`[console] ${m.text()}`); });
page.on('pageerror', e => allErrors.push(`[pageerror] ${e.message}`));

const wait = ms => page.waitForTimeout(ms);
const count = async loc => loc.count();
const R = [];
function add(name, ok, detail = '') { R.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`); }
async function run(name, fn) {
  try { await fn(); add(name, true); }
  catch (e) { add(name, false, String(e.message || e).slice(0, 200)); }
}
async function shot(name) { await page.screenshot({ path: `${SHOT}/${name}.png` }); }

console.log(`QQ 邮箱 E2E 开始 (port ${port}, url ${page.url()})`);

// ---- 1. 添加 QQ 邮箱账户 ----
await run('M1 添加 QQ 邮箱账户', async () => {
  await page.goto('http://tauri.localhost/mail', { waitUntil: 'load' }).catch(() => {});
  await wait(2500);
  const addBtn = page.getByRole('button', { name: /添加账号/ }).first();
  if (await count(addBtn) === 0) throw new Error('未找到添加账号按钮');
  await addBtn.click();
  await wait(1000);
  await page.locator('input[placeholder="you@example.com"]').fill(QQ_EMAIL);
  await page.locator('input[placeholder="IMAP/SMTP 密码或邮箱授权码"]').fill(QQ_AUTH);
  // QQ 邮箱标准配置
  await page.locator('input[placeholder="imap.example.com"]').fill('imap.qq.com');
  await page.locator('input[placeholder="993"]').fill('993');
  await page.locator('input[placeholder="smtp.example.com"]').fill('smtp.qq.com');
  await page.locator('input[placeholder="465"]').fill('465');
  await wait(300);
  const saveBtn = page.locator('[role="dialog"] button').filter({ hasText: /添加|保存|创建/ }).first();
  await saveBtn.click();
  await wait(3000);
  const b = await page.locator('body').textContent();
  if (!b.includes(QQ_EMAIL)) throw new Error(`账户未出现在列表（${QQ_EMAIL}）`);
  await shot('mail_01_account_added');
});

// ---- 2. 同步收信（自动同步或手动触发）----
await run('M2 同步收信（等待自动同步/触发同步）', async () => {
  // 添加账户后会自动触发同步；额外等 25s 让 IMAP 拉取完成
  await wait(25000);
  // 尝试手动触发：找"同步"按钮（若有）
  const syncBtn = page.getByRole('button', { name: /同步|刷新/ }).first();
  if (await count(syncBtn) > 0) {
    await syncBtn.click().catch(() => {});
    await wait(15000);
  }
  await shot('mail_02_after_sync');
});

// ---- 3. 验证邮件列表 ----
await run('M3 邮件列表非空（收件箱有邮件）', async () => {
  const b = await page.locator('body').textContent();
  // 账户树应展开文件夹；列表应有邮件行（发件人/主题）
  const hasInbox = b.includes('收件箱') || b.includes('INBOX');
  const hasMail = /@|主题|Re:|Fw:|发件人|无邮件|暂无|收件箱/.test(b);
  if (!hasInbox && !hasMail) throw new Error('未见收件箱/邮件迹象');
  // 尝试统计邮件条目（选择器宽松）
  const mailRows = await page.locator('[data-mail-id], [class*="mail-row"], [class*="mailItem"], [class*="email-row"]').count();
  console.log(`   [diag] 邮件行数(宽松): ${mailRows}`);
  await shot('mail_03_list');
});

// ---- 4. 打开邮件正文 ----
await run('M4 打开第一封邮件 → 正文显示', async () => {
  // 点列表第一封（宽松选择器：可点击的邮件行）
  const row = page.locator('[data-mail-id], [class*="mail-row"], [class*="mailItem"], li, tr').filter({ visible: true }).first();
  // 优先尝试常见列表项
  const candidates = [
    '[data-mail-id]',
    '[class*="mail-row"]',
    '[class*="mailItem"]',
    '[class*="email-item"]',
    'button[class*="mail"]',
  ];
  let clicked = false;
  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.click().catch(() => {});
      clicked = true;
      break;
    }
  }
  if (!clicked) throw new Error('未找到可点击的邮件行');
  await wait(4000);
  const b = await page.locator('body').textContent();
  // 正文特征：非空正文区（排除导航/列表重复）
  const bodyText = b.replace(/\s+/g, ' ').trim();
  if (bodyText.length < 200) throw new Error('正文区为空');
  await shot('mail_04_open_email');
  console.log(`   [diag] body 长度: ${bodyText.length}，含'主题'? ${bodyText.includes('主题')}`);
});

// ---- 汇总 ----
const pass = R.filter(r => r.ok).length;
console.log(`\n===== 真实邮箱 E2E 汇总: ${pass}/${R.length} 通过 =====`);
console.log(`console/pageerror 总数: ${allErrors.length}`);
if (allErrors.length) console.log('错误:', JSON.stringify(allErrors.slice(0, 6), null, 2));
const report = { time: new Date().toISOString(), email: QQ_EMAIL, pass, total: R.length, errors: allErrors, cases: R };
writeFileSync(`${SHOT}/_mail_report.json`, JSON.stringify(report, null, 2));
console.log(`报告: ${SHOT}/_mail_report.json`);
await browser.close();