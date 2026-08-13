import { test, expect } from "@playwright/test";

test.describe("认证流程", () => {
  test("应该能够访问登录页", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1")).toContainText("登录 EasyWork");
  });

  test("应该能够访问注册页", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("h1")).toContainText("注册 EasyWork");
  });

  test("登录表单应该包含邮箱和密码字段", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByPlaceholder("邮箱")).toBeVisible();
    await expect(page.getByPlaceholder("密码")).toBeVisible();
    await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
  });

  test("注册表单应该包含必要字段", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByPlaceholder("邮箱")).toBeVisible();
    await expect(page.getByPlaceholder("密码")).toBeVisible();
    await expect(page.getByPlaceholder("确认密码")).toBeVisible();
    await expect(page.getByRole("button", { name: "注册" })).toBeVisible();
  });
});
