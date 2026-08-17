// e2e-tauri/theme-switch.mjs
// 主题切换专项 E2E：
//  1) 登录演示账户
//  2) 通过设置页外观 tab 切换 light / dark 主题
//  3) 每次切换后验证 html 元素 class 变化
//  4) 导航到不同页面验证主题持久化
//  5) 验证 localStorage 中主题值正确写入
import { connect, collectErrors, demoLogin, shot, Report, expect, navTo } from './helpers.mjs';

const THEME_KEY = 'easywork-theme';
const report = new Report();
let browser, page;
const errors = [];

async function getThemeState(pg) {
  return pg.evaluate((key) => {
    const isDark = document.documentElement.classList.contains('dark');
    const stored = localStorage.getItem(key);
    return { isDark, stored };
  }, THEME_KEY);
}

async function getThemeStateWithBg(pg) {
  return pg.evaluate((key) => {
    const isDark = document.documentElement.classList.contains('dark');
    const stored = localStorage.getItem(key);
    const bgStyle = window.getComputedStyle(document.documentElement).backgroundColor;
    return { isDark, stored, bgStyle };
  }, THEME_KEY);
}

const PATH_LABEL_MAP = {
  '/dashboard': '仪表',
  '/finance': '记账',
  '/tasks': '任务',
  '/notes': '笔记',
  '/mail': '邮箱',
  '/settings': '设置',
};

async function navigateTo(pg, path) {
  const label = PATH_LABEL_MAP[path];
  if (label) {
    await navTo(pg, label);
  } else {
    await pg.evaluate((p) => { window.location.href = p; }, path);
    await pg.waitForTimeout(1200);
  }
}

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));

  // ---- 1. 演示登录 ----
  if (page.url().includes('/login')) {
    await demoLogin(page);
  }
  // 等待主题 useEffect 完成渲染
  await page.waitForTimeout(800);
  await shot(page, 'theme-01-dashboard');
  report.add('演示登录成功', !page.url().includes('/login') && !page.url().includes('/register'));

  // 记录初始主题
  const initialTheme = await getThemeStateWithBg(page);
  report.add('初始主题状态', true,
    `html_dark=${initialTheme.isDark} localStorage="${initialTheme.stored ?? 'null'}"`);

  // ---- 2. 导航到设置 → 外观 tab ----
  await navigateTo(page, '/settings');
  report.add('进入设置页', page.url().includes('/settings'));

  // 点击「外观」tab
  const appearanceTab = page.locator('div.w-48 button').filter({ hasText: /外观/ }).first();
  await appearanceTab.click();
  await page.waitForTimeout(1000);
  await shot(page, 'theme-02-settings-appearance');

  // ---- 3. 切换到暗色主题 ----
  // 先确保当前是亮色，再切暗色（避免已是暗色时点击无效）
  const lightBtnCheck = page.locator('button').filter({ hasText: /浅色|亮色/ }).first();
  const currentIsDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  if (!currentIsDark) {
    // 已是亮色，直接点暗色
    const darkBtn = page.locator('button').filter({ hasText: /深色|暗色/ }).first();
    report.add('外观 tab 可见暗色按钮', await darkBtn.isVisible().catch(() => false));
    await darkBtn.click();
  } else {
    // 已是暗色，先切亮色再切暗色
    await lightBtnCheck.click();
    await page.waitForTimeout(800);
    const darkBtn = page.locator('button').filter({ hasText: /深色|暗色/ }).first();
    report.add('外观 tab 可见暗色按钮', await darkBtn.isVisible().catch(() => false));
    await darkBtn.click();
  }
  await page.waitForTimeout(1200);
  await shot(page, 'theme-03-dark-applied');

  // 验证暗色主题生效
  let themeState = await getThemeStateWithBg(page);
  report.add('切换到暗色主题（html.dark class）', themeState.isDark,
    `class=${themeState.isDark} storage="${themeState.stored}" bg=${themeState.bgStyle}`);
  report.add('暗色主题 localStorage 写入', themeState.stored === 'dark', `"${themeState.stored}"`);

  // 验证暗色按钮变为 active（variant="default" 即实心按钮）
  const darkBtnActive = await page.locator('button').filter({ hasText: /深色|暗色/ }).first()
    .evaluate((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      const isActive = bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)';
      return { isActive, bg };
    }).catch(() => ({ isActive: null, bg: 'not-found' }));
  report.add('暗色按钮样式变为 active', darkBtnActive.isActive !== false && darkBtnActive.isActive !== null,
    `isActive=${darkBtnActive.isActive} bg=${darkBtnActive.bg}`);

  // ---- 4. 在暗色主题下导航到不同页面 ----
  // 仪表盘
  await navigateTo(page, '/dashboard');
  themeState = await getThemeState(page);
  report.add('暗色主题 → 仪表盘持久化', themeState.isDark && themeState.stored === 'dark',
    `isDark=${themeState.isDark} stored="${themeState.stored}"`);
  await shot(page, 'theme-04-dark-dashboard');

  // 记账页
  await navigateTo(page, '/finance');
  themeState = await getThemeState(page);
  report.add('暗色主题 → 记账页持久化', themeState.isDark && themeState.stored === 'dark',
    `isDark=${themeState.isDark} stored="${themeState.stored}"`);
  await shot(page, 'theme-05-dark-finance');

  // 任务页
  await navigateTo(page, '/tasks');
  themeState = await getThemeState(page);
  report.add('暗色主题 → 任务页持久化', themeState.isDark && themeState.stored === 'dark',
    `isDark=${themeState.isDark} stored="${themeState.stored}"`);

  // 笔记页
  await navigateTo(page, '/notes');
  themeState = await getThemeState(page);
  report.add('暗色主题 → 笔记页持久化', themeState.isDark && themeState.stored === 'dark',
    `isDark=${themeState.isDark} stored="${themeState.stored}"`);
  await shot(page, 'theme-06-dark-notes');

  // ---- 5. 切换回亮色主题 ----
  await navigateTo(page, '/settings');
  await page.waitForTimeout(500);
  await page.locator('div.w-48 button').filter({ hasText: /外观/ }).first().click();
  await page.waitForTimeout(1000);

  const lightBtn = page.locator('button').filter({ hasText: /浅色|亮色/ }).first();
  report.add('外观 tab 可见亮色按钮', await lightBtn.isVisible().catch(() => false));

  await lightBtn.click();
  await page.waitForTimeout(1200);
  await shot(page, 'theme-07-light-applied');

  themeState = await getThemeState(page);
  report.add('切换回亮色主题（html.dark class 移除）', !themeState.isDark,
    `class=${themeState.isDark} storage="${themeState.stored}"`);
  report.add('亮色主题 localStorage 写入', themeState.stored === 'light', `"${themeState.stored}"`);

  // ---- 6. 在亮色主题下验证多页面持久化 ----
  await navigateTo(page, '/dashboard');
  themeState = await getThemeState(page);
  report.add('亮色主题 → 仪表盘持久化', !themeState.isDark && themeState.stored === 'light',
    `isDark=${themeState.isDark} stored="${themeState.stored}"`);
  await shot(page, 'theme-08-light-dashboard');

  // 邮箱页
  await navigateTo(page, '/mail');
  themeState = await getThemeState(page);
  report.add('亮色主题 → 邮箱页持久化', !themeState.isDark && themeState.stored === 'light',
    `isDark=${themeState.isDark} stored="${themeState.stored}"`);
  await shot(page, 'theme-09-light-mail');

  // ---- 7. 快速连续切换验证最终状态 ----
  await navigateTo(page, '/settings');
  await page.waitForTimeout(500);
  await page.locator('div.w-48 button').filter({ hasText: /外观/ }).first().click();
  await page.waitForTimeout(800);

  const darkBtn2 = page.locator('button').filter({ hasText: /深色|暗色/ }).first();
  const lightBtn2 = page.locator('button').filter({ hasText: /浅色|亮色/ }).first();

  await darkBtn2.click();
  await page.waitForTimeout(800);
  await lightBtn2.click();
  await page.waitForTimeout(800);
  await darkBtn2.click();
  await page.waitForTimeout(1200);

  themeState = await getThemeState(page);
  report.add('快速连续切换后最终停在暗色', themeState.isDark && themeState.stored === 'dark',
    `class=${themeState.isDark} storage="${themeState.stored}"`);
  await shot(page, 'theme-10-rapid-switch-final');

  // ---- 8. 验证 ThemeToggle 按钮（顶部/侧边栏） ----
  const toggleBtn = page.locator('button[aria-label*="主题"], button[title*="主题"]').first();
  if (await toggleBtn.isVisible().catch(() => false)) {
    const toggleIconBefore = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="主题"], button[title*="主题"]');
      if (!btn) return null;
      const svg = btn.querySelector('svg');
      return btn.textContent.trim() || (svg ? 'has-svg' : 'no-icon');
    });
    report.add('主题切换按钮存在', true, `icon=${toggleIconBefore}`);
  } else {
    report.add('主题切换按钮（侧边栏内未发现，仅设置页可切换）', true);
  }

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'theme-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/theme-switch-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
