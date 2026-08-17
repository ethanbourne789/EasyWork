// e2e-tauri/task-recurrence.mjs
// 任务重复规则、优先级、标签全流程 E2E：
//  1) 登录演示账户
//  2) 导航到任务页，验证任务页渲染
//  3) 创建带每日重复规则的任务
//  4) 创建带每周重复规则的任务
//  5) 创建带每月重复规则的任务
//  6) 验证重复规则正确落库
//  7) 清除任务重复规则
//  8) 创建多个标签并关联任务
//  9) 更新标签名称和颜色
//  10) 测试所有优先级：low / medium / high
//  11) 验证最终任务列表
//  12) 清理所有测试数据
import { connect, collectErrors, demoLogin, shot, Report, expect } from './helpers.mjs';

const report = new Report();
let browser, page;
const errors = [];
const invoke = (cmd, args = {}) =>
  page.evaluate(([c, a]) => window.__TAURI__.core.invoke(c, a), [cmd, args]);

// Helper: compute date offsets
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const farFuture = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));

  // ---- 1. 演示登录 ----
  const loginResult = await demoLogin(page);
  await shot(page, 'task-recurrence-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导航到任务页 ----
  await page.locator('a[href="/tasks"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'task-recurrence-02-tasks-page');
  report.add('进入任务页', page.url().includes('/tasks'));

  // ---- 3. 获取初始任务与标签快照 ----
  let initialTasks, initialTags;
  try {
    initialTasks = await invoke('task_list_all');
    report.add('获取任务列表', Array.isArray(initialTasks), `count=${initialTasks.length}`);
  } catch (e) {
    report.add('获取任务列表', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('无法获取任务列表，跳过后续步骤');
  }
  try {
    initialTags = await invoke('tag_list_all');
    report.add('获取标签列表', Array.isArray(initialTags), `count=${initialTags.length}`);
  } catch (e) {
    report.add('获取标签列表', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('无法获取标签列表，跳过后续步骤');
  }
  const initialTaskCount = initialTasks.length;
  const initialTagCount = initialTags.length;
  console.log('  初始任务数:', initialTaskCount, '初始标签数:', initialTagCount);

  // Collect IDs for cleanup
  const createdTaskIds = [];
  const createdTagIds = [];

  // ===================================================================
  //  4. 创建带每日重复规则的任务
  // ===================================================================
  let dailyTask;
  try {
    dailyTask = await invoke('task_create', {
      title: 'E2E 每日重复-每日站会',
      description: '每天 9:00 站会',
      priority: 'high',
      dueDate: today,
      recurrenceRule: { frequency: 'day', interval: 1 },
      recurrenceNext: tomorrow,
    });
    report.add('创建每日重复任务', !!dailyTask?.id,
      `title="${dailyTask?.title}" priority=${dailyTask?.priority}`);
    if (dailyTask) createdTaskIds.push(dailyTask.id);
  } catch (e) {
    report.add('创建每日重复任务', false, String(e?.message ?? e).slice(0, 120));
  }

  // 验证每日重复规则
  if (dailyTask) {
    const dailyRule = dailyTask.recurrence_rule;
    report.add('每日重复规则落库',
      dailyRule?.frequency === 'day' && dailyRule?.interval === 1,
      `rule=${JSON.stringify(dailyRule)}`);
    report.add('每日 recurrence_next 正确',
      dailyTask.recurrence_next === tomorrow,
      `next=${dailyTask.recurrence_next} expected=${tomorrow}`);
  }

  // ===================================================================
  //  5. 创建带每周重复规则的任务
  // ===================================================================
  let weeklyTask;
  try {
    weeklyTask = await invoke('task_create', {
      title: 'E2E 每周重复-周报撰写',
      description: '每周五提交周报',
      priority: 'medium',
      dueDate: today,
      recurrenceRule: { frequency: 'weekly', interval: 1 },
      recurrenceNext: nextWeek,
    });
    report.add('创建每周重复任务', !!weeklyTask?.id,
      `title="${weeklyTask?.title}" priority=${weeklyTask?.priority}`);
    if (weeklyTask) createdTaskIds.push(weeklyTask.id);
  } catch (e) {
    report.add('创建每周重复任务', false, String(e?.message ?? e).slice(0, 120));
  }

  // 验证每周重复规则
  if (weeklyTask) {
    const weeklyRule = weeklyTask.recurrence_rule;
    report.add('每周重复规则落库',
      weeklyRule?.frequency === 'weekly' && weeklyRule?.interval === 1,
      `rule=${JSON.stringify(weeklyRule)}`);
    report.add('每周 recurrence_next 正确',
      weeklyTask.recurrence_next === nextWeek,
      `next=${weeklyTask.recurrence_next} expected=${nextWeek}`);
  }

  await shot(page, 'task-recurrence-03-recurrence-created');

  // ===================================================================
  //  6. 创建带每月重复规则的任务
  // ===================================================================
  let monthlyTask;
  try {
    monthlyTask = await invoke('task_create', {
      title: 'E2E 每月重复-月度账单核对',
      description: '每月 1 号核对账单',
      priority: 'low',
      dueDate: today,
      recurrenceRule: { frequency: 'monthly', interval: 1 },
      recurrenceNext: nextMonth,
    });
    report.add('创建每月重复任务', !!monthlyTask?.id,
      `title="${monthlyTask?.title}" priority=${monthlyTask?.priority}`);
    if (monthlyTask) createdTaskIds.push(monthlyTask.id);
  } catch (e) {
    report.add('创建每月重复任务', false, String(e?.message ?? e).slice(0, 120));
  }

  // 验证每月重复规则
  if (monthlyTask) {
    const monthlyRule = monthlyTask.recurrence_rule;
    report.add('每月重复规则落库',
      monthlyRule?.frequency === 'monthly' && monthlyRule?.interval === 1,
      `rule=${JSON.stringify(monthlyRule)}`);
    report.add('每月 recurrence_next 正确',
      monthlyTask.recurrence_next === nextMonth,
      `next=${monthlyTask.recurrence_next} expected=${nextMonth}`);
  }

  // ===================================================================
  //  7. 通过 task_get 逐一验证重复任务详情
  // ===================================================================
  if (dailyTask) {
    try {
      const detail = await invoke('task_get', { id: dailyTask.id });
      report.add('查询每日任务详情',
        !!detail?.id && detail.recurrence_rule?.frequency === 'day',
        `rule=${JSON.stringify(detail.recurrence_rule)} next=${detail.recurrence_next}`);
    } catch (e) {
      report.add('查询每日任务详情', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  if (weeklyTask) {
    try {
      const detail = await invoke('task_get', { id: weeklyTask.id });
      report.add('查询每周任务详情',
        !!detail?.id && detail.recurrence_rule?.frequency === 'weekly',
        `rule=${JSON.stringify(detail.recurrence_rule)} next=${detail.recurrence_next}`);
    } catch (e) {
      report.add('查询每周任务详情', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  if (monthlyTask) {
    try {
      const detail = await invoke('task_get', { id: monthlyTask.id });
      report.add('查询每月任务详情',
        !!detail?.id && detail.recurrence_rule?.frequency === 'monthly',
        `rule=${JSON.stringify(detail.recurrence_rule)} next=${detail.recurrence_next}`);
    } catch (e) {
      report.add('查询每月任务详情', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // ===================================================================
  //  8. 清除每日任务的重复规则（null_fields）
  // ===================================================================
  if (dailyTask) {
    try {
      const cleared = await invoke('task_update', {
        id: dailyTask.id,
        nullFields: ['recurrence_rule'],
      });
      report.add('清除每日重复规则',
        cleared.recurrence_rule === null || cleared.recurrence_rule === undefined,
        `rule=${JSON.stringify(cleared.recurrence_rule)}`);
    } catch (e) {
      report.add('清除每日重复规则', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // 验证清除后的 task_get 结果
  if (dailyTask) {
    try {
      const afterClear = await invoke('task_get', { id: dailyTask.id });
      report.add('清除后任务无重复规则',
        afterClear.recurrence_rule === null || afterClear.recurrence_rule === undefined,
        `rule=${JSON.stringify(afterClear.recurrence_rule)}`);
    } catch (e) {
      report.add('验证规则清除', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  await shot(page, 'task-recurrence-04-rule-cleared');

  // ===================================================================
  //  9. 创建多个标签
  // ===================================================================
  let tagWork, tagPersonal, tagUrgent;
  try {
    tagWork = await invoke('tag_create', {
      name: 'E2E工作标签',
      color: '#3b82f6',
    });
    report.add('创建工作标签', !!tagWork?.id, `name="${tagWork?.name}" color=${tagWork?.color}`);
    if (tagWork) createdTagIds.push(tagWork.id);
  } catch (e) {
    report.add('创建工作标签', false, String(e?.message ?? e).slice(0, 120));
  }

  try {
    tagPersonal = await invoke('tag_create', {
      name: 'E2E个人标签',
      color: '#10b981',
    });
    report.add('创建个人标签', !!tagPersonal?.id, `name="${tagPersonal?.name}" color=${tagPersonal?.color}`);
    if (tagPersonal) createdTagIds.push(tagPersonal.id);
  } catch (e) {
    report.add('创建个人标签', false, String(e?.message ?? e).slice(0, 120));
  }

  try {
    tagUrgent = await invoke('tag_create', {
      name: 'E2E紧急标签',
      color: '#ef4444',
    });
    report.add('创建紧急标签', !!tagUrgent?.id, `name="${tagUrgent?.name}" color=${tagUrgent?.color}`);
    if (tagUrgent) createdTagIds.push(tagUrgent.id);
  } catch (e) {
    report.add('创建紧急标签', false, String(e?.message ?? e).slice(0, 120));
  }

  // ===================================================================
  //  10. 将标签关联到任务
  // ===================================================================
  if (tagWork && weeklyTask) {
    try {
      await invoke('task_tag_set', {
        taskId: weeklyTask.id,
        tagIds: [tagWork.id],
      });
      const tagsOnWeekly = await invoke('task_tag_list', { taskId: weeklyTask.id });
      report.add('工作标签关联每周任务',
        tagsOnWeekly.some(t => t.id === tagWork.id),
        `tags=${tagsOnWeekly.map(t => t.name).join(', ')}`);
    } catch (e) {
      report.add('标签关联任务', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // 关联多个标签到同一任务
  if (tagWork && tagPersonal && monthlyTask) {
    try {
      await invoke('task_tag_set', {
        taskId: monthlyTask.id,
        tagIds: [tagWork.id, tagPersonal.id],
      });
      const tagsOnMonthly = await invoke('task_tag_list', { taskId: monthlyTask.id });
      report.add('多标签关联每月任务',
        tagsOnMonthly.some(t => t.id === tagWork.id) && tagsOnMonthly.some(t => t.id === tagPersonal.id),
        `tags=${tagsOnMonthly.map(t => t.name).join(', ')}`);
    } catch (e) {
      report.add('多标签关联', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  await shot(page, 'task-recurrence-05-tags-assigned');

  // ===================================================================
  //  11. 更新标签名称和颜色
  // ===================================================================
  if (tagWork) {
    try {
      const updatedTag = await invoke('tag_update', {
        id: tagWork.id,
        name: 'E2E工作标签-已更新',
        color: '#6366f1',
      });
      report.add('更新标签名称',
        updatedTag.name === 'E2E工作标签-已更新',
        `name="${updatedTag.name}"`);
      report.add('更新标签颜色',
        updatedTag.color === '#6366f1',
        `color=${updatedTag.color}`);
    } catch (e) {
      report.add('更新标签', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // 验证更新后的标签在任务上可见
  if (tagWork && weeklyTask) {
    try {
      const tagsAfterUpdate = await invoke('task_tag_list', { taskId: weeklyTask.id });
      const found = tagsAfterUpdate.find(t => t.id === tagWork.id);
      report.add('标签更新后关联可见',
        found?.name === 'E2E工作标签-已更新' && found?.color === '#6366f1',
        `name="${found?.name}" color=${found?.color}`);
    } catch (e) {
      report.add('验证标签更新传播', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // ===================================================================
  //  12. 测试所有优先级级别：low / medium / high
  // ===================================================================

  // dailyTask 已经是 high，验证一下
  if (dailyTask) {
    try {
      const detail = await invoke('task_get', { id: dailyTask.id });
      report.add('每日任务优先级为 high', detail.priority === 'high', `priority=${detail.priority}`);
    } catch (e) {
      report.add('验证 high 优先级', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // weeklyTask 已经是 medium
  if (weeklyTask) {
    try {
      const detail = await invoke('task_get', { id: weeklyTask.id });
      report.add('每周任务优先级为 medium', detail.priority === 'medium', `priority=${detail.priority}`);
    } catch (e) {
      report.add('验证 medium 优先级', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // monthlyTask 已经是 low
  if (monthlyTask) {
    try {
      const detail = await invoke('task_get', { id: monthlyTask.id });
      report.add('每月任务优先级为 low', detail.priority === 'low', `priority=${detail.priority}`);
    } catch (e) {
      report.add('验证 low 优先级', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // 修改每日任务优先级为 medium，再改为 low，验证优先级变更
  if (dailyTask) {
    try {
      let updated = await invoke('task_update', {
        id: dailyTask.id,
        priority: 'medium',
      });
      report.add('修改优先级 high → medium', updated.priority === 'medium',
        `priority=${updated.priority}`);

      updated = await invoke('task_update', {
        id: dailyTask.id,
        priority: 'low',
      });
      report.add('修改优先级 medium → low', updated.priority === 'low',
        `priority=${updated.priority}`);
    } catch (e) {
      report.add('修改任务优先级', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  await shot(page, 'task-recurrence-06-priorities-tested');

  // ===================================================================
  //  13. 测试任务状态变更
  // ===================================================================
  if (weeklyTask) {
    try {
      let updated = await invoke('task_update', {
        id: weeklyTask.id,
        status: 'in_progress',
      });
      report.add('每周任务状态 → in_progress', updated.status === 'in_progress',
        `status=${updated.status}`);

      updated = await invoke('task_update', {
        id: weeklyTask.id,
        status: 'done',
      });
      report.add('每周任务状态 → done', updated.status === 'done',
        `status=${updated.status}`);

      updated = await invoke('task_update', {
        id: weeklyTask.id,
        status: 'todo',
      });
      report.add('每周任务状态 → todo（恢复）', updated.status === 'todo',
        `status=${updated.status}`);
    } catch (e) {
      report.add('测试状态流转', false, String(e?.message ?? e).slice(0, 120));
    }
  }

  // ===================================================================
  //  14. 创建带 end_date 的有限重复任务
  // ===================================================================
  let limitedRecurTask;
  try {
    limitedRecurTask = await invoke('task_create', {
      title: 'E2E 有限重复-每周打卡（3次）',
      description: '每周打卡，重复 3 次后结束',
      priority: 'medium',
      dueDate: today,
      recurrenceRule: { frequency: 'weekly', interval: 1, end_date: nextWeek },
      recurrenceNext: nextWeek,
    });
    report.add('创建有限重复任务', !!limitedRecurTask?.id,
      `title="${limitedRecurTask?.title}"`);
    if (limitedRecurTask) createdTaskIds.push(limitedRecurTask.id);
  } catch (e) {
    report.add('创建有限重复任务', false, String(e?.message ?? e).slice(0, 120));
  }

  if (limitedRecurTask) {
    const limitedRule = limitedRecurTask.recurrence_rule;
    report.add('有限重复含 end_date',
      limitedRule?.end_date === nextWeek,
      `end_date=${limitedRule?.end_date}`);
  }

  // ===================================================================
  //  15. 通过 UI 刷新任务页
  // ===================================================================
  await page.locator('a[href="/dashboard"]').first().click();
  await page.waitForTimeout(800);
  await page.locator('a[href="/tasks"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'task-recurrence-07-tasks-refreshed');

  // 验证所有 E2E 测试任务仍在列表中
  const refreshedTasks = await invoke('task_list_all');
  const allCreatedFound = createdTaskIds.every(id =>
    refreshedTasks.some(t => t.id === id)
  );
  report.add('刷新后所有测试任务可见', allCreatedFound,
    `created=${createdTaskIds.length} total=${refreshedTasks.length}`);
  report.add('任务计数正确增长',
    refreshedTasks.length === initialTaskCount + createdTaskIds.length,
    `${initialTaskCount} → ${refreshedTasks.length} (added ${createdTaskIds.length})`);

  // ===================================================================
  //  16. 验证标签列表
  // ===================================================================
  try {
    const allTags = await invoke('tag_list_all');
    const e2eTags = allTags.filter(t => createdTagIds.includes(t.id));
    report.add('标签列表含测试标签',
      e2eTags.length === createdTagIds.length,
      `expected=${createdTagIds.length} found=${e2eTags.length}`);
  } catch (e) {
    report.add('标签列表验证', false, String(e?.message ?? e).slice(0, 120));
  }

  // ===================================================================
  //  17. 清理所有测试数据
  // ===================================================================
  let cleaned = 0;

  // 先清理任务（按逆序，确保关联关系先解除）
  for (const taskId of createdTaskIds) {
    try {
      await invoke('task_delete', { id: taskId });
      cleaned++;
    } catch (e) {
      report.add(`清理任务 ${taskId.slice(0, 8)}`, false, String(e?.message ?? e).slice(0, 80));
    }
  }

  // 再清理标签
  for (const tagId of createdTagIds) {
    try {
      await invoke('tag_delete', { id: tagId });
      cleaned++;
    } catch (e) {
      report.add(`清理标签 ${tagId.slice(0, 8)}`, false, String(e?.message ?? e).slice(0, 80));
    }
  }

  // 验证清理结果
  const finalTasks = await invoke('task_list_all');
  const e2eTaskRemains = finalTasks.filter(t => (t.title ?? '').includes('E2E'));
  report.add('测试任务全部清理',
    e2eTaskRemains.length === 0,
    `remains=${e2eTaskRemains.length}`);
  report.add('任务计数恢复',
    finalTasks.length <= initialTaskCount,
    `${initialTaskCount} → ${finalTasks.length}`);

  const finalTags = await invoke('tag_list_all');
  const e2eTagRemains = finalTags.filter(t => (t.name ?? '').includes('E2E'));
  report.add('测试标签全部清理',
    e2eTagRemains.length === 0,
    `remains=${e2eTagRemains.length}`);
  report.add('标签计数恢复',
    finalTags.length <= initialTagCount,
    `${initialTagCount} → ${finalTags.length}`);
  report.add('清理统计', true, `cleaned=${cleaned} (tasks=${createdTaskIds.length} tags=${createdTagIds.length})`);

  await shot(page, 'task-recurrence-08-cleaned');

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'task-recurrence-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/task-recurrence-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
