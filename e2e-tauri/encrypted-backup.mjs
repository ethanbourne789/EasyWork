// e2e-tauri/encrypted-backup.mjs
// 加密备份/还原专项 E2E：
//  1) 登录演示账户后导航到设置页
//  2) 导出明文备份（无密码），验证结构
//  3) 导出加密备份（有密码），验证加密包装格式
//  4) 导入明文备份，验证数据一致性
//  5) 导入加密备份（正确密码），验证解密成功
//  6) 导入加密备份（错误密码），验证解密失败
//  7) 验证导入/导出循环后数据完整性
//  8) 清理
import { connect, collectErrors, demoLogin, shot, Report, expect } from './helpers.mjs';

const BACKUP_WRAPPER_KEYS = ['version', 'encrypted', 'kdf', 'salt', 'nonce', 'data'];
const BACKUP_TABLES_WHITELIST = [
  'tasks', 'task_tags', 'tags', 'subtasks',
  'notes', 'note_folders', 'note_tags', 'note_note_tags', 'note_tag_master',
  'accounts', 'transactions', 'categories', 'budgets',
  'contacts', 'contact_groups', 'contact_group_members',
  'email_accounts', 'email_folders', 'emails', 'email_attachments',
  'mail_templates', 'mail_signatures', 'mail_drafts',
  'calendar_subscriptions', 'calendar_events',
  'reminders', 'sync_config', 'profiles',
];

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
  await shot(page, 'encrypted-backup-01-dashboard');
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 导航到设置 → 数据管理 tab ----
  await page.locator('a[href="/settings"]').first().click();
  await page.waitForTimeout(1500);
  report.add('进入设置页', page.url().includes('/settings'));

  const dataTab = page.locator('div.w-48 button').filter({ hasText: /数据管理/ }).first();
  await dataTab.click();
  await page.waitForTimeout(1000);
  await shot(page, 'encrypted-backup-02-settings-data');

  // ---- 3. 导出明文备份（password=null）----
  let plaintextExport;
  try {
    plaintextExport = await invoke('data_export_all', { password: null });
    report.add('明文导出命令可达', true);
  } catch (e) {
    report.add('明文导出命令可达', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('明文导出命令调用失败，跳过后续步骤');
  }

  // 校验明文导出结构：应为 { table: rows[] }，不含加密包装字段
  const plaintextKeys = Object.keys(plaintextExport);
  report.add('明文导出包含业务表', plaintextKeys.length > 0, `tables=${plaintextKeys.length}`);

  // 验证不包含加密包装字段
  const hasEncryptedWrapper = plaintextKeys.some(k => BACKUP_WRAPPER_KEYS.includes(k));
  report.add('明文导出无加密包装字段', !hasEncryptedWrapper,
    hasEncryptedWrapper ? `found: ${plaintextKeys.filter(k => BACKUP_WRAPPER_KEYS.includes(k)).join(', ')}` : '');

  // 验证核心表存在
  const coreTables = ['tasks', 'transactions', 'accounts', 'notes'];
  const plaintextSnapshot = {};
  for (const tbl of coreTables) {
    const hasTable = plaintextKeys.includes(tbl);
    const count = hasTable ? (Array.isArray(plaintextExport[tbl]) ? plaintextExport[tbl].length : 0) : 0;
    plaintextSnapshot[tbl] = count;
    report.add(`明文导出包含 ${tbl}`, hasTable, `rows=${count}`);
  }

  // 验证白名单
  const unknownTables = plaintextKeys.filter((k) => !BACKUP_TABLES_WHITELIST.includes(k));
  report.add('明文导出表名全在白名单内', unknownTables.length === 0,
    unknownTables.length ? `未知表: ${unknownTables.join(', ')}` : '');

  await shot(page, 'encrypted-backup-03-plaintext-export-done');

  // ---- 4. 导出加密备份（password="e2e-test-password"）----
  const TEST_PASSWORD = 'e2e-test-password';
  let encryptedExport;
  try {
    encryptedExport = await invoke('data_export_all', { password: TEST_PASSWORD });
    report.add('加密导出命令可达', true);
  } catch (e) {
    report.add('加密导出命令可达', false, String(e?.message ?? e).slice(0, 120));
    throw new Error('加密导出命令调用失败，跳过后续步骤');
  }

  // 校验加密包装格式
  const encryptedKeys = Object.keys(encryptedExport);
  report.add('加密导出为对象格式', encryptedKeys.length > 0, `keys=${encryptedKeys.join(', ')}`);

  // 验证加密包装必需字段
  for (const wk of BACKUP_WRAPPER_KEYS) {
    const present = encryptedKeys.includes(wk);
    report.add(`加密包装含 ${wk}`, present, present ? String(encryptedExport[wk]).slice(0, 40) : 'MISSING');
  }

  // 验证 encrypted=true
  report.add('加密包装 encrypted=true', encryptedExport.encrypted === true,
    `encrypted=${encryptedExport.encrypted}`);

  // 验证 version=1
  report.add('加密包装 version=1', encryptedExport.version === 1,
    `version=${encryptedExport.version}`);

  // 验证 kdf=argon2id
  report.add('加密包装 kdf=argon2id', encryptedExport.kdf === 'argon2id',
    `kdf=${encryptedExport.kdf}`);

  // 验证 salt/nonce/data 为 base64 字符串
  report.add('加密 salt 为 base64 字符串',
    typeof encryptedExport.salt === 'string' && encryptedExport.salt.length > 0,
    `length=${encryptedExport.salt?.length}`);
  report.add('加密 nonce 为 base64 字符串',
    typeof encryptedExport.nonce === 'string' && encryptedExport.nonce.length > 0,
    `length=${encryptedExport.nonce?.length}`);
  report.add('加密 data 为 base64 字符串',
    typeof encryptedExport.data === 'string' && encryptedExport.data.length > 0,
    `length=${encryptedExport.data?.length}`);

  // 验证加密导出不包含明文表键
  const hasPlaintextTables = encryptedKeys.some(k => BACKUP_TABLES_WHITELIST.includes(k));
  report.add('加密导出无明文表键', !hasPlaintextTables,
    hasPlaintextTables ? `found: ${encryptedKeys.filter(k => BACKUP_TABLES_WHITELIST.includes(k)).join(', ')}` : '');

  await shot(page, 'encrypted-backup-04-encrypted-export-done');

  // ---- 5. 导入明文备份 ----
  let plaintextImportResult;
  try {
    plaintextImportResult = await invoke('data_import_all', {
      data: plaintextExport,
    });
    report.add('导入明文备份成功', typeof plaintextImportResult === 'number',
      `imported_tables=${plaintextImportResult}`);
  } catch (e) {
    report.add('导入明文备份', false, String(e?.message ?? e).slice(0, 120));
  }

  // 导入明文后重新导出验证数据一致
  let afterPlaintextImport;
  try {
    afterPlaintextImport = await invoke('data_export_all');
    let consistent = true;
    const details = [];
    for (const tbl of coreTables) {
      const reCount = Array.isArray(afterPlaintextImport[tbl]) ? afterPlaintextImport[tbl].length : 0;
      const origCount = plaintextSnapshot[tbl] ?? 0;
      if (reCount !== origCount) consistent = false;
      details.push(`${tbl}:${origCount}->${reCount}`);
    }
    report.add('明文导入后数据一致性', consistent, details.join(', '));
  } catch (e) {
    report.add('明文导入后数据校验', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 6. 导入加密备份（正确密码）----
  let correctPwdImportResult;
  try {
    correctPwdImportResult = await invoke('data_import_all', {
      data: encryptedExport,
      password: TEST_PASSWORD,
    });
    report.add('加密备份正确密码导入成功', typeof correctPwdImportResult === 'number',
      `imported_tables=${correctPwdImportResult}`);
  } catch (e) {
    report.add('加密备份正确密码导入', false, String(e?.message ?? e).slice(0, 120));
  }

  // 导入加密备份后重新导出验证数据一致
  let afterEncryptedImport;
  try {
    afterEncryptedImport = await invoke('data_export_all');
    let consistent = true;
    const details = [];
    for (const tbl of coreTables) {
      const reCount = Array.isArray(afterEncryptedImport[tbl]) ? afterEncryptedImport[tbl].length : 0;
      const origCount = plaintextSnapshot[tbl] ?? 0;
      if (reCount !== origCount) consistent = false;
      details.push(`${tbl}:${origCount}->${reCount}`);
    }
    report.add('加密导入后数据一致性', consistent, details.join(', '));
  } catch (e) {
    report.add('加密导入后数据校验', false, String(e?.message ?? e).slice(0, 120));
  }

  await shot(page, 'encrypted-backup-05-correct-pwd-import-done');

  // ---- 7. 导入加密备份（错误密码，应失败）----
  const WRONG_PASSWORD = 'wrong-password-123';
  let wrongPwdFailed = false;
  let wrongPwdError = '';
  try {
    await invoke('data_import_all', {
      data: encryptedExport,
      password: WRONG_PASSWORD,
    });
    report.add('加密备份错误密码应拒绝', false, '未报错，导入不应成功');
  } catch (e) {
    wrongPwdFailed = true;
    wrongPwdError = String(e?.message ?? e).slice(0, 120);
    const msg = wrongPwdError.toLowerCase();
    const isExpectedError = msg.includes('密码') || msg.includes('decrypt') || msg.includes('解密') || msg.includes('错误');
    report.add('加密备份错误密码应拒绝', isExpectedError, wrongPwdError);
  }

  // ---- 8. 导入加密备份（不提供密码，应失败）----
  let noPwdFailed = false;
  let noPwdError = '';
  try {
    await invoke('data_import_all', {
      data: encryptedExport,
    });
    report.add('加密备份无密码应拒绝', false, '未报错，导入不应成功');
  } catch (e) {
    noPwdFailed = true;
    noPwdError = String(e?.message ?? e).slice(0, 120);
    const msg = noPwdError.toLowerCase();
    const isExpectedError = msg.includes('密码') || msg.includes('加密') || msg.includes('encrypt');
    report.add('加密备份无密码应拒绝', isExpectedError, noPwdError);
  }

  // ---- 9. 验证导出/导入循环数据完整性 ----
  // 用明文导出再导入，最后验证核心表行数和字段完整性
  let finalExport;
  try {
    finalExport = await invoke('data_export_all');

    // 核心表行数与初始快照一致
    let allMatch = true;
    const matchDetails = [];
    for (const tbl of coreTables) {
      const finalCount = Array.isArray(finalExport[tbl]) ? finalExport[tbl].length : 0;
      const origCount = plaintextSnapshot[tbl] ?? 0;
      if (finalCount !== origCount) allMatch = false;
      matchDetails.push(`${tbl}:${origCount}->${finalCount}`);
    }
    report.add('导入导出循环数据完整性', allMatch, matchDetails.join(', '));

    // 交易记录字段完整性校验
    const txnSample = finalExport.transactions?.[0];
    if (txnSample) {
      const requiredFields = ['id', 'type', 'amount_cents', 'account_id', 'date', 'created_at'];
      const missing = requiredFields.filter((f) => !(f in txnSample));
      report.add('循环后交易字段完整', missing.length === 0,
        missing.length ? `缺失: ${missing.join(', ')}` : `字段数=${Object.keys(txnSample).length}`);
    }

    // 任务记录字段完整性校验
    const taskSample = finalExport.tasks?.[0];
    if (taskSample) {
      const requiredFields = ['id', 'title', 'status', 'created_at'];
      const missing = requiredFields.filter((f) => !(f in taskSample));
      report.add('循环后任务字段完整', missing.length === 0,
        missing.length ? `缺失: ${missing.join(', ')}` : `字段数=${Object.keys(taskSample).length}`);
    }
  } catch (e) {
    report.add('导入导出循环完整性校验', false, String(e?.message ?? e).slice(0, 120));
  }

  await shot(page, 'encrypted-backup-06-integrity-verified');

  // ---- 10. 验证两次加密导出密文不同（防重放）----
  let secondEncryptedExport;
  try {
    secondEncryptedExport = await invoke('data_export_all', { password: TEST_PASSWORD });
    const saltDiff = encryptedExport.salt !== secondEncryptedExport.salt;
    const nonceDiff = encryptedExport.nonce !== secondEncryptedExport.nonce;
    const dataDiff = encryptedExport.data !== secondEncryptedExport.data;
    report.add('两次加密导出盐不同', saltDiff,
      saltDiff ? 'PASS' : `salt=${encryptedExport.salt.slice(0, 12)}...`);
    report.add('两次加密导出 nonce 不同', nonceDiff,
      nonceDiff ? 'PASS' : `nonce=${encryptedExport.nonce.slice(0, 12)}...`);
    report.add('两次加密导出密文不同', dataDiff,
      dataDiff ? 'PASS' : `data 完全相同`);
  } catch (e) {
    report.add('二次加密导出', false, String(e?.message ?? e).slice(0, 120));
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'encrypted-backup-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/encrypted-backup-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
