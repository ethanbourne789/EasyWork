// e2e-tauri/mail-syncback.mjs
// 三个遗留项专项 E2E：
//  1) 已读/标星回写 IMAP：本地变更后删账户重拉全量，断言服务端标志已生效
//  2) 联系人/模板/签名云同步列与触发器：node:sqlite 只读直查本地库
//  3) FTS 全文搜索：emails_fts 已回填 + mail_search 命令可用
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connect, collectErrors, demoLogin, shot, Report } from './helpers.mjs';

const QQ = {
  email: process.env.QQ_EMAIL ?? '1633856788@qq.com',
  password: process.env.QQ_AUTH_CODE ?? '',
  imapHost: 'imap.qq.com', imapPort: 993,
  smtpHost: 'smtp.qq.com', smtpPort: 465,
};
if (!QQ.password) {
  console.error('缺少环境变量 QQ_AUTH_CODE（QQ 邮箱授权码）。用法：QQ_AUTH_CODE=xxx node e2e-tauri/mail-syncback.mjs');
  process.exit(1);
}

const report = new Report();
let browser, page;
const errors = [];
const invoke = (cmd, args = {}) =>
  page.evaluate(([c, a]) => window.__TAURI__.core.invoke(c, a), [cmd, args]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 定位本地邮件库（用户文档重定向到 D 盘 → 探测常见位置）
function findMailDb() {
  const candidates = [
    join('D:\\WindowsStuff\\Documents', 'EasyWork', 'mail', 'easywork-mail.db'),
    join(homedir(), 'Documents', 'EasyWork', 'mail', 'easywork-mail.db'),
    join(homedir(), 'AppData', 'Roaming', 'com.easywork.app', 'mail', 'easywork-mail.db'),
  ];
  return candidates.find((p) => existsSync(p));
}

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));
  if (page.url().includes('/login')) {
    await demoLogin(page);
  }

  // ================= 1. 已读/标星回写 IMAP =================
  // 全量同步基线
  const existing = await invoke('mail_list_accounts');
  const old = existing.find((a) => a.email === QQ.email);
  if (old) await invoke('mail_delete_account', { id: old.id });
  const account = await invoke('mail_add_account', {
    email: QQ.email, displayName: 'QQ回写测试', username: QQ.email,
    password: QQ.password, imapHost: QQ.imapHost, imapPort: QQ.imapPort,
    smtpHost: QQ.smtpHost, smtpPort: QQ.smtpPort, useSsl: true,
  });
  await invoke('mail_sync', { accountId: account.id });

  const unified = await invoke('mail_unified_inbox', { limit: 50, offset: 0 });
  const mails = unified.filter((m) => m.account_id === account.id && m.uid != null);
  report.add('基线：有可回写的服务端邮件', mails.length > 0, `count=${mails.length}`);

  const target = mails[0];
  const before = await invoke('mail_get_message', { id: target.id });
  const wantRead = true;
  const wantStar = !before.is_starred;

  try {
    await invoke('mail_mark_read', { id: target.id, isRead: wantRead });
    await invoke('mail_toggle_star', { id: target.id });
    const after = await invoke('mail_get_message', { id: target.id });
    report.add('本地状态更新即时生效', after.is_read === wantRead && after.is_starred === wantStar,
      `read=${after.is_read} star=${after.is_starred}`);
  } catch (e) {
    report.add('本地状态更新即时生效', false, String(e?.message ?? e).slice(0, 100));
  }

  // 强验证：删账户 → 重新全量同步（模拟另一设备），断言从服务端拉回的状态 == 回写后的状态
  await invoke('mail_delete_account', { id: account.id });
  await sleep(500);
  const account2 = await invoke('mail_add_account', {
    email: QQ.email, displayName: 'QQ回写测试', username: QQ.email,
    password: QQ.password, imapHost: QQ.imapHost, imapPort: QQ.imapPort,
    smtpHost: QQ.smtpHost, smtpPort: QQ.smtpPort, useSsl: true,
  });
  await invoke('mail_sync', { accountId: account2.id });
  const unified2 = await invoke('mail_unified_inbox', { limit: 50, offset: 0 });
  const fresh = (await Promise.all(
    unified2.filter((m) => m.account_id === account2.id && m.uid === target.uid)
      .map((m) => invoke('mail_get_message', { id: m.id })),
  ))[0];

  if (fresh) {
    report.add('IMAP 回写验证：已读已同步到服务端', fresh.is_read === wantRead,
      `server_read=${fresh.is_read}`);
    report.add('IMAP 回写验证：星标已同步到服务端', fresh.is_starred === wantStar,
      `server_star=${fresh.is_starred}（原状态=${before.is_starred}）`);
  } else {
    report.add('IMAP 回写验证', false, '重拉后未找到目标邮件');
  }

  // ================= 2. 联系人/模板/签名 云同步列 =================
  const dbPath = findMailDb();
  report.add('定位本地邮件库', !!dbPath, dbPath ?? '');
  if (dbPath) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      // 建一条数据再改，验证 sync_modified_at 默认值与 UPDATE 触发器
      const c = await invoke('contact_save', {
        contact: { id: '', name: '同步列验证', emails: ['sync@test.com'], phones: [], company: null, title: null, notes: null, group_ids: [], created_at: '', updated_at: '' },
      });
      await sleep(300);
      const row1 = db.prepare('SELECT sync_modified_at, sync_device_id FROM contacts WHERE id = ?').get(c.id);
      report.add('联系人同步列（默认值已填充）', !!row1?.sync_modified_at,
        `sync_modified_at=${row1?.sync_modified_at}`);

      await invoke('contact_save', { contact: { ...c, name: '同步列验证改' } });
      await sleep(300);
      const row2 = db.prepare('SELECT sync_modified_at FROM contacts WHERE id = ?').get(c.id);
      report.add('联系人 UPDATE 触发器（sync_modified_at 自动更新）',
        !!row2?.sync_modified_at && row2.sync_modified_at !== row1?.sync_modified_at,
        `before=${row1?.sync_modified_at} after=${row2?.sync_modified_at}`);
      await invoke('contact_delete', { id: c.id });

      const tpl = await invoke('mail_save_template', { name: '云同步模板', subject: 'S', body: 'B' });
      await sleep(300);
      const trow = db.prepare('SELECT updated_at, sync_modified_at FROM email_templates WHERE id = ?').get(tpl.id);
      report.add('模板同步列（updated_at + sync_modified_at）',
        !!trow?.updated_at && !!trow?.sync_modified_at,
        `updated_at=${trow?.updated_at}`);
      await invoke('mail_delete_template', { id: tpl.id });

      const sig = await invoke('mail_save_signature', { name: '云同步签名', html: '<p>s</p>', isDefault: false });
      await sleep(300);
      const srow = db.prepare('SELECT sync_modified_at FROM email_signatures WHERE id = ?').get(sig.id);
      report.add('签名同步列', !!srow?.sync_modified_at);
      await invoke('mail_delete_signature', { id: sig.id });

      // 云 schema 所需表结构已在本地验证；真实 PG 需要连接串，跳过在线验证
      const triggers = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE '%_sync_touch'"
      ).all().map((r) => r.name);
      report.add('同步触发器已创建', ['contacts_sync_touch', 'email_templates_sync_touch', 'email_signatures_sync_touch']
        .every((t) => triggers.includes(t)), triggers.join(','));
    } finally {
      db.close();
    }
  }

  // ================= 3. FTS 全文搜索 =================
  if (dbPath) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const emailsCount = db.prepare('SELECT COUNT(*) c FROM emails').get().c;
      const ftsCount = db.prepare('SELECT COUNT(*) c FROM emails_fts').get().c;
      report.add('FTS 回填：emails_fts 行数 = emails 行数', emailsCount === ftsCount,
        `emails=${emailsCount} fts=${ftsCount}`);

      const ftsTriggers = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'emails_fts_%'"
      ).all().map((r) => r.name);
      report.add('FTS 触发器已创建', ['emails_fts_insert', 'emails_fts_delete', 'emails_fts_update']
        .every((t) => ftsTriggers.includes(t)), ftsTriggers.join(','));
    } finally {
      db.close();
    }
  }

  // mail_search 命令可用性：搜一个真实主题词
  try {
    const probe = await invoke('mail_search', { query: 'EasyWork' });
    const res = await invoke('mail_search', { query: 'Invoice 20575355' });
    report.add('mail_search 命令（FTS MATCH）', res.length > 0 || probe.length > 0,
      `Invoice命中=${res.length} EasyWork命中=${probe.length}`);
  } catch (e) {
    report.add('mail_search 命令（FTS MATCH）', false, String(e?.message ?? e).slice(0, 120));
  }

  const fatal = errors.filter((e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools'));
  report.add('全程 0 前端 JS 错误', fatal.length === 0, fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'mail-syncback-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/mail-syncback-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
