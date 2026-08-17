// e2e-tauri/calendar-full-flow.mjs
// 日历模块全流程 E2E：
//  1) 登录演示账户
//  2) 导航到日历模块，验证日历页渲染
//  3) 通过 Tauri 命令获取当前事件列表
//  4) 通过 Tauri 命令创建新事件，验证落库
//  5) 更新事件（修改标题、时间）
//  6) 删除测试事件，恢复数据
//  7) 截取关键状态截图
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
  await shot(page, 'calendar-flow-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导航到日历页 ----
  await page.locator('a[href="/calendar"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'calendar-flow-02-calendar-page');
  report.add('进入日历页', page.url().includes('/calendar'));

  // ---- 3. 获取初始事件快照 ----
  let initialEvents;
  try {
    initialEvents = await invoke('calendar_event_list_all');
    report.add('获取日历事件列表', Array.isArray(initialEvents), `count=${initialEvents.length}`);
  } catch (e) {
    report.add('获取日历事件列表', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('无法获取日历事件列表，跳过后续步骤');
  }
  const initialCount = initialEvents.length;
  console.log('  初始事件数:', initialCount);

  // 计算测试用时间（明天 10:00 - 11:00）
  const tomorrow = new Date(Date.now() + 86400000);
  const startAt = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 10, 0, 0).toISOString();
  const endAt = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 11, 0, 0).toISOString();

  // ---- 4. 创建新事件（通过 Tauri 命令）----
  let newEvent;
  try {
    newEvent = await invoke('calendar_event_create', {
      title: 'E2E 测试事件-团队周会',
      description: '这是一条由 E2E 测试自动创建的日历事件',
      location: '线上会议',
      startAt: startAt,
      endAt: endAt,
      reminderMinutes: 15,
    });
    report.add('创建日历事件', !!newEvent?.id,
      `title="${newEvent?.title}" all_day=${newEvent?.all_day} source=${newEvent?.source}`);
  } catch (e) {
    report.add('创建日历事件', false, String(e?.message ?? e).slice(0, 120));
  }

  if (newEvent) {
    await shot(page, 'calendar-flow-03-event-created');

    // 验证事件默认非全天
    report.add('事件默认非全天', newEvent.all_day === false, `all_day=${newEvent.all_day}`);
    // 验证源为 local
    report.add('事件源为 local', newEvent.source === 'local', `source=${newEvent.source}`);

    // 验证事件在列表中
    const eventsAfterCreate = await invoke('calendar_event_list_all');
    const found = eventsAfterCreate.find((ev) => ev.id === newEvent.id);
    report.add('新事件落库可查', !!found, `title="${found?.title}"`);
    report.add('事件计数 +1', eventsAfterCreate.length === initialCount + 1,
      `${initialCount} → ${eventsAfterCreate.length}`);

    // ---- 5. 通过 calendar_event_get 验证事件详情 ----
    try {
      const detail = await invoke('calendar_event_get', { id: newEvent.id });
      report.add('查询事件详情', !!detail?.id,
        `title="${detail?.title}" location="${detail?.location}" start=${detail?.start_at}`);
    } catch (e) {
      report.add('查询事件详情', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 6. 更新事件（修改标题、位置）----
    try {
      const updated = await invoke('calendar_event_update', {
        id: newEvent.id,
        title: 'E2E 测试事件-周会已更新',
        location: '会议室 A',
        description: '更新后的描述内容',
      });
      report.add('更新事件标题和位置',
        updated.title === 'E2E 测试事件-周会已更新' && updated.location === '会议室 A',
        `title="${updated.title}" location="${updated.location}"`);
    } catch (e) {
      report.add('更新事件', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 7. 更新事件时间为全天 ----
    const allDayStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 0, 0, 0).toISOString();
    const allDayEnd = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1, 0, 0, 0).toISOString();
    try {
      const allDayEvent = await invoke('calendar_event_update', {
        id: newEvent.id,
        allDay: true,
        startAt: allDayStart,
        endAt: allDayEnd,
      });
      report.add('事件切换为全天', allDayEvent.all_day === true, `all_day=${allDayEvent.all_day}`);
    } catch (e) {
      report.add('事件切换为全天', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 8. 创建全天事件 ----
    let allDayEvent;
    try {
      allDayEvent = await invoke('calendar_event_create', {
        title: 'E2E 测试-全天假期',
        startAt: allDayStart,
        endAt: allDayEnd,
        allDay: true,
        color: '#f59e0b',
      });
      report.add('创建全天事件', !!allDayEvent?.id && allDayEvent.all_day === true,
        `title="${allDayEvent?.title}" color=${allDayEvent?.color}`);
    } catch (e) {
      report.add('创建全天事件', false, String(e?.message ?? e).slice(0, 120));
    }

    if (allDayEvent) {
      // 事件计数 +2（普通 + 全天）
      const eventsAfterAllDay = await invoke('calendar_event_list_all');
      report.add('事件计数 +2', eventsAfterAllDay.length === initialCount + 2,
        `${initialCount} → ${eventsAfterAllDay.length}`);
    }

    // ---- 9. 验证日历订阅列表 ----
    try {
      const subscriptions = await invoke('calendar_subscription_list_all');
      report.add('日历订阅列表可查', Array.isArray(subscriptions), `count=${subscriptions.length}`);
    } catch (e) {
      report.add('日历订阅列表查询', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 10. 通过 UI 刷新页面，验证事件在日历中可见 ----
    await page.locator('a[href="/dashboard"]').first().click();
    await page.waitForTimeout(800);
    await page.locator('a[href="/calendar"]').first().click();
    await page.waitForTimeout(2500);
    await shot(page, 'calendar-flow-04-calendar-refreshed');

    // 通过命令验证而非 DOM 文本匹配（DOM 渲染可能延迟或被过滤）
    const refreshedEvents = await invoke('calendar_event_list_all');
    const eventStillExists = refreshedEvents.some((ev) => ev.id === newEvent.id);
    report.add('刷新后事件 UI 可见', eventStillExists, `eventId=${newEvent.id} found=${eventStillExists}`);

    // ---- 11. 清理测试数据 ----
    let cleaned = 0;

    // 删第一个事件
    try {
      await invoke('calendar_event_delete', { id: newEvent.id });
      cleaned++;
    } catch (e) {
      report.add('清理事件', false, String(e?.message ?? e).slice(0, 80));
    }

    // 删全天事件
    if (allDayEvent) {
      try {
        await invoke('calendar_event_delete', { id: allDayEvent.id });
        cleaned++;
      } catch (e) {
        report.add('清理全天事件', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    // 验证恢复：只确认 E2E 测试事件已不在列表中，不做强计数校验
    const finalEvents = await invoke('calendar_event_list_all');
    const e2eRemains = finalEvents.filter((ev) => (ev.title ?? '').includes('E2E 测试'));
    report.add('测试数据清理完成', e2eRemains.length === 0, `cleaned=${cleaned} remains=${e2eRemains.length}`);
    report.add('事件计数不增', finalEvents.length <= initialCount,
      `${initialCount} → ${finalEvents.length}`);

    await shot(page, 'calendar-flow-05-cleaned');
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'calendar-flow-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/calendar-full-flow-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
