// scripts/e2e-tauri-p1.mjs
// P1 用例：邮件账户 CRUD（mailpit 配置）+ CSV 导出 + 备份导出/恢复
// 前置：EasyWork.exe 运行中（CDP 9222）；mailpit 运行中（SMTP 1025 / HTTP 8025）
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const SHOT = 'e2e-screenshots';
mkdirSync(SHOT, { recursive: true });

async function findCdpPort(start = 9222, maxTry = 5) {
  for (let p = start; p < start + maxTry; p++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch(`http://127.0.0.1:${p}/json/version`, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) return p;
    } catch { /* next */ }
  }
  throw new Error('未找到 CDP 端口');
}

const port = await findCdpPort();
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = browser.contexts()[0];
const page = ctx?.pages().find(p => p.url().includes('tauri.localhost')) || ctx?.pages()[0];
if (!page) { console.log('FATAL: 未找到 EasyWork 页面'); process.exit(1); }

const allErrors = [];
page.on('console', m => { if (m.type() === 'error') allErrors.push(`[console] ${m.text()}`); });
page.on('pageerror', e => allErrors.push(`[pageerror] ${e.message}`));

const wait = ms => page.waitForTimeout(ms);
const count = async loc => loc.count();
const R = [];
function add(name, ok, detail = '') { R.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`); }
async function run(name, fn) {
  const before = allErrors.length;
  try { await fn(); add(name, true); }
  catch (e) { add(name, false, String(e.message || e).slice(0, 180)); }
  const newErr = allErrors.slice(before);
  if (newErr.length) console.log(`   ⚠️ ${newErr.length} errors: ${newErr.slice(0,2).join(' | ')}`);
}
async function nav(label) {
  await page.getByRole('link', { name: label }).click().catch(async () => { await page.locator(`aside a[aria-label="${label}"]`).click(); });
  await wait(1500);
}
async function shot(name) { await page.screenshot({ path: `${SHOT}/${name}.png` }); }

const TS = Date.now();
const EMAIL = `e2e${TS}@test.local`;

console.log(`P1 测试开始 (port ${port}, url ${page.url()})`);

// ============ 邮件账户 ============
await run('E1 添加邮件账户 → 账户树出现', async () => {
  await page.goto('http://tauri.localhost/mail', { waitUntil: 'load' }).catch(() => {});
  await wait(2000);
  const addBtn = page.getByRole('button', { name: /添加账号/ }).first();
  if (await count(addBtn) === 0) throw new Error('未找到添加账号按钮');
  await addBtn.click();
  await wait(1000);
  await page.locator('input[placeholder="you@example.com"]').fill(EMAIL);
  await page.locator('input[placeholder="IMAP/SMTP 密码或邮箱授权码"]').fill('test1234');
  await page.locator('input[placeholder="imap.example.com"]').fill('127.0.0.1');
  await page.locator('input[placeholder="993"]').fill('1143');
  await page.locator('input[placeholder="smtp.example.com"]').fill('127.0.0.1');
  await page.locator('input[placeholder="465"]').fill('1025');
  await wait(300);
  const saveBtn = page.locator('[role="dialog"] button').filter({ hasText: /添加|保存|创建/ }).first();
  await saveBtn.click();
  await wait(2500);
  const b = await page.locator('body').textContent();
  if (!b.includes(EMAIL)) throw new Error(`账户未出现（${EMAIL}）`);
  await shot('p1_01_account_added');
});

await run('E2 账户持久化（reload 后仍在）', async () => {
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await wait(5000);
  const b = await page.locator('body').textContent();
  if (!b.includes(EMAIL)) throw new Error('reload 后账户消失（DB 未持久化）');
});

// ============ CSV 导出 ============
await run('C1 报表 CSV 导出（download 事件）', async () => {
  await page.goto('http://tauri.localhost/finance', { waitUntil: 'load' }).catch(() => {});
  await wait(2000);
  const reportTab = page.getByRole('tab', { name: /报表/ }).first();
  if (await count(reportTab) === 0) throw new Error('未找到报表 tab');
  await reportTab.click();
  await wait(1800);
  const exportBtn = page.getByRole('button', { name: /导出 CSV/ }).first();
  if (await count(exportBtn) === 0) throw new Error('未找到导出 CSV 按钮');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    exportBtn.click(),
  ]);
  const filename = download.suggestedFilename();
  const path = `${SHOT}/p1_csv_${TS}.csv`;
  await download.saveAs(path);
  const content = readFileSync(path, 'utf-8');
  if (!filename.endsWith('.csv')) throw new Error(`文件名非 csv: ${filename}`);
  if (!(content.includes('日期') || content.includes('Date') || content.includes('type'))) throw new Error('CSV 缺表头');
  if (!/\d+\.\d{2}/.test(content) && !content.includes(',')) throw new Error('CSV 缺数据行');
  await shot('p1_02_csv_export');
});

// ============ 备份导出 / 恢复 ============
let backupPath = '';
await run('C2 备份导出（JSON download）', async () => {
  await page.goto('http://tauri.localhost/settings', { waitUntil: 'load' }).catch(() => {});
  await wait(2000);
  const dataTab = page.getByRole('button', { name: /数据管理/ }).first();
  if (await count(dataTab) === 0) throw new Error('未找到数据管理 tab');
  await dataTab.click();
  await wait(800);
  const exportBtn = page.getByRole('button', { name: /^导出$/ }).first();
  if (await count(exportBtn) === 0) throw new Error('未找到导出按钮');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    exportBtn.click(),
  ]);
  backupPath = `${SHOT}/p1_backup_${TS}.json`;
  await download.saveAs(backupPath);
  const dump = JSON.parse(readFileSync(backupPath, 'utf-8'));
  const tables = Object.keys(dump);
  if (!tables.includes('tasks') || !tables.includes('transactions')) {
    throw new Error(`备份缺业务表: ${tables.join(',')}`);
  }
  await shot('p1_03_backup_export');
});

await run('C3 备份导入恢复（改标题 → 导入 → 生效）', async () => {
  if (!backupPath) throw new Error('无备份文件（C2 未执行）');
  const dump = JSON.parse(readFileSync(backupPath, 'utf-8'));
  if (!Array.isArray(dump.tasks) || dump.tasks.length === 0) throw new Error('备份无 tasks');
  // 取第一条有效行改标题（保持全部字段，避免手工构造行缺 NOT NULL 列导致事务回滚）
  const first = dump.tasks[0];
  dump.tasks[0] = { ...first, id: `e2e-restore-${TS}`, title: `E2E恢复-${TS}` };
  const modPath = `${SHOT}/p1_backup_mod_${TS}.json`;
  writeFileSync(modPath, JSON.stringify(dump));

  await page.goto('http://tauri.localhost/settings', { waitUntil: 'load' }).catch(() => {});
  await wait(2000);
  // ⚠️ 演示模式下整页 reload 会触发 useAuth 重新播种（seedDemoData 清库+重灌），
  // 因此导入前必须等 seed 完成（等 10s 或等任务列表稳定），否则导入数据会被覆盖。
  await wait(10000);
  const dataTab = page.getByRole('button', { name: /数据管理/ }).first();
  await dataTab.click();
  await wait(800);
  const fileInput = page.locator('input[type="file"]');
  if (await count(fileInput) === 0) throw new Error('未找到备份文件选择 input');
  await fileInput.setInputFiles(modPath);
  await wait(1500); // confirm 对话框出现
  const confirmBtn = page.locator('[role="dialog"] button').filter({ hasText: /导入|确定/ }).last();
  if (await count(confirmBtn) === 0) throw new Error('未找到导入确认按钮');
  await confirmBtn.click();
  await wait(3000);
  // 验证：任务页出现注入的标题（用 SPA 导航，避免 reload 触发重播种覆盖导入数据）
  await nav('任务');
  const b = await page.locator('body').textContent();
  if (!b.includes(TS)) throw new Error('恢复的任务未出现');
  await shot('p1_04_import_restored');
});

// ============ 邮件发信（标注环境限制） ============
console.log('ℹ️ 邮件发信/收信：EasyWork SMTP/IMAP 均为 TLS-only（rustls platform verifier 不信任自签证书），mailpit v1.30 无 IMAP server — 真实收发测试需受信证书 + IMAP server，本环境跳过。');

// ============ 汇总 ============
const pass = R.filter(r => r.ok).length;
console.log(`\n===== P1 汇总: ${pass}/${R.length} 通过 =====`);
console.log(`console/pageerror 总数: ${allErrors.length}`);
if (allErrors.length) console.log(JSON.stringify(allErrors.slice(0, 8), null, 2));
const report = { time: new Date().toISOString(), pass, total: R.length, errors: allErrors, cases: R };
writeFileSync(`${SHOT}/_p1_report.json`, JSON.stringify(report, null, 2));
console.log(`报告: ${SHOT}/_p1_report.json`);
await browser.close();