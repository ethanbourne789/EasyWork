// scripts/e2e-tauri-p1-diag.mjs — 诊断备份导入流程
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const SHOT = 'e2e-screenshots';
mkdirSync(SHOT, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = ctx?.pages().find(p => p.url().includes('tauri.localhost')) || ctx?.pages()[0];
if (!page) { console.log('NO PAGE'); process.exit(1); }

page.on('console', m => console.log(`[console:${m.type()}] ${m.text()}`));
page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));

const wait = ms => page.waitForTimeout(ms);
const TS = Date.now();

// 用最新导出的备份文件（取 p1_backup_*.json 最新）
const fs = await import('node:fs');
const backups = fs.readdirSync(SHOT).filter(f => /p1_backup_\d+\.json/.test(f)).sort();
console.log('backups:', backups);
if (backups.length === 0) { console.log('无备份文件'); process.exit(1); }
const backupPath = `${SHOT}/${backups[backups.length - 1]}`;
const dump = JSON.parse(readFileSync(backupPath, 'utf-8'));
console.log('备份表:', Object.keys(dump).join(','));
console.log('tasks[0] 字段:', Object.keys(dump.tasks[0] || {}).join(','));

const first = dump.tasks[0];
dump.tasks[0] = { ...first, id: `e2e-diag-${TS}`, title: `E2E诊断-${TS}` };
const modPath = `${SHOT}/p1_diag_mod_${TS}.json`;
fs.writeFileSync(modPath, JSON.stringify(dump));
console.log('修改版备份:', modPath);

await page.goto('http://tauri.localhost/settings', { waitUntil: 'load' }).catch(() => {});
await wait(2500);
console.log('URL:', page.url());

// 数据管理 tab
const dataTab = page.getByRole('button', { name: /数据管理/ }).first();
console.log('数据管理 tab count:', await dataTab.count());
await dataTab.click();
await wait(1000);

// 文件选择
const fileInput = page.locator('input[type="file"]');
console.log('file input count:', await fileInput.count());
await fileInput.setInputFiles(modPath);
await wait(2500);

// 检查 dialog
const dlgCount = await page.locator('[role="dialog"]').count();
console.log('dialog count:', dlgCount);
const dlgTexts = await page.locator('[role="dialog"]').allTextContents();
console.log('dialog texts:', JSON.stringify(dlgTexts.map(t => t.replace(/\s+/g, ' ').trim().slice(0, 100))));
const bodyNow = (await page.locator('body').textContent()) || '';
console.log('body 含"导入"?', bodyNow.includes('导入'), '含"确定"?', bodyNow.includes('确定'));
await page.screenshot({ path: `${SHOT}/p1_diag_after_file.png` });

// 尝试点确认
const confirmBtn = page.locator('[role="dialog"] button').filter({ hasText: /导入|确定|恢复/ }).last();
console.log('confirm btn count:', await confirmBtn.count());
if (await confirmBtn.count() > 0) {
  await confirmBtn.click();
  await wait(4000);
  const bodyAfter = (await page.locator('body').textContent()) || '';
  console.log('点击后 body 含"导入失败"?', bodyAfter.includes('导入失败'), '含"导入成功"?', bodyAfter.includes('导入成功'));
  await page.screenshot({ path: `${SHOT}/p1_diag_after_confirm.png` });
}
await browser.close();