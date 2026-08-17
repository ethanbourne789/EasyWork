// e2e-tauri/route-guards-404.mjs
// 路由守卫 & 404 页面 E2E：
//  1) 未登录状态下访问受保护路由（/tasks /mail /notes /finance /calendar /settings）应重定向到 /login
//  2) 访问不存在的路由应显示 404 页面
//  3) 演示登录后所有受保护路由均可正常访问
import { connect, collectErrors, demoLogin, shot, Report, expect } from './helpers.mjs';

const report = new Report();
let browser, page;
const errors = [];
const invoke = (cmd, args = {}) =>
  page.evaluate(([c, a]) => window.__TAURI__.core.invoke(c, a), [cmd, args]);

const PROTECTED_ROUTES = [
  { path: '/tasks', label: '任务' },
  { path: '/mail', label: '邮箱' },
  { path: '/notes', label: '笔记' },
  { path: '/finance', label: '记账' },
  { path: '/calendar', label: '日历' },
  { path: '/settings', label: '设置' },
];

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));

  // ---- 0. 确保未登录状态 ----
  try {
    await page.evaluate(() => {
      window.useAuthStore.getState().logout();
    });
    await page.waitForTimeout(1000);
  } catch { /* ignore - may already be logged out */ }

  // 强制导航到登录页（避免演示模式自动登录）
  await page.goto('tauri://localhost/login', { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const initialUrl = page.url();
  report.add('初始状态为登录页', initialUrl.includes('/login'), `url=${initialUrl}`);
  await shot(page, 'route-guards-00-logged-out');

  // ---- 1. 未登录访问受保护路由，应重定向到 /login ----
  for (const { path, label } of PROTECTED_ROUTES) {
    try {
      await page.evaluate((p) => { window.location.href = p; }, path);
      await page.waitForTimeout(2000);
    } catch { /* navigation error is acceptable */ }

    const currentUrl = page.url();
    const redirected = currentUrl.includes('/login');
    report.add(`未登录访问 /${label} 重定向到 /login`, redirected,
      `期望 /login, 实际 ${currentUrl.split('/').pop() || currentUrl}`);

    if (redirected) {
      await shot(page, `route-guards-01-protected-${label}-redirected`);
    }

    // 回到登录页以便下一次测试
    await page.goto('tauri://localhost/login', { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  // ---- 2. 访问不存在的路由，应显示 404 页面 ----
  const NON_EXISTENT_ROUTES = ['/nonexistent', '/this-page-does-not-exist', '/abc123xyz'];

  for (const path of NON_EXISTENT_ROUTES) {
    try {
      await page.evaluate((p) => { window.location.href = p; }, path);
      await page.waitForTimeout(2000);
    } catch { /* navigation error is acceptable */ }

    const bodyText = await page.evaluate(() => document.body.textContent || '');
    const has404 = bodyText.includes('404');
    const hasNotFoundMessage = bodyText.includes('页面不存在') || bodyText.includes('Not Found') || bodyText.includes('page');
    report.add(`访问 ${path} 显示 404`, has404,
      `body 包含 "404": ${has404}, 提示文案: ${hasNotFoundMessage}`);

    if (has404) {
      await shot(page, `route-guards-02-404-${path.replace(/\//g, '')}`);
    }
  }

  // ---- 3. 演示登录后验证所有受保护路由可访问 ----
  const loginResult = await demoLogin(page);
  report.add('演示登录成功', loginResult === true);
  await shot(page, 'route-guards-03-logged-in-dashboard');

  for (const { path, label } of PROTECTED_ROUTES) {
    try {
      await page.evaluate((p) => { window.location.href = p; }, path);
      await page.waitForTimeout(2000);
    } catch { /* navigation error is acceptable */ }

    const currentUrl = page.url();
    const isOnPage = currentUrl.includes(path);
    const notRedirectedToLogin = !currentUrl.includes('/login');
    const bodyText = await page.evaluate(() => document.body.textContent || '');
    const hasContent = bodyText.length > 50;

    report.add(`登录后访问 /${label} 正常`, isOnPage && notRedirectedToLogin && hasContent,
      `url=${currentUrl.split('/').pop() || currentUrl}, bodyLength=${bodyText.length}`);

    await shot(page, `route-guards-04-protected-${label}-accessible`);
  }

  // ---- 4. 登录后访问 404 路由仍应显示 404（不重定向）----
  try {
    await page.evaluate(() => { window.location.href = '/logged-in-nonexistent'; });
    await page.waitForTimeout(2000);
  } catch { /* ignore */ }

  const logged404Body = await page.evaluate(() => document.body.textContent || '');
  const logged404 = logged404Body.includes('404');
  report.add('登录后访问不存在路由仍显示 404', logged404,
    `body 包含 "404": ${logged404}`);

  if (logged404) {
    await shot(page, 'route-guards-05-404-while-logged-in');
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'route-guards-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/route-guards-404-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
