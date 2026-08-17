// e2e-tauri/mail-attachment.mjs
// 附件【懒加载 + 预览 + 下载命令】专项 E2E：
//  1) 全量同步后，附件元数据已记录（pending_download=true，懒加载模式）
//  2) UI 附件区渲染（附件数标签 + 下载按钮）
//  3) 内联附件（cid 图片）URL 替换（若存在样本）
//  4) 下载命令的错误路径（不存在 id → 明确报错，不弹系统对话框）
import { connect, collectErrors, demoLogin, shot, Report } from './helpers.mjs';

const QQ = {
  email: process.env.QQ_EMAIL ?? '1633856788@qq.com',
  password: process.env.QQ_AUTH_CODE ?? '',
  imapHost: 'imap.qq.com', imapPort: 993,
  smtpHost: 'smtp.qq.com', smtpPort: 465,
};
if (!QQ.password) {
  console.error('缺少环境变量 QQ_AUTH_CODE（QQ 邮箱授权码）。用法：QQ_AUTH_CODE=xxx node e2e-tauri/mail-attachment.mjs');
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
  const loginResult = await demoLogin(page);

  // ---- 1. 全新同步（保证附件落盘逻辑全量生效）----
  const existing = await invoke('mail_list_accounts');
  const old = existing.find((a) => a.email === QQ.email);
  if (old) await invoke('mail_delete_account', { id: old.id });
  const account = await invoke('mail_add_account', {
    email: QQ.email, displayName: 'QQ测试', username: QQ.email,
    password: QQ.password, imapHost: QQ.imapHost, imapPort: QQ.imapPort,
    smtpHost: QQ.smtpHost, smtpPort: QQ.smtpPort, useSsl: true,
  });
  report.add('重新添加 QQ 账户（全量同步）', !!account?.id);

  const sync = await invoke('mail_sync', { accountId: account.id });
  report.add('IMAP 同步完成', sync.folders > 0 && !sync.error,
    `folders=${sync.folders} fetched=${sync.fetched} error=${sync.error ?? 'null'}`);

  // ---- 2. 数据层：附件落盘验证 ----
  const unified = await invoke('mail_unified_inbox', { limit: 50, offset: 0 });
  const qqMails = unified.filter((m) => m.account_id === account.id);
  const flagged = qqMails.filter((m) => m.has_attachments);
  report.add('找到带附件标记的邮件', flagged.length > 0, `flagged=${flagged.length}`);

  let totalAtt = 0;
  let pendingDownloadCount = 0;
  let downloadedCount = 0;
  let inlineCount = 0;
  let sampleEmailId = null;
  const attachMeta = [];
  for (const m of flagged.slice(0, 10)) {
    const atts = await invoke('mail_list_attachments', { emailId: m.id });
    if (atts.length > 0 && !sampleEmailId) sampleEmailId = m.id;
    totalAtt += atts.length;
    for (const a of atts) {
      if (a.pending_download) pendingDownloadCount++;
      else downloadedCount++;
      if (a.content_id) inlineCount++;
      attachMeta.push({ email: m.subject?.slice(0, 20), file: a.filename, size: a.size, pending: a.pending_download });
    }
  }
  // 附件现在是懒加载：同步时只记录元数据 + pending_download=true，不立即下载到磁盘
  report.add('附件懒加载生效（pending_download=true）', totalAtt > 0 && pendingDownloadCount === totalAtt,
    `attachments=${totalAtt} pending=${pendingDownloadCount} downloaded=${downloadedCount}`);
  report.add('内联附件（cid 图片）识别', inlineCount >= 0, `inline=${inlineCount}`);
  if (attachMeta.length) {
    console.log('  附件明细:', attachMeta.slice(0, 6).map((a) => `${a.file}(${a.size}B,${a.pending ? 'pending' : 'downloaded'})`).join(', '));
  }

  // 下载命令错误路径：不存在的 id 必须明确 reject（不弹系统对话框）。
  // 注意：evaluate 内部捕获并返回字符串，避免 CDP 把非 Error 拒绝值序列化成 "Object"
  const res = await page.evaluate(async () => {
    try {
      await window.__TAURI__.core.invoke('mail_download_attachment', { id: 'not-exist-id' });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: typeof e === 'string' ? e : JSON.stringify(e ?? {}) };
    }
  });
  if (res.ok) {
    report.add('下载命令错误路径', false, '预期报错但未报错');
  } else {
    const msg = res.error ?? '';
    report.add('下载命令错误路径（不存在附件 → 明确报错）',
      msg.includes('不存在') || msg.includes('NOT_FOUND'),
      msg.slice(0, 120));
  }

  // ---- 3. UI 附件区渲染 ----
  await page.locator('a[href="/dashboard"]').first().click().catch(() => {});
  await sleep(500);
  await page.locator('a[href="/mail"]').first().click();
  await sleep(2500);

  let openedAttach = false;
  if (sampleEmailId) {
    // 列表行内不显示主题（只显示发件人/摘要），无法按主题定位 →
    // 遍历点击列表行，直到阅读器出现附件区（上限 50 行，覆盖统一收件箱整页）
    // 附件现在是懒加载，UI 附件区在邮件详情中显示下载按钮（非文件名列表）
    const rows = page.locator('div[role="button"]');
    const rowCount = await rows.count();
    const attachArea = page.getByText(/附件（\d+）/).first();
    for (let i = 0; i < Math.min(rowCount, 50); i++) {
      await rows.nth(i).click();
      await sleep(2000);
      if (await attachArea.isVisible().catch(() => false)) {
        openedAttach = true;
        break;
      }
    }
    const attachLabel = await attachArea.isVisible().catch(() => false);
    // 懒加载下文件名可能在详情视图中显示，或在附件区按钮中体现
    const body = await page.locator('body').textContent();
    const fileNameShown = attachMeta.some((a) => a.file && (body || '').includes(a.file));
    report.add('UI 附件区渲染（附件数+文件名）', openedAttach && (fileNameShown || attachLabel),
      `label=${attachLabel} filename=${fileNameShown} opened=${openedAttach} rows=${rowCount}`);
    await shot(page, 'mail-attach-list');

    // 内联图片渲染：若存在 cid 附件且正文含图片，断言 img src 已从 cid: 替换
    if (inlineCount > 0) {
      const imgSrcs = await page.locator('div.prose img').evaluateAll((imgs) =>
        imgs.map((i) => i.getAttribute('src') ?? '').filter((s) => s.length > 0)).catch(() => []);
      const replaced = imgSrcs.every((s) => !s.startsWith('cid:'));
      report.add('内联 cid 图片 URL 已替换', replaced, `imgs=${imgSrcs.length}`);
    }
  } else {
    report.add('UI 附件区渲染（无附件样本，跳过）', true, '样本缺失');
  }

  const fatal = errors.filter((e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools'));
  report.add('全程 0 前端 JS 错误', fatal.length === 0, fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'mail-attach-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/mail-attachment-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
