import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'http://localhost:1420';
const EMAIL = 'ethanbourne789@gmail.com';
const PASSWORD = 'oceanking7';
const QQ_EMAIL = '1633856788@qq.com';
const QQ_AUTH = 'mionyteazudgbfbi';
const SHOT_DIR = 'E:/Dev/EasyWork0807/scripts/mail-e2e-shots';

fs.mkdirSync(SHOT_DIR, { recursive: true });

const log = (...a) => console.log('[e2e]', ...a);
const fetchMailResponses = [];

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/functions/v1/fetch-mail')) {
      try {
        const bodyText = await resp.text();
        let parsed = null;
        try { parsed = JSON.parse(bodyText); } catch {}
        fetchMailResponses.push({ status: resp.status(), body: parsed ?? bodyText });
        log('fetch-mail resp', resp.status(), JSON.stringify(parsed ?? bodyText).slice(0, 600));
      } catch (e) {
        fetchMailResponses.push({ status: resp.status(), readError: String(e) });
      }
    }
  });
  page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[mail-relay]')) log('RELAY:', t);
    else if (msg.type() === 'error') log('CONSOLE.ERR:', t.slice(0, 300));
  });
  page.on('pageerror', (err) => log('PAGE.ERR:', err.message.slice(0, 300)));

  // ---------- 1. Login ----------
  log('navigate', BASE);
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: `${SHOT_DIR}/01-login.png` });

  await page.getByPlaceholder('邮箱').fill(EMAIL);
  await page.getByPlaceholder('密码（至少 6 位）').fill(PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();

  // detect login failure
  await page.waitForTimeout(4000);
  const loginError = await page.getByText(/邮箱或密码|登录失败|不存在|错误/).count();
  if (loginError > 0) {
    const txt = await page.getByText(/邮箱或密码|登录失败|不存在|错误/).first().innerText().catch(() => '');
    log('LOGIN FAILED:', txt);
    await page.screenshot({ path: `${SHOT_DIR}/01b-login-error.png` });
    throw new Error('login failed: ' + txt);
  }
  await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => log('no /dashboard redirect'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT_DIR}/02-after-login.png` });
  log('url after login:', page.url());

  // ---------- 2. Mail module ----------
  await page.goto(`${BASE}/mail`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT_DIR}/03-mail-initial.png` });

  const accountExists = (await page.getByText(QQ_EMAIL, { exact: false }).count()) > 0;
  log('QQ account already present?', accountExists);

  if (!accountExists) {
    await page.getByRole('button', { name: '添加账号' }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOT_DIR}/04-add-account-dialog.png` });

    await page.getByPlaceholder('you@example.com').fill(QQ_EMAIL);
    await page.getByPlaceholder('多数邮箱与邮箱地址相同，可选').fill(QQ_EMAIL); // username
    await page.getByPlaceholder('IMAP/SMTP 密码或邮箱授权码').fill(QQ_AUTH);
    await page.getByPlaceholder('imap.example.com').fill('imap.qq.com');
    await page.getByPlaceholder('smtp.example.com').fill('smtp.qq.com');
    // ensure SSL checked
    const ssl = page.locator('input[type="checkbox"]').first();
    if (!(await ssl.isChecked())) await ssl.check();
    await page.screenshot({ path: `${SHOT_DIR}/05-add-account-filled.png` });

    await page.getByRole('button', { name: '创建' }).click();
    // wait for dialog to close (auto-sync kicks off in onSuccess)
    await page.waitForFunction(
      () => !document.body.innerText.includes('添加邮箱账号'),
      { timeout: 15000 }
    ).catch(() => log('add dialog did not close in time'));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOT_DIR}/06-after-create.png` });
  } else {
    log('skipping account creation (already exists)');
  }

  // ---------- 3. Click 收取邮件 (the core business logic) ----------
  const syncBtn = page.getByRole('button', { name: /收取邮件|收取中/ });
  await syncBtn.click();
  log('clicked 收取邮件, polling for fetch-mail response...');

  const start = Date.now();
  while (Date.now() - start < 90000) {
    if (fetchMailResponses.some((r) => r.status === 200)) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(5000); // let react-query refetch + render
  await page.screenshot({ path: `${SHOT_DIR}/07-after-sync.png` });

  // ---------- 4. Verify ----------
  const emptyCount = await page.getByText('暂无邮件').count();
  const emailItems = await page.locator('div[role="button"]').count();
  const headers = await page.locator('p', { hasText: /个账户|未读/ }).allInnerTexts().catch(() => []);
  const listPreview = await page.locator('div[role="button"]').allInnerTexts().catch(() => []);
  log('emptyCount:', emptyCount, 'emailItems:', emailItems);
  log('headerTexts:', JSON.stringify(headers));
  log('listPreview:', JSON.stringify(listPreview.slice(0, 6)));
  await page.screenshot({ path: `${SHOT_DIR}/08-final.png` });

  const summary = {
    loginEmail: EMAIL,
    qqAccount: QQ_EMAIL,
    accountExisted: accountExists,
    fetchMailCalls: fetchMailResponses,
    emailItemCount: emailItems,
    isEmpty: emptyCount > 0,
    headerTexts: headers,
    listPreview: listPreview.slice(0, 10),
  };
  console.log('SUMMARY_JSON_BEGIN');
  console.log(JSON.stringify(summary, null, 2));
  console.log('SUMMARY_JSON_END');

  await browser.close();
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
