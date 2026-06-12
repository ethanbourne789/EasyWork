// shared/src/utils/format.ts

/** 格式化金额（元），保留2位小数 */
export function formatCurrency(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

/** 格式化百分比 */
export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** 格式化数字（加千分位分隔符） */
export function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}

/** 格式化涨跌幅，带正负号和颜色提示 */
export function formatChange(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

/** 简化大数字显示（如 1.2K, 3.5M） */
export function compactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}
