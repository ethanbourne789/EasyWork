import { test, expect } from "@playwright/test";

test.describe("导航功能", () => {
  test.beforeEach(async ({ page }) => {
    // 使用演示账号登录
    await page.goto("/login");
    await page.getByRole("button", { name: "以演示账号进入" }).click();
    await page.waitForURL("**/dashboard");
  });

  test("应该能够导航到任务页", async ({ page }) => {
    await page.click('nav a:has-text("任务")');
    await page.waitForURL("**/tasks");
    await expect(page.locator("h1")).toContainText("任务");
  });

  test("应该能够导航到邮件页", async ({ page }) => {
    await page.click('nav a:has-text("邮件")');
    await page.waitForURL("**/mail");
    await expect(page.locator("h1")).toContainText("邮件");
  });

  test("应该能够导航到笔记页", async ({ page }) => {
    await page.click('nav a:has-text("笔记")');
    await page.waitForURL("**/notes");
    await expect(page.locator("h1")).toContainText("笔记");
  });

  test("应该能够导航到记账页", async ({ page }) => {
    await page.click('nav a:has-text("记账")');
    await page.waitForURL("**/finance");
    await expect(page.locator("h1")).toContainText("记账");
  });

  test("应该能够导航到日历页", async ({ page }) => {
    await page.click('nav a:has-text("日历")');
    await page.waitForURL("**/calendar");
    await expect(page.locator("h1")).toContainText("日历");
  });

  test("应该能够导航到设置页", async ({ page }) => {
    await page.click('nav a:has-text("设置")');
    await page.waitForURL("**/settings");
    await expect(page.locator("h1")).toContainText("设置");
  });
});
