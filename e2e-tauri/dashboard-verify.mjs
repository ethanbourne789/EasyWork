// e2e-tauri/dashboard-verify.mjs
// 仪表盘页面 E2E 验证：
//  1) 登录演示账户
//  2) 导航到仪表盘页
//  3) 通过 DOM 验证问候语文本
//  4) 通过 DOM 验证概览统计卡片渲染
//  5) 通过 DOM 验证今日聚焦区域
//  6) 通过 DOM 验证迷你月历渲染
//  7) 截取关键状态截图
import { connect, collectErrors, demoLogin, shot, Report, expect } from './helpers.mjs';

const report = new Report();
let browser, page;
const errors = [];

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));

  // ---- 1. 演示登录 ----
  const loginResult = await demoLogin(page);
  await shot(page, 'dashboard-verify-01-landing');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导航到仪表盘页（如未自动到达）----
  if (!page.url().includes('/dashboard')) {
    await page.locator('a[href="/dashboard"]').first().click();
    await page.waitForTimeout(2000);
  }
  report.add('进入仪表盘页', page.url().includes('/dashboard'));

  // ---- 3. 验证问候语文本（通过 page.evaluate 读取 DOM）----
  const greetingText = await page.evaluate(() => {
    const h1 = document.querySelector('h1.font-display');
    return h1 ? h1.textContent.trim() : '';
  });
  const hasGreeting = /早上好|下午好|晚上好|凌晨好|Good Morning|Good Afternoon|Good Evening|Late Night/.test(greetingText);
  report.add('问候语文本可见', hasGreeting, `h1="${greetingText.slice(0, 40)}"`);

  // ---- 4. 验证日期和待办统计文本 ----
  const dateText = await page.evaluate(() => {
    const p = document.querySelector('h1.font-display + p');
    return p ? p.textContent.trim() : '';
  });
  const hasDateInfo = dateText.includes('待办') || dateText.includes('pending');
  report.add('日期和待办统计可见', hasDateInfo, `text="${dateText.slice(0, 60)}"`);

  // ---- 5. 验证概览统计卡片（4 张 KPI 卡）----
  const cardsInfo = await page.evaluate(() => {
    const cards = document.querySelectorAll('.grid-cols-2 .border.bg-card, .grid-cols-4 .border.bg-card');
    const monoValues = [];
    cards.forEach(card => {
      const mono = card.querySelector('.font-mono');
      if (mono) monoValues.push(mono.textContent.trim());
    });
    return { cardCount: cards.length, values: monoValues.slice(0, 8) };
  });
  report.add('概览统计卡片渲染', cardsInfo.cardCount >= 4,
    `count=${cardsInfo.cardCount} values=[${cardsInfo.values.join(', ')}]`);

  // 验证卡片包含数字（Tabular 数字展示）
  const hasNumbers = cardsInfo.values.some((v) => /\d/.test(v));
  report.add('统计卡片包含数字数据', hasNumbers, `values=[${cardsInfo.values.join(', ')}]`);

  await shot(page, 'dashboard-verify-02-overview-cards');

  // ---- 6. 验证今日聚焦区域 ----
  const todayFocusExists = await page.evaluate(() => {
    // 查找包含 "今日聚焦" 或 "Today's Focus" 的标题元素
    const allText = document.body.textContent || '';
    return allText.includes('今日聚焦') || allText.includes('Today');
  });
  report.add('今日聚焦区域存在', todayFocusExists);

  // ---- 7. 验证迷你月历渲染 ----
  const calendarInfo = await page.evaluate(() => {
    // 迷你月历使用 7 列网格布局（周日到周六）
    const grids = document.querySelectorAll('[class*="grid-cols-7"]');
    const dayCells = [];
    grids.forEach(grid => {
      const cells = grid.querySelectorAll('a, button, span');
      if (cells.length >= 28) { // 月历至少 28 天格子
        dayCells.push({ cellCount: cells.length });
      }
    });
    // 查找今天高亮（brand-500 背景色标记的单元格）
    const todayCells = document.querySelectorAll('.bg-brand-500');
    return { gridCount: grids.length, dayCells, todayHighlights: todayCells.length };
  });
  report.add('迷你月历网格渲染', calendarInfo.gridCount >= 1 || calendarInfo.dayCells.length >= 1,
    `grids=${calendarInfo.gridCount} dayCells=${JSON.stringify(calendarInfo.dayCells)}`);

  // ---- 8. 验证快捷操作区域 ----
  const quickActionsInfo = await page.evaluate(() => {
    const body = document.body.textContent || '';
    const actionLabels = [];
    if (body.includes('新建任务') || body.includes('New Task')) actionLabels.push('newTask');
    if (body.includes('新建笔记') || body.includes('New Note')) actionLabels.push('newNote');
    if (body.includes('记一笔') || body.includes('Add Expense')) actionLabels.push('addExpense');
    if (body.includes('添加日程') || body.includes('Add Event')) actionLabels.push('addEvent');
    return actionLabels;
  });
  report.add('快捷操作按钮渲染', quickActionsInfo.length >= 3,
    `actions=[${quickActionsInfo.join(', ')}]`);

  await shot(page, 'dashboard-verify-03-full-dashboard');

  // ---- 9. 验证页面整体结构（body 文本内容长度）----
  const bodyText = await page.locator('body').textContent();
  report.add('仪表盘页面内容丰富', (bodyText?.length || 0) > 100, `bodyLength=${bodyText?.length}`);

  // ---- 10. 移动端响应式验证 ----
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(800);
  await shot(page, 'dashboard-verify-04-mobile');

  const mobileBody = await page.locator('body').textContent();
  const mobileHasGreeting = mobileBody?.includes('好') || mobileBody?.includes('Morning') || mobileBody?.includes('Afternoon');
  report.add('移动端仪表盘渲染正常', mobileHasGreeting, `bodyLength=${mobileBody?.length}`);

  // 恢复桌面尺寸
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'dashboard-verify-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/dashboard-verify-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
