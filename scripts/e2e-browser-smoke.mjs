// scripts/e2e-browser-smoke.mjs
// 浏览器自动化 smoke 测试（不依赖 Tauri 后端 — 数据流由浏览器限制另行报告）
// 用法：node scripts/e2e-browser-smoke.mjs
// 前置：vite dev server 在 http://localhost:1420 运行中

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:1420';
const SCREENSHOT_DIR = 'e2e-screenshots';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const ROUTES = [
  { path: '/login', name: '登录页', expectH1: '登录' },
  { path: '/register', name: '注册页', expectH1: '注册' },
  { path: '/dashboard', name: '仪表盘（需登录）', expectH1: null },
  { path: '/tasks', name: '任务（需登录）', expectH1: '任务' },
  { path: '/mail', name: '邮件（需登录）', expectH1: '邮件' },
  { path: '/notes', name: '笔记（需登录）', expectH1: '笔记' },
  { path: '/finance', name: '记账（需登录）', expectH1: '记账' },
  { path: '/calendar', name: '日历（需登录）', expectH1: '日历' },
  { path: '/settings', name: '设置（需登录）', expectH1: '设置' },
  { path: '/this-route-does-not-exist', name: '404 兜底', expectH1: null },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// 收集所有 console error / page error（用于页面报错检测）
const allErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') allErrors.push({ kind: 'console', text: msg.text() });
});
page.on('pageerror', err => allErrors.push({ kind: 'pageerror', text: err.message }));

// Phase 1: 逐路由访问 → 截图 + 收集错误
const routeResults = [];
for (const route of ROUTES) {
  const beforeErrCount = allErrors.length;
  let title = '', h1 = [], h2 = [], buttons = 0, bodyPreview = '';
  let gotoErr = '';
  try {
    const resp = await page.goto(BASE + route.path, { waitUntil: 'load', timeout: 10000 });
    gotoErr = resp ? `HTTP ${resp.status()}` : '';
    await page.waitForTimeout(1800); // 等 React + useEffect
    title = await page.title();
    h1 = (await page.locator('h1:visible').allTextContents()).map(s => s.trim()).filter(Boolean);
    h2 = (await page.locator('h2:visible').allTextContents()).map(s => s.trim()).filter(Boolean);
    buttons = await page.locator('button:visible').count();
    bodyPreview = ((await page.locator('body').textContent()) || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  } catch (e) {
    gotoErr = 'GOTO_FAIL: ' + (e?.message || String(e));
  }
  const fileName = (route.path.replace(/\//g, '_') || '_root') + '.png';
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${fileName}`, fullPage: false });
  routeResults.push({
    path: route.path,
    name: route.name,
    expectedH1: route.expectH1,
    actualH1: h1,
    h2Count: h2.length,
    buttons,
    gotoStatus: gotoErr,
    finalUrl: page.url(),
    bodyPreview,
    errorCount: allErrors.length - beforeErrCount,
    sampleErrors: allErrors.slice(beforeErrCount).slice(0, 5),
    screenshot: `${SCREENSHOT_DIR}/${fileName}`,
  });
}

// Phase 2: 演示登录按钮（测浏览器中 Tauri 不可用时的行为）
const beforeDemo = allErrors.length;
const demoResult = { buttonFound: false, buttonText: '', clicked: false, finalUrl: '', finalH1: [], error: '' };
try {
  await page.goto(BASE + '/login', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const demoBtn = page.locator('button').filter({ hasText: /演示|demo/i });
  demoResult.buttonFound = (await demoBtn.count()) > 0;
  if (demoResult.buttonFound) {
    demoResult.buttonText = await demoBtn.first().textContent();
    await demoBtn.first().click();
    demoResult.clicked = true;
    await page.waitForTimeout(3500);
    demoResult.finalUrl = page.url();
    demoResult.finalH1 = (await page.locator('h1:visible').allTextContents()).map(s => s.trim());
    await page.screenshot({ path: `${SCREENSHOT_DIR}/_after_demo_click.png` });
  }
} catch (e) {
  demoResult.error = e?.message || String(e);
}
demoResult.errors = allErrors.slice(beforeDemo).slice(0, 8);

// Phase 3: 登录表单交互（邮箱+密码 → 点登录）
const beforeForm = allErrors.length;
const formResult = { filled: false, submitted: false, finalUrl: '', errorVisible: '', errorMsg: '' };
try {
  await page.goto(BASE + '/login', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const emailInput = page.locator('input[placeholder="邮箱"]');
  const pwInput = page.locator('input[placeholder="密码"]');
  if (await emailInput.count() > 0 && await pwInput.count() > 0) {
    await emailInput.fill('test@example.com');
    await pwInput.fill('password123');
    formResult.filled = true;
    await page.click('button:has-text("登录")');
    formResult.submitted = true;
    await page.waitForTimeout(2500);
    formResult.finalUrl = page.url();
    // 查找错误提示
    const errEl = page.locator('[role="alert"], .text-destructive, .text-red-500, .text-red-600').first();
    if (await errEl.count() > 0) {
      formResult.errorVisible = await errEl.textContent().catch(() => '');
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/_login_form_submit.png` });
  }
} catch (e) {
  formResult.errorMsg = e?.message || String(e);
}
formResult.errors = allErrors.slice(beforeForm).slice(0, 8);

// Phase 4: 注册表单字段
const beforeReg = allErrors.length;
const regResult = { url: '', fields: [] };
try {
  await page.goto(BASE + '/register', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  regResult.url = page.url();
  regResult.fields = await page.locator('input:visible').evaluateAll(els =>
    els.map(el => ({ type: el.type, placeholder: el.placeholder, name: el.name }))
  );
  await page.screenshot({ path: `${SCREENSHOT_DIR}/_register_page.png` });
} catch (e) {
  regResult.error = e?.message || String(e);
}
regResult.errors = allErrors.slice(beforeReg).slice(0, 5);

await browser.close();

const report = {
  baseUrl: BASE,
  totalRoutes: ROUTES.length,
  routes: routeResults,
  demoLogin: demoResult,
  loginForm: formResult,
  registerForm: regResult,
  allUniqueErrors: [...new Map(allErrors.map(e => [e.text, e])).values()].slice(0, 30),
};

writeFileSync(`${SCREENSHOT_DIR}/_report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));