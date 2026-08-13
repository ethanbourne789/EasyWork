const { chromium } = require('playwright');

const BASE = 'http://localhost:1420';
const EMAIL = 'demo@easywork.app';
const PASS = 'Demo123456!';
const OUT = 'docs/assets';

const shots = [
  // [path, file, human label]
  ['/dashboard', '01-dashboard.png', '仪表盘'],
  ['/tasks', '02-tasks-board.png', '任务-看板'],
  ['/tasks?view=list', '03-tasks-list.png', '任务-列表'],
  ['/tasks?view=calendar', '04-tasks-calendar.png', '任务-日历'],
  ['/mail', '05-mail.png', '邮件'],
  ['/notes', '06-notes.png', '笔记'],
  ['/finance?tab=overview', '07-finance-overview.png', '记账-总览'],
  ['/finance?tab=transactions', '08-finance-transactions.png', '记账-交易'],
  ['/finance?tab=accounts', '09-finance-accounts.png', '记账-账户'],
  ['/finance?tab=budgets', '10-finance-budgets.png', '记账-预算'],
  ['/finance?tab=categories', '11-finance-categories.png', '记账-分类'],
  ['/finance?tab=reports', '12-finance-reports.png', '记账-报表'],
  ['/calendar?view=month', '13-calendar-month.png', '日历-月'],
  ['/calendar?view=week', '14-calendar-week.png', '日历-周'],
  ['/calendar?view=agenda', '15-calendar-agenda.png', '日历-议程'],
  ['/settings', '16-settings.png', '设置'],
];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  // 拦截 confirm 弹窗，自动接受（避免清空/删除阻塞）
  page.on('dialog', d => d.accept().catch(() => {}));

  const log = (m) => console.log('[shot] ' + m);

  // 1) 登录：直接填表单（loginDemo 依赖 VITE_DEMO_PASSWORD env，headless 截图不保证已配）
  log('opening login…');
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  log('fill login form');
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.getByRole('button', { name: /登录|进入|sign in/i }).first().click();

  // 等待进入 dashboard（URL 变化 + 应用外壳出现）
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
  } catch (e) {
    log('WARN: did not navigate to /dashboard, dumping body text:');
    log((await page.evaluate(() => document.body.innerText)).slice(0, 300));
  }
  await page.waitForTimeout(1500);

  for (const [path, file, label] of shots) {
    try {
      log(`→ ${label} (${path})`);
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1800); // 等数据/图表渲染
      await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
      log(`   saved ${file}`);
    } catch (e) {
      log(`   ERROR ${label}: ${e.message}`);
    }
  }

  await browser.close();
  log('done');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
