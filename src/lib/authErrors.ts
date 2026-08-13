/**
 * 将 Supabase 鉴权错误转换为对用户友好的中文提示。
 * 用于登录 / 注册失败时不静默回退，而是明确告知原因。
 */
export function friendlyAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();
  if (
    lower.includes("invalid login") ||
    lower.includes("invalid credentials") ||
    lower.includes("password")
  ) {
    return "邮箱或密码错误，请重试。";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "该邮箱已注册，请直接登录。";
  }
  if (lower.includes("email") && lower.includes("invalid")) {
    return "邮箱格式不正确或无法接收验证邮件。";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "网络错误，请检查连接后重试。";
  }
  return "操作失败，请稍后重试。";
}
