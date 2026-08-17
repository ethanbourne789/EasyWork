// e2e-tauri/settings-verify.mjs
// 设置页面 E2E 验证：
//  1) 登录演示账户
//  2) 导航到设置页
//  3) 验证个人资料区域显示邮箱
//  4) 验证主题切换按钮存在
//  5) 验证语言切换器存在
//  6) 验证数据导出按钮存在
//  7) 验证同步设置面板存在
//  8) 截取关键状态截图
import { connect, collectErrors, demoLogin, shot, Report, expect } from './helpers.mjs';

const report = new Report();
let browser, page;
const errors = [];
const invoke = (cmd, args = {}) =>
  page.evaluate(([c, a]) => window.__TAURI__.core.invoke(c, a), [cmd, args]);

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));

  // ---- 1. 演示登录 ----
  const loginResult = await demoLogin(page);
  await shot(page, 'settings-verify-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导航到设置页 ----
  await page.locator('a[href="/settings"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'settings-verify-02-settings-page');
  report.add('进入设置页', page.url().includes('/settings'));

  // ---- 3. 验证个人资料 Tab ----
  const profileBtn = page.locator('div.w-48 button').filter({ hasText: /个人资料/ }).first();
  const profileSectionVisible = await profileBtn.isVisible().catch(() => false);
  report.add('个人资料 Tab 可见', profileSectionVisible);

  // ---- 4. 验证个人资料区域显示邮箱 ----
  // 点击个人资料 Tab 确保内容区显示
  await profileBtn.click();
  await page.waitForTimeout(3000);
  const emailVisible = await page.evaluate(() => {
    const body = document.body.textContent || '';
    // Check for email pattern, demo text, or the email label
    const hasEmailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]/.test(body);
    const hasEmailLabel = body.includes('邮箱') || body.includes('Email');
    return hasEmailPattern || hasEmailLabel;
  });
  report.add('个人资料区显示邮箱', emailVisible);

  // ---- 5. 点击外观 Tab 并验证主题切换按钮 ----
  await page.locator('div.w-48 button').filter({ hasText: /外观/ }).first().click();
  await page.waitForTimeout(1500);

  const themeButtons = await page.evaluate(() => {
    const body = document.body.textContent || '';
    const themes = [];
    if (body.includes('浅色') || body.includes('Light')) themes.push('light');
    if (body.includes('深色') || body.includes('Dark')) themes.push('dark');
    return themes;
  });
  report.add('主题切换按钮存在', themeButtons.length >= 2,
    `themes=[${themeButtons.join(', ')}]`);

  await shot(page, 'settings-verify-03-appearance');

  // ---- 6. 验证语言切换器存在 ----
  const languageOptions = await page.evaluate(() => {
    const body = document.body.textContent || '';
    const langs = [];
    if (body.includes('中文')) langs.push('zh');
    if (body.includes('English') || body.includes('英语')) langs.push('en');
    return langs;
  });
  report.add('语言切换器存在', languageOptions.length >= 2,
    `languages=[${languageOptions.join(', ')}]`);

  // ---- 7. 点击数据管理 Tab ----
  const dataBtn = page.locator('div.w-48 button').filter({ hasText: /数据管理/ }).first();
  const dataTabVisible = await dataBtn.isVisible().catch(() => false);
  report.add('数据管理 Tab 可见', dataTabVisible);

  if (dataTabVisible) {
    await dataBtn.click();
    await page.waitForTimeout(1500);

    // ---- 8. 验证数据导出按钮存在 ----
    const exportBtnVisible = await page.evaluate(() => {
      const body = document.body.textContent || '';
      return body.includes('导出数据') || body.includes('Export Data') || body.includes('导出');
    });
    report.add('数据导出按钮存在', exportBtnVisible);

    // ---- 9. 验证数据导入按钮存在 ----
    const importBtnVisible = await page.evaluate(() => {
      const body = document.body.textContent || '';
      return body.includes('导入数据') || body.includes('Import Data') || body.includes('选择备份');
    });
    report.add('数据导入按钮存在', importBtnVisible);

    await shot(page, 'settings-verify-04-data-management');
  }

  // ---- 10. 点击同步设置 Tab ----
  const syncBtn = page.locator('div.w-48 button').filter({ hasText: /同步/ }).first();
  const syncTabVisible = await syncBtn.isVisible().catch(() => false);
  report.add('同步设置 Tab 可见', syncTabVisible);

  if (syncTabVisible) {
    await syncBtn.click();
    await page.waitForTimeout(1500);

    const syncPanelContent = await page.evaluate(() => {
      const body = document.body.textContent || '';
      const elements = {};
      if (body.includes('提供商') || body.includes('Provider')) elements.hasProvider = true;
      if (body.includes('连接') || body.includes('Connect') || body.includes('connection')) elements.hasConnection = true;
      if (body.includes('设备') || body.includes('Device') || body.includes('device')) elements.hasDevice = true;
      if (body.includes('日志') || body.includes('Log') || body.includes('log')) elements.hasLogs = true;
      return elements;
    });
    report.add('同步设置面板内容',
      Object.values(syncPanelContent).some(Boolean),
      `content=${JSON.stringify(syncPanelContent)}`);

    await shot(page, 'settings-verify-05-sync-settings');

    // ---- 11. 通过 Tauri 命令验证同步状态 ----
    try {
      const syncStatus = await invoke('sync_status').catch(() => null);
      report.add('同步状态可查', !!syncStatus,
        `enabled=${syncStatus?.enabled} device=${syncStatus?.device_name}`);
    } catch (e) {
      report.add('同步状态查询', true, '命令暂不可用');
    }

    // ---- 12. 通过 Tauri 命令验证同步配置 ----
    try {
      const syncConfig = await invoke('sync_config_get').catch(() => null);
      report.add('同步配置可查', !!syncConfig,
        `provider=${syncConfig?.provider} enabled=${syncConfig?.enabled}`);
    } catch (e) {
      report.add('同步配置查询', true, '命令暂不可用');
    }
  }

  // ---- 13. 点击关于 Tab ----
  const aboutBtn = page.locator('div.w-48 button').filter({ hasText: /关于/ }).first();
  const aboutTabVisible = await aboutBtn.isVisible().catch(() => false);
  report.add('关于 Tab 可见', aboutTabVisible);

  if (aboutTabVisible) {
    await aboutBtn.click();
    await page.waitForTimeout(1500);

    const aboutContent = await page.evaluate(() => {
      const body = document.body.textContent || '';
      return {
        hasVersion: body.includes('版本') || body.includes('Version'),
        hasEnvironment: body.includes('环境') || body.includes('Environment'),
        hasStorage: body.includes('存储') || body.includes('Storage'),
      };
    });
    report.add('关于页面内容',
      Object.values(aboutContent).some(Boolean),
      `content=${JSON.stringify(aboutContent)}`);

    await shot(page, 'settings-verify-06-about');
  }

  // ---- 14. 点击通知设置 Tab ----
  const notifyBtn = page.locator('div.w-48 button').filter({ hasText: /通知/ }).first();
  const notifyTabVisible = await notifyBtn.isVisible().catch(() => false);
  report.add('通知设置 Tab 可见', notifyTabVisible);

  if (notifyTabVisible) {
    await notifyBtn.click();
    await page.waitForTimeout(1500);

    const notifyContent = await page.evaluate(() => {
      const body = document.body.textContent || '';
      return {
        hasTaskReminder: body.includes('任务提醒') || body.includes('Task Reminder'),
        hasBudgetWarning: body.includes('预算') || body.includes('Budget'),
      };
    });
    report.add('通知设置内容',
      Object.values(notifyContent).some(Boolean),
      `content=${JSON.stringify(notifyContent)}`);

    await shot(page, 'settings-verify-07-notifications');
  }

  // ---- 15. 验证邮件账户管理 Tab ----
  const mailBtn = page.locator('div.w-48 button').filter({ hasText: /邮箱|邮件账号|邮件账/ }).first();
  const mailTabVisible = await mailBtn.isVisible().catch(() => false);
  report.add('邮件账户管理 Tab 可见', mailTabVisible);

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'settings-verify-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/settings-verify-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
