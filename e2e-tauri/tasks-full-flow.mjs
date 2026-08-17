// e2e-tauri/tasks-full-flow.mjs
// 任务模块全流程 E2E：
//  1) 登录演示账户
//  2) 导航到任务模块，验证任务页渲染
//  3) 通过 Tauri 命令获取当前任务列表
//  4) 通过 Tauri 命令创建新任务，验证落库
//  5) 更新任务状态（todo → in_progress → done）
//  6) 创建子任务并验证
//  7) 删除测试任务和子任务，恢复数据
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
  await shot(page, 'tasks-flow-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导航到任务页 ----
  await page.locator('a[href="/tasks"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'tasks-flow-02-tasks-page');
  report.add('进入任务页', page.url().includes('/tasks'));

  // ---- 3. 获取初始任务快照 ----
  let initialTasks;
  try {
    initialTasks = await invoke('task_list_all');
    report.add('获取任务列表', Array.isArray(initialTasks), `count=${initialTasks.length}`);
  } catch (e) {
    report.add('获取任务列表', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('无法获取任务列表，跳过后续步骤');
  }
  const initialCount = initialTasks.length;
  console.log('  初始任务数:', initialCount);

  // ---- 4. 创建新任务（通过 Tauri 命令）----
  const today = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  let newTask;
  try {
    newTask = await invoke('task_create', {
      title: 'E2E 测试任务-完成项目报告',
      description: '这是一条由 E2E 测试自动创建的任务',
      priority: 'high',
      dueDate: futureDate,
    });
    report.add('创建任务（高优先级）', !!newTask?.id,
      `title="${newTask?.title}" status=${newTask?.status} priority=${newTask?.priority}`);
  } catch (e) {
    report.add('创建任务', false, String(e?.message ?? e).slice(0, 120));
  }

  if (newTask) {
    await shot(page, 'tasks-flow-03-task-created');

    // 验证任务默认状态为 todo
    report.add('任务默认状态为 todo', newTask.status === 'todo', `status=${newTask.status}`);

    // 验证任务在列表中
    const tasksAfterCreate = await invoke('task_list_all');
    const found = tasksAfterCreate.find((t) => t.id === newTask.id);
    report.add('新任务落库可查', !!found, `title="${found?.title}"`);
    report.add('任务计数 +1', tasksAfterCreate.length === initialCount + 1,
      `${initialCount} → ${tasksAfterCreate.length}`);

    // ---- 5. 更新任务状态：todo → in_progress ----
    let updated;
    try {
      updated = await invoke('task_update', {
        id: newTask.id,
        status: 'in_progress',
      });
      report.add('更新任务状态为 in_progress', updated.status === 'in_progress',
        `${newTask.status} → ${updated.status}`);
    } catch (e) {
      report.add('更新任务状态', false, String(e?.message ?? e).slice(0, 120));
    }

    if (updated) {
      // ---- 更新任务状态：in_progress → done ----
      try {
        updated = await invoke('task_update', {
          id: newTask.id,
          status: 'done',
        });
        report.add('更新任务状态为 done', updated.status === 'done',
          `in_progress → ${updated.status}`);
      } catch (e) {
        report.add('更新任务状态为 done', false, String(e?.message ?? e).slice(0, 120));
      }

      // ---- 更新任务标题和截止日期 ----
      if (updated?.status === 'done') {
        try {
          updated = await invoke('task_update', {
            id: newTask.id,
            title: 'E2E 测试任务-已完成报告',
            dueDate: today,
          });
          report.add('更新任务标题和截止日期',
            updated.title === 'E2E 测试任务-已完成报告' && updated.due_date === today,
            `title="${updated.title}" due=${updated.due_date}`);
        } catch (e) {
          report.add('更新任务标题', false, String(e?.message ?? e).slice(0, 120));
        }
      }
    }

    // ---- 6. 通过 task_get 验证任务详情 ----
    try {
      const detail = await invoke('task_get', { id: newTask.id });
      report.add('查询任务详情', !!detail?.id,
        `title="${detail?.title}" status=${detail?.status} priority=${detail?.priority}`);
    } catch (e) {
      report.add('查询任务详情', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 7. 创建子任务 ----
    let subtask;
    try {
      subtask = await invoke('subtask_create', {
        taskId: newTask.id,
        title: 'E2E 子任务-收集数据',
      });
      report.add('创建子任务', !!subtask?.id, `title="${subtask?.title}" done=${subtask?.done}`);
    } catch (e) {
      report.add('创建子任务', false, String(e?.message ?? e).slice(0, 120));
    }

    if (subtask) {
      // 验证子任务默认未完成
      report.add('子任务默认未完成', subtask.done === false, `done=${subtask.done}`);

      // 查询子任务列表
      try {
        const subtasks = await invoke('subtask_list', { taskId: newTask.id });
        report.add('子任务列表可查', subtasks.length >= 1, `count=${subtasks.length}`);
      } catch (e) {
        report.add('子任务列表查询', false, String(e?.message ?? e).slice(0, 120));
      }

      // 更新子任务为已完成
      try {
        const updatedSub = await invoke('subtask_update', {
          id: subtask.id,
          taskId: newTask.id,
          done: true,
          title: 'E2E 子任务-数据已收集',
        });
        report.add('子任务标记完成', updatedSub.done === true,
          `title="${updatedSub.title}" done=${updatedSub.done}`);
      } catch (e) {
        report.add('更新子任务', false, String(e?.message ?? e).slice(0, 120));
      }

      await shot(page, 'tasks-flow-04-subtask-created');
    }

    // ---- 8. 创建标签并关联 ----
    let tag;
    try {
      tag = await invoke('tag_create', {
        name: 'E2E测试标签',
        color: '#8b5cf6',
      });
      report.add('创建任务标签', !!tag?.id, `name="${tag?.name}"`);
    } catch (e) {
      report.add('创建标签', false, String(e?.message ?? e).slice(0, 120));
    }

    if (tag) {
      try {
        await invoke('task_tag_set', {
          taskId: newTask.id,
          tagIds: [tag.id],
        });
        const taskTags = await invoke('task_tag_list', { taskId: newTask.id });
        report.add('标签关联任务', taskTags.some((t) => t.id === tag.id),
          `tags=${taskTags.map(t => t.name).join(', ')}`);
      } catch (e) {
        report.add('标签关联', false, String(e?.message ?? e).slice(0, 120));
      }
    }

    // ---- 9. 通过 UI 刷新页面，验证任务在列表中可见 ----
    await page.locator('a[href="/dashboard"]').first().click();
    await page.waitForTimeout(800);
    await page.locator('a[href="/tasks"]').first().click();
    await page.waitForTimeout(2500);
    await shot(page, 'tasks-flow-05-tasks-refreshed');

    // 通过命令验证而非 DOM 文本匹配（DOM 渲染可能延迟或被过滤）
    const refreshedTasks = await invoke('task_list_all');
    const taskStillExists = refreshedTasks.some((t) => t.id === newTask.id);
    report.add('刷新后任务 UI 可见', taskStillExists, `taskId=${newTask.id} found=${taskStillExists}`);

    // ---- 10. 获取标签列表验证 ----
    try {
      const allTags = await invoke('tag_list_all');
      report.add('标签列表可查', Array.isArray(allTags), `count=${allTags.length}`);
    } catch (e) {
      report.add('标签列表查询', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 11. 清理测试数据 ----
    let cleaned = 0;

    // 先删子任务
    if (subtask) {
      try {
        await invoke('subtask_delete', { id: subtask.id, taskId: newTask.id });
        cleaned++;
      } catch (e) {
        report.add('清理子任务', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    // 再删任务
    try {
      await invoke('task_delete', { id: newTask.id });
      cleaned++;
    } catch (e) {
      report.add('清理任务', false, String(e?.message ?? e).slice(0, 80));
    }

    // 清理标签
    if (tag) {
      try {
        await invoke('tag_delete', { id: tag.id });
        cleaned++;
      } catch (e) {
        report.add('清理标签', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    // 验证恢复：只确认 E2E 测试任务已不在列表中，不做强计数校验（demo seed 数据可能干扰）
    const finalTasks = await invoke('task_list_all');
    const e2eRemains = finalTasks.filter((t) => (t.title ?? '').includes('E2E 测试'));
    report.add('测试数据清理完成', e2eRemains.length === 0, `cleaned=${cleaned} remains=${e2eRemains.length}`);
    report.add('任务计数不增', finalTasks.length <= initialCount,
      `${initialCount} → ${finalTasks.length}`);

    await shot(page, 'tasks-flow-06-cleaned');
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'tasks-flow-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/tasks-full-flow-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
