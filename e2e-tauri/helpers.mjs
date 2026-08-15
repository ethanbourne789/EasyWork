// e2e-tauri/helpers.mjs
// E2E 测试公共工具：CDP 连接、错误收集、演示登录、导航、断言
// 依赖：EasyWork.exe 已启动且内置 additionalBrowserArgs=--remote-debugging-port=9222

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
  const link = page.locator('nav a').filter({ hasText: label }).first();
  await link.click();
  await page.waitForTimeout(1200);
}

// ---- 演示登录 ----
export async function demoLogin(page, { timeoutMs = 20000 } = {}) {
  const btn = page.locator('button').filter({ hasText: /演示/ }).first();
  await btn.click();
  // 等 URL 变为 /dashboard（含播种时间）
  await page.waitForURL('**/dashboard', { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(1500);
  return page.url();
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