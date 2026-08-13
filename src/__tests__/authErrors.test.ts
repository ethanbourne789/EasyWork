import { describe, it, expect } from "vitest";
import { friendlyAuthError } from "@/lib/authErrors";

describe("friendlyAuthError (P1 #4 登录/注册错误不再静默回退)", () => {
  it("无效凭据映射为中文提示", () => {
    expect(friendlyAuthError(new Error("Invalid login credentials"))).toBe(
      "邮箱或密码错误，请重试。"
    );
    expect(friendlyAuthError(new Error("invalid credentials"))).toBe(
      "邮箱或密码错误，请重试。"
    );
    expect(friendlyAuthError(new Error("password is incorrect"))).toBe(
      "邮箱或密码错误，请重试。"
    );
  });

  it("邮箱已注册", () => {
    expect(friendlyAuthError(new Error("User already registered"))).toBe(
      "该邮箱已注册，请直接登录。"
    );
  });

  it("网络错误", () => {
    expect(friendlyAuthError(new Error("network request failed"))).toBe(
      "网络错误，请检查连接后重试。"
    );
    expect(friendlyAuthError(new Error("Failed to fetch"))).toBe(
      "网络错误，请检查连接后重试。"
    );
  });

  it("邮箱格式错误", () => {
    expect(friendlyAuthError(new Error("Email address is invalid"))).toBe(
      "邮箱格式不正确或无法接收验证邮件。"
    );
  });

  it("兜底消息与非 Error 输入", () => {
    expect(friendlyAuthError(new Error("unknown issue"))).toBe("操作失败，请稍后重试。");
    expect(friendlyAuthError(null)).toBe("操作失败，请稍后重试。");
    expect(friendlyAuthError("some string")).toBe("操作失败，请稍后重试。");
  });
});
