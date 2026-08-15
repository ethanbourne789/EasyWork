// scripts/e2e-tauri-smoke.mjs
// EasyWork 完整 E2E 测试（真实 WebView2 + 真实 Tauri IPC + SQLite）
// 前置：release-green/EasyWork.exe 已启动且 CDP 端口可用（通常 9222）
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const SHOT = 'e2e-screenshots';
mkdirSync(SHOT, { recursive: true });

// ---- CDP 端口探测 ----
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

// ---- 连接 ----
const port = await findCdpPort();
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = browser.contexts()[0];
const page = ctx?.pages().find(p => p.url().includes('tauri.localhost')) || ctx?.pages()[0];
if (!page) { console.log('FATAL: 未找到 EasyWork 页面'); process.exit(1); }

// ---- 全局错误收集 ----
const allErrors = [];
page.on('console', m => { if (m.type() === 'error') allErrors.push(`[console] ${m.text()}`); });
page.on('pageerror', e => allErrors.push(`[pageerror] ${e.message}`));

// ---- 工具 ----
const wait = ms => page.waitForTimeout(ms);
const click = async (loc, name) => { await loc.first().click(); await wait(800); };
const count = async loc => loc.count();
const txt = async loc => (await loc.allTextContents()).map(s => s.trim()).filter(Boolean);
async function h1() { return (await page.locator('h1:visible').allTextContents()).map(s => s.trim()).filter(Boolean); }
async function nav(label) {
  await page.getByRole('link', { name: label }).click().catch(async () => { await page.locator(`aside a[aria-label="${label}"]`).click(); });
  await wait(1500);
  return page.url();
}
async function shot(name) { await page.screenshot({ path: `${SHOT}/${name}.png` }); }

const R = []; // 结果
function add(name, ok, detail = '') {
  R.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function run(name, fn) {
  const before = allErrors.length;
  try { await fn(); add(name, true); }
  catch (e) { add(name, false, String(e.message || e).slice(0, 200)); }
  const newErrors = allErrors.slice(before);
  if (newErrors.length) console.log(`   ⚠️ 用例产生 ${newErrors.length} 个错误: ${newErrors.slice(0,3).join(' | ')}`);
}

const TS = Date.now();
const UNIQ = `E2E-${TS}`;

// ============ 测试 ============
console.log(`连接成功: ${page.url()} (port ${port})\n`);

// ---- 1. 仪表盘 ----
await run('D1 dashboard 加载且 h1 问候', async () => {
  await page.goto('http://tauri.localhost/dashboard', { waitUntil: 'load' }).catch(()=>{});
  await wait(2000);
  const h = await h1();
  if (!h.some(x => x.includes('早上好') || x.includes('欢迎'))) throw new Error(`h1=${JSON.stringify(h)}`);
  await shot('01_dashboard');
});
await run('D2 汇总卡片（笔记/支出/待办）渲染', async () => {
  const b = await page.locator('body').textContent();
  const ok = b.includes('笔记') && (b.includes('本月支出') || b.includes('支出'));
  if (!ok) throw new Error('汇总卡缺失');
});
await run('D3 快捷操作按钮存在', async () => {
  for (const label of ['新建任务', '新建笔记', '记一笔', '添加日程']) {
    const n = await count(page.getByText(label, { exact: true }));
    if (n === 0) throw new Error(`缺少「${label}」`);
  }
});

// ---- 2. 任务 ----
await run('T1 导航到任务页', async () => {
  const url = await nav('任务');
  if (!url.includes('/tasks')) throw new Error(`URL=${url}`);
  const h = await h1();
  if (!h.some(x => x.includes('任务'))) throw new Error(`h1=${JSON.stringify(h)}`);
  await shot('02_tasks');
});
await run('T2 任务列表渲染', async () => {
  const b = await page.locator('body').textContent();
  if (!b.includes('任务')) throw new Error('任务页内容缺失');
});
await run('T3 新建任务 → 列表出现', async () => {
  const btn = page.getByRole('button', { name: /新建任务|添加任务|新增任务/ }).first();
  if (await count(btn) === 0) throw new Error('未找到新建任务按钮');
  await click(btn, 'new task');
  await wait(500);
  // 标题输入：placeholder 含"标题"或 dialog 内第一个 text input
  const input = page.locator('input[placeholder*="标题"], input[placeholder*="任务"], [role="dialog"] input').first();
  if (await count(input) === 0) throw new Error('未找到标题输入框');
  await input.fill(UNIQ);
  await wait(300);
  const saveBtn = page.locator('[role="dialog"] button, button').filter({ hasText: /保存|创建|确定/ }).first();
  await click(saveBtn, 'save task');
  await wait(1500);
  const b = await page.locator('body').textContent();
  if (!b.includes(UNIQ)) throw new Error('新任务未出现在列表');
  await shot('03_task_created');
});

// ---- 3. 笔记 ----
await run('N1 导航到笔记页', async () => {
  const url = await nav('笔记');
  if (!url.includes('/notes')) throw new Error(`URL=${url}`);
  const h = await h1();
  if (!h.some(x => x.includes('笔记'))) throw new Error(`h1=${JSON.stringify(h)}`);
  await shot('04_notes');
});
await run('N2 笔记列表渲染', async () => {
  const b = await page.locator('body').textContent();
  if (!b.includes('笔记')) throw new Error('笔记页内容缺失');
});
await run('N3 新建笔记 → 保存 → 出现', async () => {
  // 笔记页没有 dialog，按钮直接创建笔记（handleCreateNote 调 useCreateNote，新建无标题，自动选中进入编辑器）
  const btn = page.getByRole('button', { name: /新建笔记/ }).first();
  if (await count(btn) === 0) throw new Error('未找到新建笔记按钮');
  await click(btn, 'new note');
  await wait(2500);
  // NoteEditor 标题 input placeholder="笔记标题..."（避开笔记页搜索框"搜索")
  const titleInput = page.locator('input[placeholder*="笔记标题"]').first();
  if (await count(titleInput) === 0) throw new Error('未找到笔记标题输入（placeholder=笔记标题...）');
  await titleInput.fill(UNIQ);
  await wait(1200);
  await titleInput.blur();
  await wait(1500);
  const b = await page.locator('body').textContent();
  if (!b.includes(UNIQ)) throw new Error('新笔记未出现');
  await shot('05_note_created');
});

// ---- 4. 记账 ----
await run('F1 导航到记账页', async () => {
  const url = await nav('记账');
  if (!url.includes('/finance')) throw new Error(`URL=${url}`);
  const h = await h1();
  if (!h.some(x => x.includes('记账') || x.includes('财务'))) throw new Error(`h1=${JSON.stringify(h)}`);
  await shot('06_finance');
});
await run('F2 交易列表/统计渲染', async () => {
  const b = await page.locator('body').textContent();
  const hasMoney = /¥|￥|\d+\.\d{2}/.test(b);
  if (!hasMoney) throw new Error('未见金额数据');
  if (!(b.includes('支出') || b.includes('收入'))) throw new Error('未见支出/收入');
});
await run('F3 记一笔（桌面端按钮 → 新建支出）→ 出现', async () => {
  // 记账页桌面端"+ 记账"按钮（Finance.tsx 新增，hidden md:flex）
  const btn = page.getByRole('button', { name: /记账|记一笔/ }).first();
  if (await count(btn) === 0) throw new Error('未找到记账按钮');
  await click(btn, 'open tx form');
  await wait(1200);
  const amt = page.locator('[role="dialog"] input[type="number"]').first();
  if (await count(amt) === 0) throw new Error('未找到金额输入');
  await amt.fill('12.34');
  await wait(300);
  const saveBtn = page.locator('[role="dialog"] button[type="submit"]').first();
  await click(saveBtn, 'save tx');
  await wait(2000);
  const b = await page.locator('body').textContent();
  if (!b.includes('12.34')) throw new Error('新交易未出现（金额 12.34）');
  await shot('07_tx_created');
  // 关闭 dialog（防止影响后续）
  await page.keyboard.press('Escape').catch(()=>{});
  await wait(500);
});

// ---- 5. 日历 ----
await run('C1 导航到日历页', async () => {
  const url = await nav('日历');
  if (!url.includes('/calendar')) throw new Error(`URL=${url}`);
  const h = await h1();
  if (!h.some(x => x.includes('日历'))) throw new Error(`h1=${JSON.stringify(h)}`);
  await shot('08_calendar');
});
await run('C2 月视图渲染', async () => {
  const b = await page.locator('body').textContent();
  const hasDay = /日\s*一\s*二\s*三\s*四\s*五\s*六/.test(b) || /星期一|周日|周一/.test(b);
  if (!hasDay) throw new Error('未见星期表头');
});
await run('C3 新建日程', async () => {
  // 日历页桌面按钮：+ 日程（calendar.event = "日程"）
  const btn = page.getByRole('button', { name: /日程/ }).first();
  if (await count(btn) === 0) throw new Error('未找到新建日程按钮（+ 日程）');
  await click(btn, 'new event');
  await wait(1200);
  const input = page.locator('#ev-title');
  if (await count(input) === 0) throw new Error('日程标题输入 #ev-title 不存在');
  await input.fill(`${UNIQ}-事件`);
  await wait(300);
  const saveBtn = page.locator('[role="dialog"] button').filter({ hasText: /保存|确定|完成/ }).first();
  await click(saveBtn, 'save event');
  await wait(1800);
  const b = await page.locator('body').textContent();
  if (!b.includes(UNIQ)) throw new Error('新事件未出现');
  await shot('09_event_created');
  await page.keyboard.press('Escape').catch(()=>{});
  await wait(400);
});

// ---- 6. 邮件 ----
await run('M1 导航到邮件页', async () => {
  const url = await nav('邮件');
  if (!url.includes('/mail')) throw new Error(`URL=${url}`);
  const h = await h1();
  if (!h.some(x => x.includes('邮箱'))) throw new Error(`h1=${JSON.stringify(h)}`);
  await shot('10_mail');
});
await run('M2 邮件页渲染（配置/空状态）', async () => {
  const b = await page.locator('body').textContent();
  if (!(b.includes('账户') || b.includes('收件') || b.includes('添加') || b.includes('邮箱'))) throw new Error('邮件页内容缺失');
});

// ---- 7. 设置（无 h1，用 h2 区块）----
await run('S1 导航到设置页', async () => {
  const url = await nav('设置');
  if (!url.includes('/settings')) throw new Error(`URL=${url}`);
  // 设置页无 h1（用 h2 区块），改检查 h2 含"个人资料"
  const h2 = (await page.locator('h2:visible').allTextContents()).map(s => s.trim());
  if (!h2.some(x => x.includes('资料'))) throw new Error(`h2=${JSON.stringify(h2)}`);
  await shot('11_settings');
});
await run('S2 设置页渲染（资料/同步/数据）', async () => {
  const b = await page.locator('body').textContent();
  const has = ['资料', '数据'].filter(k => b.includes(k));
  if (has.length < 2) throw new Error(`设置页关键区块缺失 ${JSON.stringify(has)}`);
});

// ---- 8. 404 与路由守卫 ----
await run('R1 404 兜底', async () => {
  await page.goto('http://tauri.localhost/definitely-not-exist', { waitUntil: 'load' }).catch(()=>{});
  await wait(1500);
  const b = await page.locator('body').textContent();
  if (!b.includes('Not Found') && !b.includes('404')) throw new Error('未见 404');
  await shot('12_404');
  await page.goto('http://tauri.localhost/dashboard', { waitUntil: 'load' }).catch(()=>{});
  await wait(1500);
});

// ---- 汇总 ----
const pass = R.filter(r => r.ok).length;
console.log(`\n===== E2E 汇总: ${pass}/${R.length} 通过（端口 ${port}）=====`);
console.log(`console/pageerror 总数: ${allErrors.length}`);
if (allErrors.length) console.log('错误详情:', JSON.stringify(allErrors.slice(0, 10), null, 2));

const report = {
  time: new Date().toISOString(),
  port, url: page.url(), pass, total: R.length,
  errors: allErrors,
  cases: R,
};
writeFileSync(`${SHOT}/_e2e_report.json`, JSON.stringify(report, null, 2));
console.log(`报告: ${SHOT}/_e2e_report.json`);
await browser.close();