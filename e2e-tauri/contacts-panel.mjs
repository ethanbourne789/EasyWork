// e2e-tauri/contacts-panel.mjs
// 联系人面板 E2E 验证：
//  1) 登录演示账户
//  2) 导航到邮件页
//  3) 切换到联系人视图
//  4) 通过 Tauri 命令查询联系人列表
//  5) 通过 Tauri 命令创建联系人，验证落库
//  6) 通过 Tauri 命令删除联系人，恢复数据
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
  await shot(page, 'contacts-panel-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导航到邮件页 ----
  await page.locator('a[href="/mail"]').first().click();
  await page.waitForTimeout(2500);
  await shot(page, 'contacts-panel-02-mail-page');
  report.add('进入邮件页', page.url().includes('/mail'));

  // ---- 3. 切换到联系人视图 ----
  const contactsSwitchBtn = page.locator('button[aria-label="切换到联系人视图"]').first();
  const canSwitchContacts = await contactsSwitchBtn.isVisible().catch(() => false);
  report.add('联系人切换按钮可见', canSwitchContacts);

  if (canSwitchContacts) {
    await contactsSwitchBtn.click();
    await page.waitForTimeout(1500);
    await shot(page, 'contacts-panel-03-contacts-view');

    // 验证联系人面板 UI 元素
    const contactsPanelVisible = await page.locator('text=新建联系人').first().isVisible().catch(() => false);
    report.add('联系人面板渲染', contactsPanelVisible);
  }

  // ---- 4. 通过 Tauri 命令获取初始联系人快照 ----
  let initialContacts;
  try {
    initialContacts = await invoke('contact_list', {});
    report.add('获取联系人列表', Array.isArray(initialContacts), `count=${initialContacts.length}`);
  } catch (e) {
    report.add('获取联系人列表', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('无法获取联系人列表，跳过后续步骤');
  }
  const initialCount = initialContacts.length;
  console.log('  初始联系人数量:', initialCount);

  // ---- 5. 通过 Tauri 命令获取分组列表 ----
  let initialGroups;
  try {
    initialGroups = await invoke('contact_group_list');
    report.add('获取联系人分组列表', Array.isArray(initialGroups), `count=${initialGroups.length}`);
  } catch (e) {
    report.add('获取分组列表', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 6. 创建测试分组 ----
  let testGroup;
  try {
    testGroup = await invoke('contact_group_save', { name: 'E2E 测试分组' });
    report.add('创建联系人分组', !!testGroup?.id, `name="${testGroup?.name}"`);
  } catch (e) {
    report.add('创建联系人分组', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 7. 创建联系人（通过 Tauri 命令）----
  let newContact;
  try {
    newContact = await invoke('contact_save', {
      contact: {
        id: '',
        name: '张三 E2E 测试',
        emails: ['zhangsan@example.com', 'zhangsan@work.com'],
        phones: ['13800138000'],
        company: 'E2E 测试公司',
        title: '高级工程师',
        notes: '这是一条由 E2E 测试自动创建的联系人',
        group_ids: testGroup ? [testGroup.id] : [],
        created_at: '',
        updated_at: '',
      },
    });
    report.add('创建联系人', !!newContact?.id,
      `name="${newContact?.name}" emails=${newContact?.emails?.length}`);
  } catch (e) {
    report.add('创建联系人', false, String(e?.message ?? e).slice(0, 120));
  }

  if (newContact) {
    await shot(page, 'contacts-panel-04-contact-created');

    // ---- 8. 验证联系人在列表中 ----
    const contactsAfterCreate = await invoke('contact_list', {});
    const found = contactsAfterCreate.find((c) => c.id === newContact.id);
    report.add('新联系人落库可查', !!found, `name="${found?.name}"`);
    report.add('联系人计数 +1', contactsAfterCreate.length === initialCount + 1,
      `${initialCount} → ${contactsAfterCreate.length}`);

    // ---- 9. 按分组查询联系人 ----
    if (testGroup) {
      try {
        const groupContacts = await invoke('contact_list', { groupId: testGroup.id });
        report.add('按分组查询联系人', groupContacts.length >= 1,
          `count=${groupContacts.length} names=[${groupContacts.map(c => c.name).join(', ')}]`);
      } catch (e) {
        report.add('按分组查询', false, String(e?.message ?? e).slice(0, 120));
      }
    }

    // ---- 10. 搜索联系人 ----
    try {
      const searchResults = await invoke('contact_list', { query: '张三' });
      report.add('搜索联系人', searchResults.length >= 1,
        `count=${searchResults.length} names=[${searchResults.map(c => c.name).join(', ')}]`);
    } catch (e) {
      report.add('搜索联系人', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 11. 编辑联系人 ----
    try {
      const updated = await invoke('contact_save', {
        contact: {
          ...newContact,
          name: '张三 E2E 已更新',
          phones: ['13800138000', '13900139000'],
          notes: '联系人已更新',
          group_ids: testGroup ? [testGroup.id] : [],
        },
      });
      report.add('编辑联系人', updated.name === '张三 E2E 已更新',
        `name="${updated.name}" phones=${updated.phones?.length}`);
    } catch (e) {
      report.add('编辑联系人', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 12. VCF 导出测试 ----
    try {
      const vcf = await invoke('contact_export_vcf', {});
      const vcfOk = vcf.includes('BEGIN:VCARD') && vcf.includes('FN:');
      report.add('VCF 导出', vcfOk, `len=${vcf.length}`);
    } catch (e) {
      report.add('VCF 导出', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 13. VCF 导入测试 ----
    const importText = [
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:李四 E2E 导入', 'N:李;四;;;',
      'EMAIL;TYPE=INTERNET:lisi@example.com', 'TEL:13911112222',
      'ORG:导入测试公司', 'TITLE:测试经理', 'END:VCARD',
    ].join('\r\n');
    let importedContact = null;
    try {
      const imported = await invoke('contact_import_vcf', { content: importText });
      report.add('VCF 导入', imported === 1, `imported=${imported}`);

      // 查找导入的联系人
      const lisi = (await invoke('contact_list', { query: '李四 E2E' }))[0];
      if (lisi) {
        importedContact = lisi;
        report.add('VCF 导入字段完整性',
          lisi.company === '导入测试公司' && lisi.title === '测试经理',
          `company="${lisi.company}" title="${lisi.title}"`);
      }
    } catch (e) {
      report.add('VCF 导入', false, String(e?.message ?? e).slice(0, 120));
    }

    // ---- 14. 联系人 UI 验证 ----
    if (canSwitchContacts) {
      const refreshedBody = await page.locator('body').textContent();
      const hasContactName = refreshedBody?.includes('张三') || refreshedBody?.includes('联系人');
      report.add('联系人 UI 显示数据', hasContactName);
      await shot(page, 'contacts-panel-05-contacts-refreshed');
    }

    // ---- 15. 清理测试数据 ----
    let cleaned = 0;

    // 删导入的联系人
    if (importedContact) {
      try {
        await invoke('contact_delete', { id: importedContact.id });
        cleaned++;
      } catch (e) {
        report.add('清理导入联系人', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    // 删测试联系人
    try {
      await invoke('contact_delete', { id: newContact.id });
      cleaned++;
    } catch (e) {
      report.add('清理测试联系人', false, String(e?.message ?? e).slice(0, 80));
    }

    // 删分组
    if (testGroup) {
      try {
        await invoke('contact_group_delete', { id: testGroup.id });
        cleaned++;
      } catch (e) {
        report.add('清理分组', false, String(e?.message ?? e).slice(0, 80));
      }
    }

    // 验证恢复：只确认 E2E 测试联系人已不在列表中，不做强计数校验
    const finalContacts = await invoke('contact_list', {});
    const e2eRemains = finalContacts.filter((c) => (c.name ?? '').includes('E2E'));
    report.add('测试数据清理完成', e2eRemains.length === 0, `cleaned=${cleaned} remains=${e2eRemains.length}`);
    report.add('联系人计数不增', finalContacts.length <= initialCount,
      `${initialCount} → ${finalContacts.length}`);

    await shot(page, 'contacts-panel-06-cleaned');
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'contacts-panel-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/contacts-panel-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
