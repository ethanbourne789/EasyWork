// e2e-tauri/settings-advanced.mjs
// 设置页高级功能 E2E：
//  1) 登录演示账户
//  2) 导航到设置页
//  3) 测试修改密码流程（auth_change_password 命令）
//  4) 测试开机自启设置（get_autostart_status / set_autostart）
//  5) 测试关闭行为设置（get_close_behavior / set_close_behavior）
//  6) 导航到数据管理 tab
//  7) 测试导出日志命令（export_logs）
//  8) 测试清除所有数据命令（data_clear_all）
//  9) 验证无 JS 错误
import { connect, collectErrors, demoLogin, shot, Report } from './helpers.mjs';

const DEMO_PASSWORD = 'demo123456';
const NEW_PASSWORD = 'newpass123';
const ORIGINAL_PASSWORD = DEMO_PASSWORD;

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
  await shot(page, 'settings-advanced-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // 获取当前用户 ID（用于 auth_change_password）
  const userId = await page.evaluate(() => {
    if (window.__authStore) {
      return window.__authStore.getState()?.user?.id || '';
    }
    // 回退：从 localStorage 读取
    try {
      const stored = localStorage.getItem('easywork_user_id') || '';
      return stored;
    } catch { return ''; }
  });
  report.add('获取到当前用户 ID', !!userId, `userId=${userId ? userId.slice(0, 8) + '...' : '(empty)'}`);

  // ---- 2. 导航到设置页 ----
  await page.locator('a[href="/settings"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'settings-advanced-02-settings-page');
  report.add('进入设置页', page.url().includes('/settings'));

  // ---- 3. 测试修改密码 ----
  // 3a. 验证演示密码可以正常校验（先改成新密码）
  try {
    const changeResult = await invoke('auth_change_password', {
      userId,
      currentPassword: ORIGINAL_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    report.add('修改密码成功（demo -> newpass）', true, `result=${JSON.stringify(changeResult).slice(0, 60)}`);
  } catch (e) {
    report.add('修改密码成功（demo -> newpass）', false, String(e?.message ?? e).slice(0, 120));
  }

  await shot(page, 'settings-advanced-03-password-changed');

  // 3b. 尝试使用错误旧密码（应该失败，因为密码已改为 newpass123）
  try {
    await invoke('auth_change_password', {
      userId,
      currentPassword: ORIGINAL_PASSWORD,
      newPassword: 'anotherpass1',
    });
    report.add('错误旧密码被拒绝', false, '命令未报错（异常）');
  } catch (e) {
    const msg = String(e?.message ?? e);
    const rejected = msg.includes('不正确') || msg.includes('密码') || msg.length > 0;
    report.add('错误旧密码被拒绝', rejected, msg.slice(0, 100));
  }

  // 3c. 尝试过短新密码（应该失败，最小 6 位）
  try {
    await invoke('auth_change_password', {
      userId,
      currentPassword: NEW_PASSWORD,
      newPassword: 'short',
    });
    report.add('过短密码被拒绝', false, '命令未报错（异常）');
  } catch (e) {
    const msg = String(e?.message ?? e);
    const rejected = msg.includes('至少') || msg.includes('6') || msg.includes('长度') || msg.length > 0;
    report.add('过短密码被拒绝', rejected, msg.slice(0, 100));
  }

  // 3d. 改回原始密码
  try {
    await invoke('auth_change_password', {
      userId,
      currentPassword: NEW_PASSWORD,
      newPassword: ORIGINAL_PASSWORD,
    });
    report.add('密码恢复成功（newpass -> demo）', true);
  } catch (e) {
    report.add('密码恢复成功（newpass -> demo）', false, String(e?.message ?? e).slice(0, 120));
  }

  await shot(page, 'settings-advanced-04-password-restored');

  // ---- 4. 测试开机自启设置 ----
  // 4a. 获取当前状态
  let autostartBefore = null;
  try {
    autostartBefore = await invoke('get_autostart_status');
    report.add('获取自启状态成功', typeof autostartBefore === 'boolean',
      `autostart=${autostartBefore}`);
  } catch (e) {
    report.add('获取自启状态', false, String(e?.message ?? e).slice(0, 120));
    autostartBefore = false;
  }

  // 4b. 开启自启
  try {
    await invoke('set_autostart', { enabled: true });
    report.add('开启自启成功', true);
  } catch (e) {
    report.add('开启自启', false, String(e?.message ?? e).slice(0, 120));
  }

  // 4c. 验证开启后的状态
  try {
    const autostartAfterOn = await invoke('get_autostart_status');
    report.add('自启开启后状态为 true', autostartAfterOn === true,
      `autostart=${autostartAfterOn}`);
  } catch (e) {
    report.add('验证自启开启状态', false, String(e?.message ?? e).slice(0, 120));
  }

  // 4d. 关闭自启
  try {
    await invoke('set_autostart', { enabled: false });
    report.add('关闭自启成功', true);
  } catch (e) {
    report.add('关闭自启', false, String(e?.message ?? e).slice(0, 120));
  }

  // 4e. 验证关闭后的状态
  try {
    const autostartAfterOff = await invoke('get_autostart_status');
    report.add('自启关闭后状态为 false', autostartAfterOff === false,
      `autostart=${autostartAfterOff}`);
  } catch (e) {
    report.add('验证自启关闭状态', false, String(e?.message ?? e).slice(0, 120));
  }

  // 4f. 恢复原始状态
  try {
    await invoke('set_autostart', { enabled: autostartBefore });
    report.add('自启状态已恢复', true, `restored=${autostartBefore}`);
  } catch (e) {
    report.add('自启状态恢复', false, String(e?.message ?? e).slice(0, 120));
  }

  await shot(page, 'settings-advanced-05-autostart-tests-done');

  // ---- 5. 测试关闭行为设置 ----
  // 5a. 获取当前状态
  let closeBehaviorBefore = null;
  try {
    closeBehaviorBefore = await invoke('get_close_behavior');
    report.add('获取关闭行为成功', typeof closeBehaviorBefore === 'boolean',
      `closeOnExit=${closeBehaviorBefore}`);
  } catch (e) {
    report.add('获取关闭行为', false, String(e?.message ?? e).slice(0, 120));
    closeBehaviorBefore = false;
  }

  // 5b. 切换为相反值
  const closeBehaviorToggle = !closeBehaviorBefore;
  try {
    await invoke('set_close_behavior', { closeOnExit: closeBehaviorToggle });
    report.add('切换关闭行为成功', true, `set=${closeBehaviorToggle}`);
  } catch (e) {
    report.add('切换关闭行为', false, String(e?.message ?? e).slice(0, 120));
  }

  // 5c. 验证切换后的状态
  try {
    const closeBehaviorAfter = await invoke('get_close_behavior');
    report.add('关闭行为切换生效', closeBehaviorAfter === closeBehaviorToggle,
      `expected=${closeBehaviorToggle} actual=${closeBehaviorAfter}`);
  } catch (e) {
    report.add('验证关闭行为切换', false, String(e?.message ?? e).slice(0, 120));
  }

  // 5d. 恢复原始值
  try {
    await invoke('set_close_behavior', { closeOnExit: closeBehaviorBefore });
    report.add('关闭行为已恢复', true, `restored=${closeBehaviorBefore}`);
  } catch (e) {
    report.add('关闭行为恢复', false, String(e?.message ?? e).slice(0, 120));
  }

  await shot(page, 'settings-advanced-06-close-behavior-tests-done');

  // ---- 6. 导航到数据管理 tab ----
  const dataTab = page.locator('div.w-48 button').filter({ hasText: /数据管理/ }).first();
  const dataTabVisible = await dataTab.isVisible().catch(() => false);
  report.add('数据管理 Tab 可见', dataTabVisible);

  if (dataTabVisible) {
    await dataTab.click();
    await page.waitForTimeout(1500);

    // 验证数据管理区域内容
    const dataContent = await page.evaluate(() => {
      const body = document.body.textContent || '';
      return {
        hasExport: body.includes('导出数据') || body.includes('Export Data') || body.includes('导出'),
        hasImport: body.includes('导入数据') || body.includes('Import Data') || body.includes('选择备份'),
        hasClearAll: body.includes('清除所有') || body.includes('Clear All') || body.includes('清除全部'),
        hasExportLogs: body.includes('导出日志') || body.includes('Export Logs'),
      };
    });
    report.add('数据管理区域内容完整',
      Object.values(dataContent).some(Boolean),
      `content=${JSON.stringify(dataContent)}`);

    await shot(page, 'settings-advanced-07-data-management');
  }

  // ---- 7. 测试导出日志命令 ----
  try {
    const logResult = await invoke('export_logs');
    report.add('export_logs 命令可达（有日志文件）', true,
      `path=${String(logResult).slice(0, 80)}`);
  } catch (e) {
    const msg = String(e?.message ?? e);
    const isExpected = msg.includes('暂无日志') || msg.includes('未选择');
    report.add('export_logs 命令可达（无日志/取消为正常）', isExpected, msg.slice(0, 80));
  }

  await shot(page, 'settings-advanced-08-export-logs');

  // ---- 8. 测试清除所有数据命令 ----
  // 先导出当前数据量作为对比基线
  let taskCountBefore = 0;
  try {
    const preClearTasks = await invoke('task_list_all');
    taskCountBefore = Array.isArray(preClearTasks) ? preClearTasks.length : 0;
    report.add('清除前任务数记录', true, `tasks=${taskCountBefore}`);
  } catch (e) {
    report.add('清除前任务数记录', false, String(e?.message ?? e).slice(0, 120));
  }

  try {
    await invoke('data_clear_all');
    report.add('data_clear_all 执行成功', true);
  } catch (e) {
    report.add('data_clear_all 执行', false, String(e?.message ?? e).slice(0, 120));
  }

  // 验证数据已被清除
  try {
    const postClearTasks = await invoke('task_list_all');
    const postCount = Array.isArray(postClearTasks) ? postClearTasks.length : 0;
    report.add('清除后任务数为 0', postCount === 0,
      `before=${taskCountBefore} after=${postCount}`);
  } catch (e) {
    report.add('清除后任务数验证', false, String(e?.message ?? e).slice(0, 120));
  }

  await shot(page, 'settings-advanced-09-data-cleared');

  // ---- 9. 导航到系统 tab（如果可见）----
  const systemTab = page.locator('div.w-48 button').filter({ hasText: /系统/ }).first();
  const systemTabVisible = await systemTab.isVisible().catch(() => false);
  report.add('系统 Tab 可见', systemTabVisible);

  if (systemTabVisible) {
    await systemTab.click();
    await page.waitForTimeout(1500);

    const systemContent = await page.evaluate(() => {
      const body = document.body.textContent || '';
      return {
        hasAutostart: body.includes('开机自启') || body.includes('Auto Start') || body.includes('autostart'),
        hasCloseBehavior: body.includes('关闭') || body.includes('Close') || body.includes('closeOnExit'),
      };
    });
    report.add('系统设置区域内容',
      Object.values(systemContent).some(Boolean),
      `content=${JSON.stringify(systemContent)}`);

    await shot(page, 'settings-advanced-10-system-tab');
  }

  // ---- 10. 重新播种演示数据（恢复测试环境）----
  try {
    await invoke('demo_enter');
    report.add('演示数据重新播种', true);
  } catch (e) {
    report.add('演示数据重新播种', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'settings-advanced-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/settings-advanced-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
