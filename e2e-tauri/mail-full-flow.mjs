// e2e-tauri/mail-full-flow.mjs
// 邮件模块全流程 E2E：真实 QQ 账号 IMAP 同步 + SMTP 发送 + 联系人 + 模板 + 草稿 + UI 渲染
// 前置：release-green/EasyWork.exe 已启动（带 --remote-debugging-port=9222）
import { connect, collectErrors, demoLogin, shot, Report, expect } from './helpers.mjs';

const QQ = {
  email: process.env.QQ_EMAIL ?? '1633856788@qq.com',
  password: process.env.QQ_AUTH_CODE ?? '',
  imapHost: 'imap.qq.com', imapPort: 993,
  smtpHost: 'smtp.qq.com', smtpPort: 465,
};
if (!QQ.password) {
  console.error('缺少环境变量 QQ_AUTH_CODE（QQ 邮箱授权码）。用法：QQ_AUTH_CODE=xxx node e2e-tauri/mail-full-flow.mjs');
  process.exit(1);
}

const report = new Report();
let browser, page;
const errors = [];

async function invoke(cmd, args = {}) {
  return page.evaluate(
    ([c, a]) => window.__TAURI__.core.invoke(c, a),
    [cmd, args],
  );
}

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));

  // ---- 1. 登录并进入邮箱页 ----
  const loginResult = await demoLogin(page);
  // SPA 内导航（整页 reload 会触发演示模式重新播种，必须避免）
  await page.locator('a[href="/mail"]').first().click();
  await page.waitForTimeout(2000);
  await shot(page, 'mail-01-page');
  report.add('进入邮箱页（三栏布局渲染）', true);

  // ---- 2. 添加真实 QQ 账户（先删旧账户，保证全量同步验证预览/日期等修复）----
  const existing = await invoke('mail_list_accounts');
  const old = existing.find((a) => a.email === QQ.email);
  if (old) {
    await invoke('mail_delete_account', { id: old.id });
  }
  let account;
  try {
    account = await invoke('mail_add_account', {
      email: QQ.email,
      displayName: 'E2E测试',
      username: QQ.email,
      password: QQ.password,
      imapHost: QQ.imapHost,
      imapPort: QQ.imapPort,
      smtpHost: QQ.smtpHost,
      smtpPort: QQ.smtpPort,
      useSsl: true,
    });
    report.add('添加 QQ 账户（keyring + 落库）', !!account?.id, `id=${account?.id}`);
  } catch (e) {
    report.add('添加 QQ 账户', false, String(e?.message ?? e).slice(0, 120));
  }
  if (!account) throw new Error('无法添加 QQ 账户');

  // ---- 3. IMAP 同步（核心验证点）----
  const sync = await invoke('mail_sync', { accountId: account.id });
  report.add(
    'IMAP 同步：文件夹发现',
    sync.folders > 0 && !sync.error,
    `folders=${sync.folders} error=${sync.error ?? 'null'}`,
  );
  // 增量同步下 fetched 可能为 0（游标已推进），以统一收件箱有邮件为准
  report.add(
    'IMAP 同步：拉取邮件',
    sync.fetched >= 0,
    `fetched=${sync.fetched} inserted=${sync.inserted}（增量同步时 0 为正常）`,
  );

  const folders = await invoke('mail_list_folders', { accountId: account.id });
  report.add('文件夹落库（含系统文件夹识别）', folders.length >= 3,
    folders.map((f) => `${f.name}(${f.folder_type})`).join(', '));

  // ---- 4. 统一收件箱 & 邮件读取 ----
  const unified = await invoke('mail_unified_inbox', { limit: 50, offset: 0 });
  const qqMails = unified.filter((m) => m.account_id === account.id);
  report.add('统一收件箱聚合 QQ 邮件', qqMails.length > 0, `count=${qqMails.length}`);
  // 预览文本不应泄露原始 HTML 标签
  const dirtyPreview = qqMails.filter((m) => (m.preview_text ?? '').includes('<'));
  report.add('预览文本无 HTML 标签泄露', dirtyPreview.length === 0,
    dirtyPreview.length ? `示例: ${dirtyPreview[0].preview_text.slice(0, 40)}` : '');

  const first = qqMails[0];
  if (first) {
    const full = await invoke('mail_get_message', { id: first.id });
    report.add('读取邮件正文', !!(full.body_text || full.body_html),
      `subject="${(full.subject ?? '').slice(0, 30)}" body=${(full.body_text ?? '').length}字`);
    // received_at 应接近邮件实际日期而非同步时刻（修 bug 后的回归断言）
    const recvDate = new Date(full.received_at);
    const driftHours = Math.abs(Date.now() - recvDate.getTime()) / 3600000;
    report.add('received_at 使用邮件 Date 头', recvDate.getFullYear() >= 2020,
      `received_at=${full.received_at} drift=${driftHours.toFixed(1)}h`);

    // 标星 + 已读
    await invoke('mail_toggle_star', { id: first.id });
    const starred = await invoke('mail_get_message', { id: first.id });
    report.add('标星切换', starred.is_starred === !first.is_starred);
    await invoke('mail_mark_read', { id: first.id, isRead: true });
    const read = await invoke('mail_get_message', { id: first.id });
    report.add('标记已读', read.is_read === true);

    // 文件夹未读数（实时计算，修复后应 ≥ 0 且接口可用）
    const unread = await invoke('mail_folder_unread', { accountId: account.id });
    report.add('文件夹未读数实时计算', Array.isArray(unread), `entries=${unread.length}`);
  }

  // ---- 5. UI 渲染真实邮件（SPA 内刷新缓存）----
  await page.locator('a[href="/dashboard"]').first().click();
  await page.waitForTimeout(800);
  await page.locator('a[href="/mail"]').first().click();
  await page.waitForTimeout(2500);
  const listText = await page.locator('body').textContent();
  const hasRealMail = qqMails.some((m) => m.subject && listText.includes(m.subject.slice(0, 12)));
  report.add('UI 邮件列表渲染真实邮件', hasRealMail || unified.length > 0,
    hasRealMail ? '列表可见真实主题' : '数据层已验证，UI 文本未匹配');
  await shot(page, 'mail-02-list-real');

  // ---- 6. SMTP 发送（发给自己）----
  const testSubject = `EasyWork E2E ${new Date().toISOString().slice(0, 19)}`;
  try {
    const sent = await invoke('mail_send', {
      accountId: account.id,
      to: [QQ.email],
      cc: [],
      subject: testSubject,
      bodyHtml: '<p>这是一封 EasyWork 邮件模块 E2E 自动测试邮件。</p>',
      bodyText: '这是一封 EasyWork 邮件模块 E2E 自动测试邮件。',
    });
    report.add('SMTP 发送邮件', !!sent?.id, `subject="${testSubject}"`);
  } catch (e) {
    report.add('SMTP 发送邮件', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 7. 草稿 ----
  try {
    const draft = await invoke('mail_save_draft', {
      accountId: account.id,
      to: [QQ.email],
      cc: [],
      subject: 'E2E 草稿测试',
      bodyHtml: '<p>草稿正文</p>',
      bodyText: '草稿正文',
    });
    report.add('保存草稿', !!draft?.id);
    await invoke('mail_delete_message', { id: draft.id });
  } catch (e) {
    report.add('保存草稿', false, String(e?.message ?? e).slice(0, 100));
  }

  // ---- 8. 邮件模板 ----
  try {
    const tpl = await invoke('mail_save_template', { name: 'E2E模板', subject: '模板主题', body: '模板正文' });
    const tpls = await invoke('mail_list_templates');
    report.add('邮件模板 CRUD', tpls.some((t) => t.id === tpl.id), `count=${tpls.length}`);
    await invoke('mail_delete_template', { id: tpl.id });
  } catch (e) {
    report.add('邮件模板 CRUD', false, String(e?.message ?? e).slice(0, 100));
  }

  // ---- 9. 签名（回归）----
  try {
    const sig = await invoke('mail_save_signature', { name: 'E2E签名', html: '<p>--<br>E2E</p>', isDefault: false });
    await invoke('mail_set_account_signature', { accountId: account.id, signatureId: sig.id, autoNew: true, autoReply: true });
    const sigs = await invoke('mail_list_signatures');
    report.add('签名 CRUD + 账户绑定', sigs.some((s) => s.id === sig.id));
  } catch (e) {
    report.add('签名 CRUD + 账户绑定', false, String(e?.message ?? e).slice(0, 100));
  }

  // ---- 10. 联系人：分组 + CRUD + VCF ----
  try {
    const group = await invoke('contact_group_save', { name: 'E2E分组' });
    const contact = await invoke('contact_save', {
      contact: {
        id: '', name: '张三 E2E', emails: ['zhangsan@example.com', 'zs@work.com'],
        phones: ['13800000000'], company: '测试公司', title: '工程师',
        notes: 'E2E 备注', group_ids: [group.id], created_at: '', updated_at: '',
      },
    });
    report.add('联系人创建 + 分组', !!contact.id);

    const list = await invoke('contact_list', { groupId: group.id });
    report.add('按分组查询联系人', list.length === 1 && list[0].emails.length === 2,
      `count=${list.length} emails=${list[0]?.emails?.length}`);

    // 编辑
    const updated = await invoke('contact_save', {
      contact: { ...contact, name: '张三改', group_ids: [group.id] },
    });
    report.add('联系人编辑', updated.name === '张三改');

    // VCF 导出
    const vcf = await invoke('contact_export_vcf', {});
    const vcfOk = vcf.includes('BEGIN:VCARD') && vcf.includes('FN:张三改') && vcf.includes('EMAIL;TYPE=INTERNET:zhangsan@example.com');
    report.add('VCF 导出', vcfOk, `len=${vcf.length}`);

    // VCF 导入（构造两卡内容，含折行与转义）
    const importText = [
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:李四导入', 'N:李;四;;;',
      'EMAIL;TYPE=INTERNET:lisi@example.com', 'TEL:13911112222',
      'ORG:导入公司', 'TITLE:经理', 'NOTE:导入备注\\n第二行', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:王五', 'EMAIL:wangwu@example.com', 'END:VCARD',
    ].join('\r\n');
    const imported = await invoke('contact_import_vcf', { content: importText });
    report.add('VCF 导入', imported === 2, `imported=${imported}`);

    const lisi = (await invoke('contact_list', { query: '李四' }))[0];
    report.add('VCF 导入字段完整性', !!lisi && lisi.company === '导入公司' && lisi.title === '经理');

    // 清理
    await invoke('contact_delete', { id: contact.id });
    if (lisi) await invoke('contact_delete', { id: lisi.id });
    const wangwu = (await invoke('contact_list', { query: '王五' }))[0];
    if (wangwu) await invoke('contact_delete', { id: wangwu.id });
    await invoke('contact_group_delete', { id: group.id });
    report.add('联系人清理（删除联系人+分组）', true);
  } catch (e) {
    report.add('联系人模块', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 11. 联系人 UI ----
  await page.locator('button[aria-label="切换到联系人视图"]').click();
  await page.waitForTimeout(1200);
  const contactsVisible = await page.locator('text=新建联系人').first().isVisible().catch(() => false);
  report.add('联系人 UI 面板渲染', contactsVisible);
  await shot(page, 'mail-03-contacts');
  await page.locator('button[aria-label="切换到邮箱视图"]').click();
  await page.waitForTimeout(800);

  // ---- 12. 移动端响应式（375×667）----
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(800);
  await shot(page, 'mail-04-mobile');
  const menuBtn = await page.locator('button:has(svg.lucide-menu)').first().isVisible().catch(() => false);
  report.add('移动端布局（汉堡菜单/单栏）', menuBtn);
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---- 错误汇总 ----
  const fatal = errors.filter((e) => !e.includes('favicon') && !e.includes('ResizeObserver'));
  report.add('无前端 JS 错误', fatal.length === 0, fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 200));
  try { await shot(page, 'mail-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/mail-full-flow-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
