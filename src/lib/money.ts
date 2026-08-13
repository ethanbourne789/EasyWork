/**
 * 金额工具：统一以「整数分」做四舍五入与累加，规避 JS 浮点 `toFixed`
 * 在 `x.xx5` 边界向下取整（如 Number(1.005).toFixed(2) === "1.00"）以及
 * 长链求和的二进制漂移。数据库 amount 为 numeric，前端以 number 接收，
 * 展示与汇总一律经过此处，保证财务数字正确且一致。
 */

/** 四舍五入到 2 位小数（稳健的 half-up，规避二进制舍入陷阱）。 */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** 以整数分累加，避免浮点长链漂移。 */
export function sumMoney(amounts: number[]): number {
  const cents = amounts.reduce((s, a) => s + Math.round(a * 100), 0);
  return cents / 100;
}

/**
 * 格式化为 ¥1,234.56（始终 2 位小数 + 千分位）。
 *
 * @param showSign - 为 true 时，在金额前显示 `+` / `-`（零不显示符号）。
 *                   交易列表等业务场景通常手动加 sign，保持默认 false。
 */
export function formatMoney(amount: number, showSign = false): string {
  const r = roundMoney(amount);
  const abs = Math.abs(r);
  const str = abs.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = showSign && r !== 0 ? (r > 0 ? '+' : '-') : '';
  return `${sign}¥${str}`;
}
