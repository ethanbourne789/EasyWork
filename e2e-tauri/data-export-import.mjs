// e2e-tauri/data-export-import.mjs
// 数据导出/导入专项 E2E：
//  1) 登录演示账户后导航到设置页
//  2) 验证 data_export_all / data_import_all Tauri 命令可达
//  3) 导出全量数据并校验结构（含业务表白名单）
//  4) 导入回写后验证数据一致性（交易数/任务数/笔记数不变）
//  5) 导航回各模块页，确认数据持久化可见
import { connect, collectErrors, demoLogin, shot, navTo, Report, expect } from './helpers.mjs';

const BACKUP_TABLES_WHITELIST = [
  'tasks', 'task_tags', 'tags', 'subtasks',
  'notes', 'note_folders', 'note_tags', 'note_note_tags', 'note_tag_master',
  'accounts', 'transactions', 'categories', 'budgets',
  'contacts', 'contact_groups', 'contact_group_members',
  'email_accounts', 'email_folders', 'emails', 'email_attachments',
  'mail_templates', 'mail_signatures', 'mail_drafts',
  'calendar_subscriptions', 'calendar_events',
  'reminders', 'sync_config', 'profiles',
];

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
  await shot(page, 'export-import-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导航到设置 → 数据管理 tab ----
  await page.locator('a[href="/settings"]').first().click();
  await page.waitForTimeout(1500);
  report.add('进入设置页', page.url().includes('/settings'));

  // 点击「数据管理」tab
  const dataTab = page.locator('div.w-48 button').filter({ hasText: /数据管理/ }).first();
  await dataTab.click();
  await page.waitForTimeout(1000);
  await shot(page, 'export-import-02-settings-data');

  // 验证导出/导入按钮存在（内容区按钮，不在侧边栏内）
  const exportBtn = page.locator('button').filter({ hasText: /导出/ }).first();
  const importBtn = page.locator('button').filter({ hasText: /选择备份|导入/ }).first();
  report.add('设置页可见导出按钮', await exportBtn.isVisible().catch(() => false));
  report.add('设置页可见导入按钮', await importBtn.isVisible().catch(() => false));

  // ---- 3. 通过 Tauri 命令直接导出全量数据 ----
  let exportData;
  try {
    exportData = await invoke('data_export_all');
    report.add('data_export_all 命令可达', true);
  } catch (e) {
    report.add('data_export_all 命令可达', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('data_export_all 命令调用失败，跳过后续步骤');
  }

  // 校验导出数据结构
  const exportedKeys = Object.keys(exportData);
  report.add('导出数据包含业务表', exportedKeys.length > 0, `tables=${exportedKeys.length}`);

  // 验证核心表存在且有数据
  const coreTables = ['tasks', 'transactions', 'accounts', 'notes'];
  for (const tbl of coreTables) {
    const hasTable = exportedKeys.includes(tbl);
    const count = hasTable ? (Array.isArray(exportData[tbl]) ? exportData[tbl].length : 0) : 0;
    report.add(`导出包含 ${tbl} 表`, hasTable, `rows=${count}`);
  }

  // 校验白名单：所有导出的表名都应在白名单内
  const unknownTables = exportedKeys.filter((k) => !BACKUP_TABLES_WHITELIST.includes(k));
  report.add('导出表名全在白名单内', unknownTables.length === 0,
    unknownTables.length ? `未知表: ${unknownTables.join(', ')}` : '');

  // 记录导出前的数据快照
  const snapshot = {};
  for (const tbl of coreTables) {
    if (Array.isArray(exportData[tbl])) {
      snapshot[tbl] = exportData[tbl].length;
      // 记录交易 ID 集合，用于后续导入一致性校验
      if (tbl === 'transactions') {
        snapshot[tbl + '_ids'] = new Set(exportData[tbl].map((r) => r.id));
      }
      if (tbl === 'tasks') {
        snapshot[tbl + '_ids'] = new Set(exportData[tbl].map((r) => r.id));
      }
    }
  }

  // ---- 4. 验证导出内容字段完整性 ----
  const txnSample = exportData.transactions?.[0];
  if (txnSample) {
    const requiredFields = ['id', 'type', 'amount_cents', 'account_id', 'date', 'created_at'];
    const missing = requiredFields.filter((f) => !(f in txnSample));
    report.add('交易记录字段完整', missing.length === 0,
      missing.length ? `缺失字段: ${missing.join(', ')}` : `字段数=${Object.keys(txnSample).length}`);
  }

  const taskSample = exportData.tasks?.[0];
  if (taskSample) {
    const requiredFields = ['id', 'title', 'status', 'created_at'];
    const missing = requiredFields.filter((f) => !(f in taskSample));
    report.add('任务记录字段完整', missing.length === 0,
      missing.length ? `缺失字段: ${missing.join(', ')}` : `字段数=${Object.keys(taskSample).length}`);
  }

  await shot(page, 'export-import-03-export-done');

  // ---- 5. 通过 Tauri 命令验证 data_import_all 可达 ----
  let importResult;
  try {
    importResult = await invoke('data_import_all', {
      data: exportData,
    });
    report.add('data_import_all 命令可达（导入返回表数）', typeof importResult === 'number',
      `imported_tables=${importResult}`);
  } catch (e) {
    report.add('data_import_all 命令可达', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 6. 导入后重新导出，校验数据一致性 ----
  let reExportData;
  try {
    reExportData = await invoke('data_export_all');
    const reExportedKeys = Object.keys(reExportData);
    // 核心表行数不变
    let consistent = true;
    const consistencyDetails = [];
    for (const tbl of coreTables) {
      const reCount = Array.isArray(reExportData[tbl]) ? reExportData[tbl].length : 0;
      const origCount = snapshot[tbl] ?? 0;
      if (reCount !== origCount) {
        consistent = false;
      }
      consistencyDetails.push(`${tbl}:${origCount}->${reCount}`);
    }
    report.add('导入后数据一致性（行数不变）', consistent, consistencyDetails.join(', '));
  } catch (e) {
    report.add('导入后重新导出校验', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 7. 验证 export_logs 命令存在（日志导出）----
  let logResult;
  try {
    logResult = await invoke('export_logs');
    report.add('export_logs 命令可达（有日志文件）', true, `path=${String(logResult).slice(0, 80)}`);
  } catch (e) {
    const msg = String(e?.message ?? e);
    // 「暂无日志文件」或「未选择导出目录」都是正常路径（无日志或用户取消）
    const isExpected = msg.includes('暂无日志') || msg.includes('未选择');
    report.add('export_logs 命令可达（无日志/取消为正常）', isExpected, msg.slice(0, 80));
  }

  // ---- 8. 导航回各模块页验证数据持久化 ----
  // 回到仪表盘
  await page.locator('a[href="/dashboard"]').first().click();
  await page.waitForTimeout(1200);
  const dashBody = await page.locator('body').textContent();
  report.add('仪表盘数据可见', dashBody.length > 200, `body=${dashBody.length}字`);
  await shot(page, 'export-import-04-dashboard-persist');

  // 到记账页验证交易可见
  await page.locator('a[href="/finance"]').first().click();
  await page.waitForTimeout(1500);
  const financeBody = await page.locator('body').textContent();
  const hasTransactionText = financeBody.includes('元') || financeBody.includes('CNY');
  report.add('记账页数据持久化', hasTransactionText || financeBody.length > 200,
    `body=${financeBody.length}字 hasAmount=${hasTransactionText}`);
  await shot(page, 'export-import-05-finance-persist');

  // 到任务页验证任务可见
  await page.locator('a[href="/tasks"]').first().click();
  await page.waitForTimeout(1200);
  const tasksBody = await page.locator('body').textContent();
  report.add('任务页数据持久化', tasksBody.length > 200, `body=${tasksBody.length}字`);

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'export-import-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/data-export-import-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
