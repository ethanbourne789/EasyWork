// e2e-tauri/contacts-groups.mjs
// 联系人分组管理 E2E 验证：
//  1) 登录演示账户
//  2) 导航到邮件页并切换到联系人视图
//  3) 获取初始分组列表（contact_group_list）
//  4) 创建测试分组（contact_group_save）
//  5) 创建联系人并关联到分组
//  6) 按分组筛选联系人（contact_list with group_id）
//  7) 删除分组（contact_group_delete）
//  8) 清理测试数据
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
  await shot(page, 'contacts-groups-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导航到邮件页 ----
  await page.locator('a[href="/mail"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'contacts-groups-02-mail-page');
  report.add('进入邮件页', page.url().includes('/mail'));

  // ---- 3. 切换到联系人视图 ----
  const contactsSwitchBtn = page.locator('button[aria-label="切换到联系人视图"]').first();
  const canSwitchContacts = await contactsSwitchBtn.isVisible().catch(() => false);
  report.add('联系人切换按钮可见', canSwitchContacts);

  if (canSwitchContacts) {
    await contactsSwitchBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, 'contacts-groups-03-contacts-view');
  }

  // ---- 4. 获取初始分组快照 ----
  let initialGroups;
  try {
    initialGroups = await invoke('contact_group_list');
    report.add('获取联系人分组列表', Array.isArray(initialGroups), `count=${initialGroups.length}`);
  } catch (e) {
    report.add('获取分组列表', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('无法获取分组列表，跳过后续步骤');
  }
  const initialGroupCount = initialGroups.length;
  console.log('  初始分组数量:', initialGroupCount);

  // ---- 5. 获取初始联系人快照 ----
  let initialContacts;
  try {
    initialContacts = await invoke('contact_list', {});
    report.add('获取联系人列表', Array.isArray(initialContacts), `count=${initialContacts.length}`);
  } catch (e) {
    report.add('获取联系人列表', false, String(e?.message ?? e).slice(0, 120));
  }
  const initialContactCount = initialContacts.length;

  // ---- 6. 创建第一个测试分组 ----
  let testGroup1;
  try {
    testGroup1 = await invoke('contact_group_save', { name: 'E2E 测试分组 A' });
    report.add('创建分组 A', !!testGroup1?.id, `name="${testGroup1?.name}"`);
  } catch (e) {
    report.add('创建分组 A', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 7. 创建第二个测试分组 ----
  let testGroup2;
  try {
    testGroup2 = await invoke('contact_group_save', { name: 'E2E 测试分组 B' });
    report.add('创建分组 B', !!testGroup2?.id, `name="${testGroup2?.name}"`);
  } catch (e) {
    report.add('创建分组 B', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 8. 验证分组计数 +2 ----
  if (testGroup1 && testGroup2) {
    const groupsAfterCreate = await invoke('contact_group_list');
    report.add('分组计数 +2', groupsAfterCreate.length === initialGroupCount + 2,
      `${initialGroupCount} → ${groupsAfterCreate.length}`);
    await shot(page, 'contacts-groups-04-groups-created');
  }

  // ---- 9. 创建联系人并关联到分组 A ----
  let contactA;
  try {
    contactA = await invoke('contact_save', {
      contact: {
        id: '',
        name: '林一 E2E 分组A',
        emails: ['liny@groupa.com'],
        phones: ['13700001111'],
        company: '分组 A 公司',
        title: '工程师',
        notes: '属于分组 A 的测试联系人',
        group_ids: testGroup1 ? [testGroup1.id] : [],
        created_at: '',
        updated_at: '',
      },
    });
    report.add('创建联系人（分组 A）', !!contactA?.id,
      `name="${contactA?.name}"`);
  } catch (e) {
    report.add('创建联系人（分组 A）', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 10. 创建联系人并关联到分组 B ----
  let contactB;
  try {
    contactB = await invoke('contact_save', {
      contact: {
        id: '',
        name: '王二 E2E 分组B',
        emails: ['wanger@groupb.com'],
        phones: ['13700002222'],
        company: '分组 B 公司',
        title: '产品经理',
        notes: '属于分组 B 的测试联系人',
        group_ids: testGroup2 ? [testGroup2.id] : [],
        created_at: '',
        updated_at: '',
      },
    });
    report.add('创建联系人（分组 B）', !!contactB?.id,
      `name="${contactB?.name}"`);
  } catch (e) {
    report.add('创建联系人（分组 B）', false, String(e?.message ?? e).slice(0, 120));
  }

  if (contactA && contactB) {
    await shot(page, 'contacts-groups-05-contacts-created');

    // ---- 11. 按分组 A 筛选联系人 ----
    try {
      const groupAContacts = await invoke('contact_list', { groupId: testGroup1.id });
      const hasLinYi = groupAContacts.some((c) => c.id === contactA.id);
      report.add('按分组 A 筛选', hasLinYi && groupAContacts.length >= 1,
        `count=${groupAContacts.length} names=[${groupAContacts.map(c => c.name).join(', ')}]`);
    } catch (e) {
      report.add('按分组 A 筛选', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 12. 按分组 B 筛选联系人 ----
    try {
      const groupBContacts = await invoke('contact_list', { groupId: testGroup2.id });
      const hasWangEr = groupBContacts.some((c) => c.id === contactB.id);
      report.add('按分组 B 筛选', hasWangEr && groupBContacts.length >= 1,
        `count=${groupBContacts.length} names=[${groupBContacts.map(c => c.name).join(', ')}]`);
    } catch (e) {
      report.add('按分组 B 筛选', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 13. 将联系人同时关联到两个分组 ----
    try {
      const multiGroupContact = await invoke('contact_save', {
        contact: {
          ...contactA,
          name: '林一 E2E 多分组',
          group_ids: [testGroup1.id, testGroup2.id],
        },
      });
      report.add('联系人关联多分组',
        Array.isArray(multiGroupContact.group_ids) && multiGroupContact.group_ids.length === 2,
        `groups=${multiGroupContact.group_ids.length}`);

      // 验证分组 A 中也能查到
      const gaAfter = await invoke('contact_list', { groupId: testGroup1.id });
      report.add('分组 A 包含多分组联系人', gaAfter.some((c) => c.id === contactA.id));

      // 验证分组 B 中也能查到
      const gbAfter = await invoke('contact_list', { groupId: testGroup2.id });
      report.add('分组 B 包含多分组联系人', gbAfter.some((c) => c.id === contactA.id));
    } catch (e) {
      report.add('联系人关联多分组', false, String(e?.message ?? e).slice(0, 120));
    }

    await shot(page, 'contacts-groups-06-group-filtering');

    // ---- 14. 更新分组名称 ----
    try {
      const updatedGroup = await invoke('contact_group_save', {
        id: testGroup1.id,
        name: 'E2E 分组 A-已重命名',
      });
      report.add('重命名分组', updatedGroup.name === 'E2E 分组 A-已重命名',
        `name="${updatedGroup.name}"`);
    } catch (e) {
      report.add('重命名分组', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 15. 删除分组 B ----
    if (testGroup2) {
      try {
        await invoke('contact_group_delete', { id: testGroup2.id });
        report.add('删除分组 B', true);

        // 验证分组 B 已不存在
        const groupsAfterDelete = await invoke('contact_group_list');
        const groupBGone = !groupsAfterDelete.some((g) => g.id === testGroup2.id);
        report.add('分组 B 已移除', groupBGone, `remaining=${groupsAfterDelete.length}`);
      } catch (e) {
        report.add('删除分组 B', false, String(e?.message ?? e).slice(0, 120));
      }
    }

    await shot(page, 'contacts-groups-07-group-deleted');

    // ---- 16. 清理测试数据 ----
    let cleaned = 0;

    // 删联系人（先解除分组关联再删）
    if (contactA) {
      try {
        await invoke('contact_delete', { id: contactA.id });
        cleaned++;
      } catch (e) {
        report.add('清理联系人 A', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    if (contactB) {
      try {
        await invoke('contact_delete', { id: contactB.id });
        cleaned++;
      } catch (e) {
        report.add('清理联系人 B', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    // 删分组 A（分组 B 已在上一步删除）
    if (testGroup1) {
      try {
        await invoke('contact_group_delete', { id: testGroup1.id });
        cleaned++;
      } catch (e) {
        report.add('清理分组 A', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    // 验证恢复：确认 E2E 测试数据已全部清理
    const finalContacts = await invoke('contact_list', {});
    const e2eRemains = finalContacts.filter((c) => (c.name ?? '').includes('E2E'));
    report.add('联系人清理完成', e2eRemains.length === 0, `remains=${e2eRemains.length}`);
    report.add('联系人计数不增', finalContacts.length <= initialContactCount,
      `${initialContactCount} → ${finalContacts.length}`);

    const finalGroups = await invoke('contact_group_list');
    const e2eGroupRemains = finalGroups.filter((g) => (g.name ?? '').includes('E2E'));
    report.add('分组清理完成', e2eGroupRemains.length === 0, `remains=${e2eGroupRemains.length}`);
    report.add('分组计数不增', finalGroups.length <= initialGroupCount,
      `${initialGroupCount} → ${finalGroups.length}`);

    await shot(page, 'contacts-groups-08-cleaned');
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'contacts-groups-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/contacts-groups-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
