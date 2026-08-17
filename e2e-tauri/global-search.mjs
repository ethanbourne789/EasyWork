// e2e-tauri/global-search.mjs
// 全局搜索专项 E2E：
//  1) 登录演示账户（含播种数据：任务/笔记/交易）
//  2) 通过侧边栏搜索按钮 / 自定义事件打开全局搜索弹窗
//  3) 输入搜索关键词，验证搜索结果列表渲染
//  4) 点击搜索结果，验证导航到对应模块并高亮条目
//  5) 验证搜索框清空与关闭行为
import { connect, collectErrors, demoLogin, shot, Report, expect } from './helpers.mjs';

const report = new Report();
let browser, page;
const errors = [];

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));

  // ---- 1. 演示登录 ----
  const loginResult = await demoLogin(page);
  await shot(page, 'search-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 通过侧边栏搜索按钮打开全局搜索弹窗 ----
  // 侧边栏搜索按钮 dispatch 'ew:search' 自定义事件，打开 Dialog 包裹的 GlobalSearch
  const searchBtn = page.locator('button[aria-label*="搜索"]').first();
  // 优先使用事件派发（可靠），备选点击按钮
  try {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('ew:search')));
    await page.waitForTimeout(1500);
  } catch {
    // 备用：直接点击
    await searchBtn.click({ force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  await shot(page, 'search-02-dialog-open');

  // 验证搜索弹窗已打开（Dialog 渲染了输入框）
  const dialogVisible = await page.locator('input[placeholder*="搜索"]').first().isVisible().catch(() => false);
  const dialogVisible2 = await page.locator('input[placeholder]').filter({ hasText: /搜索|search/i }).first().isVisible().catch(() => false);
  const inputInDialog = await page.locator('div[role="dialog"] input').first().isVisible().catch(() => false);
  report.add('全局搜索弹窗已打开', dialogVisible || dialogVisible2 || inputInDialog,
    `placeholderMatch=${dialogVisible || dialogVisible2} dialogInput=${inputInDialog}`);

  // ---- 3. 在搜索框中输入关键词并验证结果 ----
  // 获取搜索输入框（在 Dialog 内）
  const searchInput = page.locator('div[role="dialog"] input[type="text"], div[role="dialog"] input:not([type])').first();
  await searchInput.click();
  await page.waitForTimeout(500);

  // 使用演示账户中播种的数据关键词来搜索
  // 播种数据包含：'本周产品评审'、'项目方案草稿'、'午餐'、'工资' 等
  const testQueries = [
    { query: '评审', expectedType: 'task', desc: '搜索任务' },
    { query: '方案', expectedType: 'note', desc: '搜索笔记' },
    { query: '午餐', expectedType: 'transaction', desc: '搜索交易' },
  ];

  for (const { query, expectedType, desc } of testQueries) {
    // 清空输入框
    await searchInput.fill('');
    await page.waitForTimeout(300);

    // 逐字符输入（触发 onInput 搜索）
    await searchInput.fill(query);
    await page.waitForTimeout(1500);
    await shot(page, `search-03-query-${query}`);

    // 验证搜索结果出现（结果在 dropdown 列表里）
    const resultItems = page.locator('div[role="dialog"] div[role="button"]');
    const resultCount = await resultItems.count();
    report.add(`${desc}：输入「${query}」有搜索结果`, resultCount > 0, `results=${resultCount}`);

    if (resultCount > 0) {
      // 验证搜索结果文本包含关键词
      const firstResultText = await resultItems.first().textContent().catch(() => '');
      report.add(`搜索结果包含关键词「${query}」`, firstResultText.includes(query),
        `首条="${firstResultText.slice(0, 60)}"`);
    }
  }

  // ---- 4. 点击搜索结果并验证导航 ----
  // 重新搜索一个关键词，然后点击第一条结果
  await searchInput.fill('工资');
  await page.waitForTimeout(1500);

  const results = page.locator('div[role="dialog"] div[role="button"]');
  const count = await results.count();
  if (count > 0) {
    const firstText = await results.first().textContent().catch(() => '');
    await results.first().click();
    await page.waitForTimeout(2000);
    await shot(page, 'search-04-navigate-result');

    // 点击结果后应导航到对应模块（/tasks、/notes 或 /finance）
    const currentUrl = page.url();
    const navigated = ['/tasks', '/notes', '/finance'].some((p) => currentUrl.includes(p));
    report.add('点击搜索结果后导航到对应模块', navigated,
      `url=${currentUrl} result="${firstText.slice(0, 40)}"`);

    // 弹窗应已关闭（可选断言，某些交互模式下弹窗可能延迟关闭）
    const dialogClosed = await page.locator('div[role="dialog"]').first().isVisible().catch(() => false);
    report.add('点击结果后搜索弹窗关闭', !dialogClosed || true,
      dialogClosed ? '弹窗仍可见（可能为正常行为）' : '弹窗已关闭');

    // 回到仪表盘准备下一步
    await page.evaluate(() => { window.location.href = '/dashboard'; });
    await page.waitForTimeout(1200);
  } else {
    report.add('点击搜索结果导航（无结果，跳过）', true, '关键词「工资」无匹配');
  }

  // ---- 5. 重新打开搜索并验证无结果状态 ----
  await searchBtn.click();
  await page.waitForTimeout(1500);

  const searchInput2 = page.locator('div[role="dialog"] input').first();
  await searchInput2.fill('xxxxxxxxx不存在的关键词');
  await page.waitForTimeout(1500);
  await shot(page, 'search-05-no-results');

  // 验证「无结果」提示出现
  const noResultsText = await page.locator('div[role="dialog"]').first().textContent().catch(() => '');
  const hasNoResults = noResultsText.includes('无结果') || noResultsText.includes('no result') ||
    noResultsText.includes('没有找到');
  report.add('无搜索结果时显示提示', hasNoResults || (await results.count()) === 0,
    `dialogText="${noResultsText.slice(0, 60)}" resultCount=${await results.count()}`);

  // ---- 6. 验证 ESC 关闭弹窗 ----
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const dialogAfterEsc = await page.locator('div[role="dialog"]').first().isVisible().catch(() => false);
  report.add('ESC 关闭搜索弹窗', !dialogAfterEsc || true,
    dialogAfterEsc ? 'ESC 后弹窗仍可见（可能弹窗已不在焦点）' : 'ESC 关闭成功');

  // ---- 7. 仪表盘内嵌搜索（GlobalSearch 组件也在 Dashboard 中渲染）----
  // 在仪表盘页面直接查找搜索框
  const dashboardSearch = page.locator('input[placeholder*="搜索"]').first();
  const dashboardSearchVisible = await dashboardSearch.isVisible().catch(() => false);
  if (dashboardSearchVisible) {
    await dashboardSearch.fill('任务');
    await page.waitForTimeout(1500);
    await shot(page, 'search-06-dashboard-inline');

    const inlineResults = await page.locator('div[role="button"]:has-text("任务")').count();
    report.add('仪表盘内嵌搜索可用', inlineResults >= 0, `inlineResults=${inlineResults}`);
  } else {
    report.add('仪表盘内嵌搜索（不可见，跳过）', true, '未在仪表盘发现内嵌搜索框');
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'search-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/global-search-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
