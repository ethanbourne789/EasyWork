// e2e-tauri/helpers.mjs
// E2E 测试公共工具：CDP 连接、错误收集、演示登录、导航、断言
// 依赖：EasyWork.exe 已使用 tauri-e2e.conf.json 构建（带 --remote-debugging-port=9222）
// 生产构建（tauri.conf.json）不再携带该调试端口，避免任意本地进程通过 CDP 接管 WebView。

import { chromium } from 'playwright';

export const SHOT_DIR = 'e2e-screenshots';

// ---- 连接 ----
// 动态探测 CDP 端口（9222 可能被旧实例残留占用 → 新实例落 9223/9224）
export async function findCdpPort(start = 9222, maxTry = 5) {
  for (let p = start; p < start + maxTry; p++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch(`http://127.0.0.1:${p}/json/version`, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) return p;
    } catch { /* try next */ }
  }
  throw new Error('未找到 CDP 端口（9222~9225）。确认 EasyWork.exe 已启动且带 --remote-debugging-port');
}

export async function connect(port) {
  const p = port ?? await findCdpPort();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${p}`);
  const ctx = browser.contexts()[0];
  const page = ctx?.pages().find(pg => pg.url().includes('tauri.localhost')) || ctx?.pages()[0];
  if (!page) throw new Error('未找到 EasyWork 页面');
  return { browser, page };
}

// ---- 错误收集 ----
export function collectErrors(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  return errors;
}

// ---- 导航 ----
export async function navTo(page, label) {
  // 标签到路径的映射
  const labelToPath = {
    '仪表': '/dashboard',
    '任务': '/tasks',
    '邮箱': '/mail',
    '笔记': '/notes',
    '记账': '/finance',
    '日历': '/calendar',
    '设置': '/settings',
  };
  
  const targetPath = labelToPath[label];
  if (!targetPath) {
    throw new Error(`未知页面标签: ${label}`);
  }
  
  // 如果已经在目标页面，跳过
  if (page.url().includes(targetPath)) {
    return;
  }
  
  // 方法1: 尝试直接通过 URL 导航（最快）
  try {
    await page.goto(`tauri://localhost${targetPath}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForTimeout(1500);
    return;
  } catch (e) {
    // URL 导航失败，尝试其他方法
  }
  
  // 方法2: 尝试通过 JavaScript 触发路由跳转
  try {
    await page.evaluate((path) => {
      window.location.href = path;
    }, targetPath);
    await page.waitForTimeout(1500);
    return;
  } catch (e) {
    // JS 导航也失败，尝试点击
  }
  
  // 方法3: 尝试展开侧边栏并点击
  try {
    // 尝试展开侧边栏
    const sidebarTrigger = page.locator('[data-state="closed"] button, [aria-label*="展开"], [aria-label*="toggle"]').first();
    if (await sidebarTrigger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await sidebarTrigger.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    
    // 现在尝试点击导航链接
    const link = page.locator('nav a').filter({ hasText: label }).first();
    await link.click({ timeout: 5000, force: true });
    await page.waitForTimeout(1200);
  } catch (e) {
    console.log(`    ⚠️  导航到 ${label} 失败，尝试直接评估`);
    // 最后尝试: 使用 React Router
    await page.evaluate((path) => {
      if (window.__router) {
        window.__router.navigate(path);
      } else {
        window.location.hash = path;
      }
    }, targetPath);
    await page.waitForTimeout(1500);
  }
}

// ---- 演示登录 ----
export async function demoLogin(page, { timeoutMs = 20000 } = {}) {
  // Check if already logged in (any route that is NOT login/register)
  const url = page.url();
  if (!url.includes('/login') && !url.includes('/register')) {
    return true; // already logged in
  }
  const btn = page.locator('button').filter({ hasText: /演示/ }).first();
  await btn.click();
  await page.waitForURL('**/dashboard', { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(1500);
  return true;
}

// ---- 断言工具 ----
export function expect(cond, msg) {
  if (!cond) throw new Error(`断言失败: ${msg}`);
}

export async function expectVisible(page, selector, msg) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  expect(await el.isVisible().catch(() => false), `${msg}（选择器: ${selector}）`);
}

export async function h1(page) {
  return (await page.locator('h1:visible').allTextContents()).map(s => s.trim()).filter(Boolean);
}

export async function bodyText(page) {
  return ((await page.locator('body').textContent()) || '').replace(/\s+/g, ' ').trim();
}

export async function shot(page, name) {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(SHOT_DIR, { recursive: true });
  const path = `${SHOT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  return path;
}

// ---- 报告 ----
export class Report {
  constructor() { this.cases = []; }
  add(name, ok, detail = '') {
    this.cases.push({ name, ok, detail });
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  }
  summary() {
    const pass = this.cases.filter(c => c.ok).length;
    console.log(`\n===== E2E 汇总: ${pass}/${this.cases.length} 通过 =====`);
    return { total: this.cases.length, pass, fail: this.cases.length - pass, cases: this.cases };
  }
}