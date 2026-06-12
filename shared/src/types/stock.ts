// 股票模块共享类型（前端 + 后端 IPC 共用）

/** 实时行情（来自腾讯财经） */
export interface SinaQuote {
  symbol: string;
  name: string;
  price: number;
  open: number;
  /** 昨日收盘价 */
  closePrev: number;
  /** 涨跌额 = price - closePrev */
  change: number;
  /** 涨跌幅（百分数） */
  changePercent: number;
  high: number;
  low: number;
  /** 成交量，单位「手」 */
  volume: number;
  /** 成交额，单位「元」 */
  amount: number;
  /** 买一价 */
  bid: number;
  /** 卖一价 */
  ask: number;
}

/** K 线（蜡烛图）数据点 */
export interface KLinePoint {
  /** 形如 "2026-06-10" 或 "2026-06"（周/月聚合） */
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  /** 单位「手」 */
  volume: number;
}

/** 价格预警（IPC 传输格式） */
export interface StockAlert {
  id?: number;
  symbol: string;
  /** "a_stock" | "crypto" */
  marketType: string;
  /**
   * "price_above" | "price_below"
   * "pct_change_up" | "pct_change_down"
   */
  alertType: string;
  /** 阈值；price_* 时是绝对价，pct_change_* 时是百分数 */
  targetValue: number;
  isEnabled: boolean;
  /** 同一 alert 两次触发之间的最短间隔（分钟） */
  cooldownMinutes: number;
  lastTriggeredAt?: string | null;
  triggerCount: number;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 自选股 */
export interface StockWatchItem {
  id?: number;
  symbol: string;
  name: string;
  /** "a_stock" | "crypto" */
  marketType: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

/** 交易记录 */
export interface StockTrade {
  id?: number;
  symbol: string;
  /** "buy" | "sell" */
  tradeType: string;
  price: number;
  quantity: number;
  fee: number;
  tradedAt: string;
  note?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 当前持仓（聚合自 stock_trades） */
export interface StockPosition {
  symbol: string;
  name: string;
  marketType: string;
  totalQty: number;
  avgCost: number;
  realizedPnl: number;
}
