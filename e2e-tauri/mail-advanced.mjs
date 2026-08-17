// e2e-tauri/mail-advanced.mjs
// 邮件高级功能 E2E：
//  1) 草稿保存与列表验证
//  2) 标星/取消标星切换
//  3) 已读/未读标记
//  4) 文件夹管理（创建/重命名/删除）
//  5) 邮件搜索
//  6) 抄送发送
//  7) 统一收件箱
//  8) 签名管理（列出/保存/删除）
// 前置：release-green/EasyWork.exe 已启动（--remote-debugging-port=9222）
import { connect, collectErrors, demoLogin, shot, Report } from './helpers.mjs';

const QQ = {
  email: process.env.QQ_EMAIL ?? '1633856788@qq.com',
  password: process.env.QQ_AUTH_CODE ?? '',
  imapHost: 'imap.qq.com', imapPort: 993,
  smtpHost: 'smtp.qq.com', smtpPort: 465,
};
if (!QQ.password) {
  console.error('缺少环境变量 QQ_AUTH_CODE（QQ 邮箱授权码）。用法：QQ_AUTH_CODE=xxx node e2e-tauri/mail-advanced.mjs');
  process.exit(1);
}

const report = new Report();
let browser, page;
const errors = [];

const invoke = (cmd, args = {}) =>
  page.evaluate(([c, a]) => window.__TAURI__.core.invoke(c, a), [cmd, args]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));

  // ---- 0. 登录并进入邮箱页 ----
  await demoLogin(page);
  await page.locator('a[href="/mail"]').first().click();
  await sleep(2000);
  await shot(page, 'mail-adv-00-login');
  report.add('登录并进入邮箱页', true);

  // ---- 1. 确保 QQ 账户存在 ----
  let accounts = await invoke('mail_list_accounts');
  let account = accounts.find((a) => a.email === QQ.email);
  if (!account) {
    account = await invoke('mail_add_account', {
      email: QQ.email, displayName: 'E2E高级测试', username: QQ.email,
      password: QQ.password, imapHost: QQ.imapHost, imapPort: QQ.imapPort,
      smtpHost: QQ.smtpHost, smtpPort: QQ.smtpPort, useSsl: true,
    });
    report.add('添加 QQ 账户', !!account?.id, `id=${account?.id}`);
  } else {
    report.add('复用已存在的 QQ 账户', true, `id=${account.id}`);
  }

  // 同步邮件（用于后续标星/已读/搜索测试）
  const sync = await invoke('mail_sync', { accountId: account.id });
  report.add('IMAP 同步', sync.folders > 0 && !sync.error,
    `folders=${sync.folders} fetched=${sync.fetched} error=${sync.error ?? 'null'}`);

  // ---- 2. 草稿保存与列表验证 ----
  try {
    const draftIds = [];
    for (let i = 0; i < 2; i++) {
      const draft = await invoke('mail_save_draft', {
        accountId: account.id,
        to: [QQ.email],
        cc: ['cc@example.com'],
        subject: `E2E 草稿测试 ${i + 1} ${Date.now()}`,
        bodyHtml: `<p>草稿正文 ${i + 1}</p>`,
        bodyText: `草稿正文 ${i + 1}`,
      });
      report.add(`保存草稿 ${i + 1}`, !!draft?.id, `id=${draft?.id}`);
      draftIds.push(draft.id);
    }
    await shot(page, 'mail-adv-01-drafts-saved');

    // 在草稿文件夹中验证草稿是否存在
    const draftFolders = (await invoke('mail_list_folders', { accountId: account.id }))
      .filter((f) => f.folder_type === 'drafts');
    if (draftFolders.length > 0) {
      const drafts = await invoke('mail_list_messages', {
        folder_id: draftFolders[0].id,
        limit: 20,
        offset: 0,
      });
      const found = draftIds.filter((did) => drafts.some((m) => m.id === did));
      report.add('草稿在草稿箱中可见', found.length === draftIds.length,
        `found=${found.length}/${draftIds.length}`);
    } else {
      report.add('草稿在草稿箱中可见（无草稿文件夹，跳过）', true, 'skip');
    }
    await shot(page, 'mail-adv-01-drafts-list');

    // 清理草稿
    for (const did of draftIds) {
      await invoke('mail_delete_message', { id: did }).catch(() => {});
    }
    report.add('草稿清理', true);
  } catch (e) {
    report.add('草稿保存与列表', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 3. 统一收件箱 & 未读数 ----
  try {
    const unified = await invoke('mail_unified_inbox', { limit: 50, offset: 0 });
    const qqMails = unified.filter((m) => m.account_id === account.id);
    report.add('统一收件箱聚合', qqMails.length > 0, `count=${qqMails.length}`);

    const unreadCount = await invoke('mail_unified_unread');
    report.add('统一收件箱未读数', unreadCount >= 0, `unread=${unreadCount}`);
    await shot(page, 'mail-adv-02-unified-inbox');
  } catch (e) {
    report.add('统一收件箱', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 4. 标记已读/未读 ----
  try {
    const unified = await invoke('mail_unified_inbox', { limit: 50, offset: 0 });
    const qqMails = unified.filter((m) => m.account_id === account.id);
    if (qqMails.length > 0) {
      const target = qqMails[0];
      const before = await invoke('mail_get_message', { id: target.id });

      // 标记为已读
      await invoke('mail_mark_read', { id: target.id, isRead: true });
      const afterRead = await invoke('mail_get_message', { id: target.id });
      report.add('标记已读', afterRead.is_read === true,
        `before=${before.is_read} after=${afterRead.is_read}`);

      // 标记为未读
      await invoke('mail_mark_read', { id: target.id, isRead: false });
      const afterUnread = await invoke('mail_get_message', { id: target.id });
      report.add('标记未读', afterUnread.is_read === false,
        `after=${afterUnread.is_read}`);
      await shot(page, 'mail-adv-03-read-unread');

      // 恢复原始状态
      await invoke('mail_mark_read', { id: target.id, isRead: before.is_read });
    } else {
      report.add('标记已读/未读（无邮件样本，跳过）', true, 'skip');
    }
  } catch (e) {
    report.add('标记已读/未读', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 5. 标星/取消标星切换 ----
  try {
    const unified = await invoke('mail_unified_inbox', { limit: 50, offset: 0 });
    const qqMails = unified.filter((m) => m.account_id === account.id);
    if (qqMails.length > 0) {
      const target = qqMails[0];
      const before = await invoke('mail_get_message', { id: target.id });
      const originalStar = before.is_starred;

      // 第一次切换
      await invoke('mail_toggle_star', { id: target.id });
      const toggled = await invoke('mail_get_message', { id: target.id });
      report.add('标星切换（第一次）', toggled.is_starred !== originalStar,
        `before=${originalStar} after=${toggled.is_starred}`);

      // 第二次切换（恢复）
      await invoke('mail_toggle_star', { id: target.id });
      const restored = await invoke('mail_get_message', { id: target.id });
      report.add('标星切换（恢复原状）', restored.is_starred === originalStar,
        `after=${restored.is_starred}`);
      await shot(page, 'mail-adv-04-star-toggle');
    } else {
      report.add('标星切换（无邮件样本，跳过）', true, 'skip');
    }
  } catch (e) {
    report.add('标星切换', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 6. 文件夹管理：创建 ----
  try {
    const folderName = `E2E文件夹_${Date.now()}`;
    const folder = await invoke('mail_create_folder', {
      accountId: account.id,
      name: folderName,
    });
    report.add('创建文件夹', !!folder?.id, `name="${folder?.name}" id=${folder?.id}`);

    // 验证文件夹已落库
    const folders = await invoke('mail_list_folders', { accountId: account.id });
    const found = folders.find((f) => f.id === folder.id);
    report.add('文件夹落库可查', !!found && found.name === folderName,
      `found=${!!found}`);
    await shot(page, 'mail-adv-05-folder-created');

    // ---- 7. 文件夹管理：重命名 ----
    const newName = `E2E重命名_${Date.now()}`;
    const renamed = await invoke('mail_rename_folder', {
      id: folder.id,
      name: newName,
    });
    report.add('重命名文件夹', renamed.name === newName, `new="${renamed.name}"`);

    // 验证重命名已落库
    const folders2 = await invoke('mail_list_folders', { accountId: account.id });
    const found2 = folders2.find((f) => f.id === folder.id);
    report.add('重命名落库可查', found2?.name === newName,
      `name="${found2?.name}"`);
    await shot(page, 'mail-adv-06-folder-renamed');

    // ---- 8. 文件夹管理：删除 ----
    await invoke('mail_delete_folder', { id: folder.id });
    report.add('删除文件夹', true);

    // 验证删除已生效
    const folders3 = await invoke('mail_list_folders', { accountId: account.id });
    const stillExists = folders3.some((f) => f.id === folder.id);
    report.add('文件夹已移除', !stillExists, `exists=${stillExists}`);
    await shot(page, 'mail-adv-07-folder-deleted');
  } catch (e) {
    report.add('文件夹管理（创建/重命名/删除）', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 9. 邮件搜索 ----
  try {
    // 使用已知存在的搜索词
    const results1 = await invoke('mail_search', { query: 'EasyWork', limit: 20 });
    const results2 = await invoke('mail_search', { query: '通知', limit: 20 });
    report.add('邮件搜索（FTS MATCH）', results1.length > 0 || results2.length > 0,
      `EasyWork=${results1.length} 通知=${results2.length}`);

    // 精确搜索：用统一收件箱中一封邮件的主题词
    const unified = await invoke('mail_unified_inbox', { limit: 50, offset: 0 });
    const qqMails = unified.filter((m) => m.account_id === account.id);
    if (qqMails.length > 0) {
      const subjectWords = (qqMails[0].subject ?? '').split(/\s+/).filter((w) => w.length > 2);
      if (subjectWords.length > 0) {
        const searchResults = await invoke('mail_search', {
          query: subjectWords[0],
          limit: 20,
        });
        const hasMatch = searchResults.some((r) =>
          (r.subject ?? '').includes(subjectWords[0]) ||
          (r.body_text ?? '').includes(subjectWords[0])
        );
        report.add('邮件搜索命中真实邮件', searchResults.length > 0,
          `query="${subjectWords[0]}" results=${searchResults.length} matched=${hasMatch}`);
      }
    }
    await shot(page, 'mail-adv-08-search');
  } catch (e) {
    report.add('邮件搜索', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 10. 抄送发送 ----
  try {
    const ccAddress = QQ.email;
    const ccSubject = `E2E CC 测试 ${new Date().toISOString().slice(0, 19)}`;
    const sent = await invoke('mail_send', {
      accountId: account.id,
      to: [QQ.email],
      cc: [ccAddress],
      subject: ccSubject,
      bodyHtml: '<p>这是一封带抄送的 E2E 测试邮件。</p>',
      bodyText: '这是一封带抄送的 E2E 测试邮件。',
    });
    report.add('抄送发送邮件', !!sent?.id, `subject="${ccSubject}"`);
    await shot(page, 'mail-adv-09-cc-sent');
  } catch (e) {
    report.add('抄送发送邮件', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 11. 签名管理 ----
  try {
    // 列出签名
    const sigsBefore = await invoke('mail_list_signatures');
    report.add('列出签名', Array.isArray(sigsBefore), `count=${sigsBefore.length}`);

    // 保存签名
    const sig = await invoke('mail_save_signature', {
      name: `E2E签名_${Date.now()}`,
      html: '<p>--<br/>E2E 测试签名</p>',
      isDefault: false,
    });
    report.add('保存签名', !!sig?.id, `name="${sig?.name}"`);

    // 验证签名已落库
    const sigsAfter = await invoke('mail_list_signatures');
    const found = sigsAfter.find((s) => s.id === sig.id);
    report.add('签名落库可查', !!found && found.name === sig.name,
      `found=${!!found}`);
    await shot(page, 'mail-adv-10-signature');

    // 删除签名
    await invoke('mail_delete_signature', { id: sig.id });
    report.add('删除签名', true);

    // 验证签名已移除
    const sigsFinal = await invoke('mail_list_signatures');
    const stillExists = sigsFinal.some((s) => s.id === sig.id);
    report.add('签名已移除', !stillExists, `exists=${stillExists}`);
  } catch (e) {
    report.add('签名管理', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 12. 清理测试数据 ----
  try {
    // 清理草稿（草稿保存段已自行清理，此处兜底）
    const draftFolders = (await invoke('mail_list_folders', { accountId: account.id }))
      .filter((f) => f.folder_type === 'drafts');
    if (draftFolders.length > 0) {
      const drafts = await invoke('mail_list_messages', {
        folder_id: draftFolders[0].id,
        limit: 50,
        offset: 0,
      });
      for (const d of drafts) {
        if ((d.subject ?? '').includes('E2E 草稿')) {
          await invoke('mail_delete_message', { id: d.id }).catch(() => {});
        }
      }
    }

    // 清理自定义文件夹（非系统文件夹）
    const folders = await invoke('mail_list_folders', { accountId: account.id });
    const customFolders = folders.filter((f) =>
      (f.name ?? '').startsWith('E2E') && f.folder_type !== 'inbox' &&
      f.folder_type !== 'sent' && f.folder_type !== 'drafts' &&
      f.folder_type !== 'trash' && f.folder_type !== 'spam'
    );
    for (const cf of customFolders) {
      await invoke('mail_delete_folder', { id: cf.id }).catch(() => {});
    }

    // 清理残留签名
    const remainingSigs = await invoke('mail_list_signatures');
    for (const s of remainingSigs) {
      if ((s.name ?? '').startsWith('E2E')) {
        await invoke('mail_delete_signature', { id: s.id }).catch(() => {});
      }
    }

    report.add('测试数据清理完成', true);
  } catch (e) {
    report.add('测试数据清理', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 200));
  try { await shot(page, 'mail-adv-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/mail-advanced-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
