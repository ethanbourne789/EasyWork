// e2e-tauri/navigation-all.mjs
// 全页面导航 E2E 验证：
//  1) 登录演示账户
//  2) 依次导航到每个页面：仪表盘、任务、邮箱、笔记、记账、日历、设置
//  3) 验证每个页面加载成功（检查 URL + 关键 DOM 元素）
//  4) 截取每个页面的截图
import { connect, collectErrors, demoLogin, shot, Report, expect } from './helpers.mjs';

const report = new Report();
let browser, page;
const errors = [];

const PAGES = [
  {
    path: '/dashboard',
    label: '仪表盘',
    checkDom: async (page) => {
      const text = await page.locator('body').textContent();
      return (text?.includes('早上好') || text?.includes('下午好') || text?.includes('晚上好') ||
        text?.includes('Good Morning') || text?.includes('Good Afternoon') ||
        text?.includes('Quick Actions') || text?.includes('快捷操作'));
    },
  },
  {
    path: '/tasks',
    label: '任务',
    checkDom: async (page) => {
      const text = await page.locator('body').textContent();
      return text?.includes('任务') || text?.includes('Task') || text?.includes('待办') || text?.includes('To Do');
    },
  },
  {
    path: '/mail',
    label: '邮箱',
    checkDom: async (page) => {
      const text = await page.locator('body').textContent();
      return text?.includes('邮箱') || text?.includes('Mail') || text?.includes('收件箱') || text?.includes('Inbox');
    },
  },
  {
    path: '/notes',
    label: '笔记',
    checkDom: async (page) => {
      const text = await page.locator('body').textContent();
      return text?.includes('笔记') || text?.includes('Note');
    },
  },
  {
    path: '/finance',
    label: '记账',
    checkDom: async (page) => {
      const text = await page.locator('body').textContent();
      return text?.includes('记账') || text?.includes('Finance') || text?.includes('账单') ||
        text?.includes('元') || text?.includes('¥');
    },
  },
  {
    path: '/calendar',
    label: '日历',
    checkDom: async (page) => {
      const text = await page.locator('body').textContent();
      return text?.includes('日历') || text?.includes('Calendar') || text?.includes('日程');
    },
  },
  {
    path: '/settings',
    label: '设置',
    checkDom: async (page) => {
      const text = await page.locator('body').textContent();
      return text?.includes('设置') || text?.includes('Settings') || text?.includes('个人资料') ||
        text?.includes('Profile');
    },
  },
];

try {
  ({ browser, page } = await connect());
  errors.push(...collectErrors(page));

  // ---- 1. 演示登录 ----
  const loginResult = await demoLogin(page);
  report.add('演示登录成功', loginResult === true);

  // ---- 2. 依次导航到每个页面 ----
  for (const pg of PAGES) {
    // 通过侧边栏链接导航
    const navLink = page.locator(`a[href="${pg.path}"]`).first();
    await navLink.click();
    await page.waitForTimeout(2000);

    // 验证 URL
    const urlOk = page.url().includes(pg.path);
    report.add(`${pg.label} 页面 URL 正确`, urlOk, `url=${page.url()}`);

    // 截图
    await shot(page, `navigation-all-${pg.path.replace('/', '').replace(/^\//, '')}`);

    // 验证关键 DOM 内容
    try {
      const domOk = await pg.checkDom(page);
      report.add(`${pg.label} 页面关键内容可见`, domOk);
    } catch (e) {
      report.add(`${pg.label} 页面 DOM 验证`, false, String(e?.message ?? e).slice(0, 120));
    }

    // 验证页面 body 文本长度（页面应有实质内容）
    const bodyLen = (await page.locator('body').textContent())?.length || 0;
    report.add(`${pg.label} 页面内容丰富`, bodyLen > 50, `bodyLength=${bodyLen}`);
  }

  await shot(page, 'navigation-all-final');

  // ---- 3. 验证侧边栏导航结构完整性 ----
  // 导航到 /dashboard 以确保侧边栏全部可见
  await page.evaluate(() => { window.location.href = '/dashboard'; });
  await page.waitForTimeout(1500);
  const navLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('nav a[href]'));
    return links.map((a) => ({ href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 20) }));
  });
  report.add('侧边栏导航链接完整', navLinks.length >= 5,
    `links=[${navLinks.map((l) => l.href).join(', ')}]`);

  // ---- 4. 移动端响应式验证 ----
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(800);

  // 移动端验证底部 Tab 或汉堡菜单
  const mobileNavCheck = await page.evaluate(() => {
    const hasHamburger = document.querySelector('button:has(svg)') !== null;
    const hasBottomTab = document.querySelector('[role="navigation"]') !== null;
    return { hasHamburger, hasBottomTab };
  });
  report.add('移动端导航结构', mobileNavCheck.hasHamburger || mobileNavCheck.hasBottomTab,
    `hamburger=${mobileNavCheck.hasHamburger} bottomTab=${mobileNavCheck.hasBottomTab}`);

  await shot(page, 'navigation-all-mobile');

  // 恢复桌面尺寸
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);

  // ---- 错误汇总 ----
  const fatal = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('DevTools')
  );
  report.add('全程 0 前端 JS 错误', fatal.length === 0,
    fatal.slice(0, 3).join(' | ').slice(0, 200));
} catch (e) {
  report.add('E2E 执行中断', false, String(e?.message ?? e).slice(0, 250));
  try { await shot(page, 'navigation-all-99-fatal'); } catch { /* ignore */ }
} finally {
  const summary = report.summary();
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync('e2e-screenshots', { recursive: true });
  writeFileSync('e2e-screenshots/navigation-all-report.json', JSON.stringify(summary, null, 2));
  await browser?.close().catch(() => {});
  process.exit(summary.fail > 0 ? 1 : 0);
}
