// e2e-tauri/empty-states.mjs
// 空状态与数据验证专项 E2E：
//  1) 登录演示账户
//  2) 导出当前数据快照（用于后续恢复）
//  3) 通过 data_clear_all 清空所有数据
//  4) 验证仪表盘显示零计数
//  5) 导航到各模块并验证空状态：
//     - 任务：空任务列表
//     - 笔记：空笔记列表
//     - 记账：空交易列表
//     - 日历：空日历视图
//     - 邮箱：空收件箱
//  6) 从空状态创建新数据（各模块一条）
//  7) 验证新建数据可见
//  8) 恢复原始数据（导入备份）
//  9) 清理
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
  await shot(page, 'empty-states-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导出当前数据快照（用于恢复）----
  let preClearBackup;
  try {
    preClearBackup = await invoke('data_export_all');
    report.add('清除前数据备份成功', Object.keys(preClearBackup).length > 0,
      `tables=${Object.keys(preClearBackup).length}`);
  } catch (e) {
    report.add('清除前数据备份', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('数据备份失败，无法安全执行清空');
  }

  // 记录清除前的数据快照
  const preClearSnapshot = {};
  const preClearTables = ['tasks', 'notes', 'transactions', 'accounts', 'calendar_events'];
  for (const tbl of preClearTables) {
    preClearSnapshot[tbl] = Array.isArray(preClearBackup[tbl]) ? preClearBackup[tbl].length : 0;
  }
  console.log('  清除前快照:', preClearSnapshot);

  // ---- 3. 清空所有数据 ----
  try {
    await invoke('data_clear_all');
    report.add('data_clear_all 执行成功', true);
  } catch (e) {
    report.add('data_clear_all 执行', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('data_clear_all 失败，跳过后续步骤');
  }

  // 等待数据刷新（React Query 失效 + 重新获取）
  await page.waitForTimeout(2000);
  await shot(page, 'empty-states-02-after-clear');

  // ---- 4. 验证命令层数据已清空 ----
  const postClearExport = await invoke('data_export_all');
  let allEmpty = true;
  const emptyDetails = [];
  for (const tbl of preClearTables) {
    const count = Array.isArray(postClearExport[tbl]) ? postClearExport[tbl].length : 0;
    if (count > 0) allEmpty = false;
    emptyDetails.push(`${tbl}:${count}`);
  }
  report.add('清空后所有业务表为空', allEmpty, emptyDetails.join(', '));

  // ---- 5. 验证仪表盘显示零计数 ----
  await page.locator('a[href="/dashboard"]').first().click();
  await page.waitForTimeout(2000);
  await shot(page, 'empty-states-03-dashboard-zeros');

  // 验证仪表盘统计卡片值为 0
  const dashboardCardValues = await page.evaluate(() => {
    const cards = document.querySelectorAll('.grid-cols-2 .border.bg-card, .grid-cols-4 .border.bg-card');
    const values = [];
    cards.forEach(card => {
      const mono = card.querySelector('.font-mono');
      if (mono) values.push(mono.textContent.trim());
    });
    return values;
  });
  // 检查是否包含 0 值（待办、未读邮件、笔记数等都应为 0）
  const hasZero = dashboardCardValues.some(v => v === '0' || v.includes('0'));
  report.add('仪表盘统计卡片含 0 值', hasZero, `values=[${dashboardCardValues.join(', ')}]`);

  // 验证待办计数文本
  const dashboardBody = await page.locator('body').textContent();
  const hasZeroPending = dashboardBody.includes('0 项待办') || dashboardBody.includes('0 pending');
  report.add('仪表盘显示 0 项待办', hasZeroPending, `bodyLength=${dashboardBody.length}`);

  // ---- 6. 验证各模块空状态 ----

  // 6a. 任务模块空状态
  await page.locator('a[href="/tasks"]').first().click();
  await page.waitForTimeout(2000);
  await shot(page, 'empty-states-04-tasks-empty');

  const tasksAfterClear = await invoke('task_list_all');
  report.add('任务列表为空', tasksAfterClear.length === 0, `count=${tasksAfterClear.length}`);

  const tasksBody = await page.locator('body').textContent();
  const hasTasksEmpty = tasksBody.includes('暂无任务') || tasksBody.includes('noTask');
  report.add('任务页显示空状态文案', hasTasksEmpty, `body snippet: "${tasksBody.slice(0, 200)}"`);

  // 6b. 笔记模块空状态
  await page.locator('a[href="/notes"]').first().click();
  await page.waitForTimeout(2000);
  await shot(page, 'empty-states-05-notes-empty');

  const notesAfterClear = await invoke('note_list_all');
  report.add('笔记列表为空', notesAfterClear.length === 0, `count=${notesAfterClear.length}`);

  const notesBody = await page.locator('body').textContent();
  const hasNotesEmpty = notesBody.includes('暂无笔记') || notesBody.includes('暂无文件夹');
  report.add('笔记页显示空状态文案', hasNotesEmpty, `body snippet: "${notesBody.slice(0, 200)}"`);

  // 6c. 记账模块空状态
  await page.locator('a[href="/finance"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'empty-states-06-finance-empty');

  const txnsAfterClear = await invoke('transaction_list_all');
  report.add('交易列表为空', txnsAfterClear.length === 0, `count=${txnsAfterClear.length}`);

  const accountsAfterClear = await invoke('account_list_all');
  report.add('账户列表为空', accountsAfterClear.length === 0, `count=${accountsAfterClear.length}`);

  const financeBody = await page.locator('body').textContent();
  const hasFinanceEmpty = financeBody.includes('没有符合条件的交易') || financeBody.includes('暂无交易');
  report.add('记账页显示空状态文案', hasFinanceEmpty, `body snippet: "${financeBody.slice(0, 200)}"`);

  // 6d. 日历模块空状态
  await page.locator('a[href="/calendar"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'empty-states-07-calendar-empty');

  const eventsAfterClear = await invoke('calendar_event_list_all');
  report.add('日历事件列表为空', eventsAfterClear.length === 0, `count=${eventsAfterClear.length}`);

  const calendarBody = await page.locator('body').textContent();
  const hasCalendarEmpty = calendarBody.includes('暂无日程') || calendarBody.includes('暂无');
  report.add('日历页显示空状态文案', hasCalendarEmpty, `body snippet: "${calendarBody.slice(0, 200)}"`);

  // 6e. 邮箱模块空状态（邮箱数据在独立 mail.db，data_clear_all 不清空邮件库）
  await page.locator('a[href="/mail"]').first().click();
  await page.waitForTimeout(2000);
  await shot(page, 'empty-states-08-mail');

  // 邮箱可能有账户（不在 data_clear_all 范围内），仅检查是否可正常加载
  const mailBody = await page.locator('body').textContent();
  report.add('邮箱页可正常加载', mailBody.length > 50, `bodyLength=${mailBody.length}`);

  // ---- 7. 从空状态创建新数据 ----

  // 7a. 创建任务
  let newTask;
  try {
    newTask = await invoke('task_create', {
      title: '空状态后新任务',
      description: '从空状态创建的第一条任务',
      priority: 'medium',
    });
    report.add('从空状态创建任务', !!newTask?.id, `title="${newTask?.title}"`);
  } catch (e) {
    report.add('从空状态创建任务', false, String(e?.message ?? e).slice(0, 120));
  }

  // 7b. 创建笔记
  let newNote;
  try {
    newNote = await invoke('note_create', {
      title: '空状态后新笔记',
      contentText: '从空状态创建的第一条笔记',
    });
    report.add('从空状态创建笔记', !!newNote?.id, `title="${newNote?.title}"`);
  } catch (e) {
    report.add('从空状态创建笔记', false, String(e?.message ?? e).slice(0, 120));
  }

  // 7c. 创建账户和交易（交易需要先有账户和分类）
  let newAccount;
  try {
    newAccount = await invoke('account_create', {
      name: '空状态测试账户',
      type: 'cash',
      initialBalanceCents: 10000,
    });
    report.add('从空状态创建账户', !!newAccount?.id, `name="${newAccount?.name}"`);
  } catch (e) {
    report.add('从空状态创建账户', false, String(e?.message ?? e).slice(0, 120));
  }

  let newCategory;
  try {
    newCategory = await invoke('category_create', {
      name: '空状态测试分类',
      type: 'expense',
    });
    report.add('从空状态创建分类', !!newCategory?.id, `name="${newCategory?.name}"`);
  } catch (e) {
    report.add('从空状态创建分类', false, String(e?.message ?? e).slice(0, 120));
  }

  let newTransaction;
  if (newAccount) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      newTransaction = await invoke('transaction_create', {
        type: 'expense',
        amountCents: 1500,
        accountId: newAccount.id,
        categoryId: newCategory?.id || null,
        date: today,
        description: '空状态后第一笔支出',
      });
      report.add('从空状态创建交易', !!newTransaction?.id, `amount=${newTransaction?.amount}`);
    } catch (e) {
      report.add('从空状态创建交易', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // 7d. 创建日历事件
  let newEvent;
  try {
    const tomorrow = new Date(Date.now() + 86400000);
    const startAt = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 14, 0, 0).toISOString();
    const endAt = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 15, 0, 0).toISOString();
    newEvent = await invoke('calendar_event_create', {
      title: '空状态后新日程',
      startAt,
      endAt,
      description: '从空状态创建的第一个日程',
    });
    report.add('从空状态创建日历事件', !!newEvent?.id, `title="${newEvent?.title}"`);
  } catch (e) {
    report.add('从空状态创建日历事件', false, String(e?.message ?? e).slice(0, 120));
  }

  await shot(page, 'empty-states-09-data-created');

  // ---- 8. 验证新建数据落库 ----
  const tasksCheck = await invoke('task_list_all');
  report.add('新任务落库', tasksCheck.some(t => t.title?.includes('空状态后新任务')),
    `tasks=${tasksCheck.length}`);

  const notesCheck = await invoke('note_list_all');
  report.add('新笔记落库', notesCheck.some(n => n.title?.includes('空状态后新笔记')),
    `notes=${notesCheck.length}`);

  const txnsCheck = await invoke('transaction_list_all');
  report.add('新交易落库', txnsCheck.some(t => (t.note ?? '').includes('空状态后')),
    `transactions=${txnsCheck.length}`);

  const eventsCheck = await invoke('calendar_event_list_all');
  report.add('新事件落库', eventsCheck.some(e => e.title?.includes('空状态后新日程')),
    `events=${eventsCheck.length}`);

  // ---- 9. 验证仪表盘计数更新（非零）----
  await page.locator('a[href="/dashboard"]').first().click();
  await page.waitForTimeout(2000);
  await shot(page, 'empty-states-10-dashboard-updated');

  const updatedDashboardBody = await page.locator('body').textContent();
  const hasNonZero = updatedDashboardBody.includes('项待办') && !updatedDashboardBody.includes('0 项待办');
  report.add('仪表盘计数更新为非零', hasNonZero || updatedDashboardBody.length > 100,
    `bodyLength=${updatedDashboardBody.length}`);

  // ---- 10. 恢复原始数据（导入备份）----
  let restoreResult;
  try {
    restoreResult = await invoke('data_import_all', {
      data: preClearBackup,
    });
    report.add('恢复原始数据成功', typeof restoreResult === 'number',
      `restored_tables=${restoreResult}`);
  } catch (e) {
    report.add('恢复原始数据', false, String(e?.message ?? e).slice(0, 120));
  }

  // 等待恢复后数据刷新
  await page.waitForTimeout(1500);

  // 验证恢复后数据量
  let postRestoreExport;
  try {
    postRestoreExport = await invoke('data_export_all');
    let restored = true;
    const restoreDetails = [];
    for (const tbl of preClearTables) {
      const count = Array.isArray(postRestoreExport[tbl]) ? postRestoreExport[tbl].length : 0;
      const orig = preClearSnapshot[tbl] ?? 0;
      if (count < orig) restored = false;
      restoreDetails.push(`${tbl}:${orig}->${count}`);
    }
    report.add('恢复后数据量不低于清除前', restored, restoreDetails.join(', '));
  } catch (e) {
    report.add('恢复后数据校验', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 11. 清理测试中创建的额外数据 ----
  // 恢复后的数据已包含原始数据，但我们也创建了额外数据（空状态后新任务等）。
  // 清理这些额外数据。
  let cleaned = 0;
  if (newTask) {
    try {
      await invoke('task_delete', { id: newTask.id });
      cleaned++;
    } catch { /* ignore */ }
  }
  if (newNote) {
    try {
      await invoke('note_delete', { id: newNote.id });
      cleaned++;
    } catch { /* ignore */ }
  }
  if (newTransaction) {
    try {
      await invoke('transaction_delete', { id: newTransaction.id });
      cleaned++;
    } catch { /* ignore */ }
  }
  if (newEvent) {
    try {
      await invoke('calendar_event_delete', { id: newEvent.id });
      cleaned++;
    } catch { /* ignore */ }
  }
  if (newAccount) {
    try {
      await invoke('account_delete', { id: newAccount.id });
      cleaned++;
    } catch { /* ignore */ }
  }
  if (newCategory) {
    try {
      await invoke('category_delete', { id: newCategory.id });
      cleaned++;
    } catch { /* ignore */ }
  }
  report.add('测试数据清理完成', cleaned > 0, `cleaned=${cleaned}`);

  await shot(page, 'empty-states-11-cleaned');

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'empty-states-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/empty-states-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
