/**
 * Sina Finance free API helpers.
 *
 * All requests are plain HTTP GET — Tauri desktop has no CORS,
 * so we can call them directly from the renderer.
 */

// ── Helpers ──

export function buildSinaKey(symbol: string, _marketType: string): string {
  if (symbol.startsWith("sh") || symbol.startsWith("sz")) return symbol
  // Auto-detect: 6xxxx = Shanghai, 0/3xxxx = Shenzhen
  const prefix = symbol.startsWith("6") ? "sh" : "sz"
  return prefix + symbol
}

// ── Real-time quotes (batch) ──

export interface SinaQuote {
  symbol: string
  name: string
  price: number
  open: number
  close_prev: number
  change: number
  changePercent: number
  high: number
  low: number
  volume: number   // 手
  amount: number   // 元
  bid: number
  ask: number
  // …extend if you need more fields
}

/**
 * Fetch real-time quotes from Tencent Finance API (free, no Referer required).
 * `symbols` can be ["600900","002459"] — we auto-prefix sh/sz.
 *
 * Tencent API: `https://qt.gtimg.cn/q=sh600900,sz002459`
 * Returns: v_sh600900="fields...";\nv_sz002459="fields...";
 * Fields are pipe (~) delimited, GBK encoded.
 */
export async function fetchQuotes(
  symbols: { symbol: string; market_type: string }[]
): Promise<SinaQuote[]> {
  if (symbols.length === 0) return []

  const keys = symbols
    .map(s => buildSinaKey(s.symbol, s.market_type))
    .join(",")

  const url = `https://qt.gtimg.cn/q=${keys}`
  const resp = await fetch(url)
  // Tencent returns GBK encoding — decode properly for Chinese names
  const buffer = await resp.arrayBuffer()
  const decoder = new TextDecoder("gbk")
  const text = decoder.decode(buffer)

  const quotes: SinaQuote[] = []
  // Each line: v_sh600900="...";\n"
  const lines = text.split("\n")
  for (const line of lines) {
    const m = line.match(/^v_([^=]+)="([^"]*)"/)
    if (!m) continue
    const sym = m[1]
    const parts = m[2].split("~")
    if (parts.length < 35) continue
    const price = parseFloat(parts[3]) || 0
    const closePrev = parseFloat(parts[4]) || 0
    const change = +(price - closePrev).toFixed(4)
    const changePercent = closePrev
      ? +((change / closePrev) * 100).toFixed(4)
      : 0
    const volumeShares = parseInt(parts[6]) || 0  // Tencent: shares
    quotes.push({
      symbol: sym,
      name: parts[1],   // Chinese name decoded from GBK
      price,
      open: parseFloat(parts[5]) || 0,
      close_prev: closePrev,
      change,
      changePercent,
      high: parseFloat(parts[33]) || 0,
      low: parseFloat(parts[34]) || 0,
      volume: Math.round(volumeShares / 100),  // Convert to 手
      amount: 0,
      bid: parseFloat(parts[9]) || 0,
      ask: parseFloat(parts[10]) || 0,
    })
  }
  return quotes
}

// ── K-line data ──

export interface KLinePoint {
  date: string   // "2026-06-10"
  open: number
  close: number
  high: number
  low: number
  volume: number
}

/**
 * Fetch K-line (candlestick) data from Sina.
 *
 * Sina's API uses numeric scale values:
 *   5 / 15 / 30 / 60 (minutes), 240 (daily)
 * For "week" / "month", we fetch more daily data and aggregate.
 */
export async function fetchKLine(
  symbol: string,
  marketType: string,
  scale: number | string = 240,
  datalen: number = 120,
): Promise<KLinePoint[]> {
  const key = buildSinaKey(symbol, marketType)

  // Handle week/month by aggregating daily data
  const isWeek = scale === "week" || scale === "month"
  const actualScale = isWeek ? 240 : scale
  const actualDatalen = isWeek ? 365 : datalen

  const url =
    `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/` +
    `CN_MarketData.getKLineData?symbol=${key}` +
    `&scale=${actualScale}&ma=5&datalen=${actualDatalen}`

  const resp = await fetch(url)
  const text = await resp.text()

  // Sina may return a BOM or plain array JSON
  const clean = text.replace(/^\uFEFF/, "")
  let raw: any[] = []
  try { raw = JSON.parse(clean) } catch { return [] }
  if (!Array.isArray(raw) || raw.length === 0) return []

  let points: KLinePoint[] = raw.map((p: any) => ({
    date: p.day || p.date || "",
    open:  +p.open  || 0,
    close: +p.close || 0,
    high:  +p.high  || 0,
    low:   +p.low   || 0,
    volume: +p.volume || 0,
  }))

  // Aggregate weekly / monthly if needed
  if (scale === "week") {
    points = aggregateKLine(points, 5)  // ~5 trading days per week
  } else if (scale === "month") {
    points = aggregateKLineByMonth(points)
  }

  return points
}

/**
 * Aggregate daily K-line points into calendar months.
 * Groups by year-month, computes OHLCV from the daily candles in that month.
 */
function aggregateKLineByMonth(data: KLinePoint[]): KLinePoint[] {
  const groups = new Map<string, KLinePoint[]>()
  for (const p of data) {
    // date format: "2026-06-10"
    const monthKey = p.date.slice(0, 7) // "2026-06"
    if (!groups.has(monthKey)) groups.set(monthKey, [])
    groups.get(monthKey)!.push(p)
  }
  const result: KLinePoint[] = []
  // Iterate sorted by month key
  const sortedKeys = Array.from(groups.keys()).sort()
  for (const key of sortedKeys) {
    const slice = groups.get(key)!
    result.push({
      date: key, // show "2026-06" instead of "2026-06-01" for clarity
      open: slice[0].open,
      close: slice[slice.length - 1].close,
      high: Math.max(...slice.map(p => p.high)),
      low: Math.min(...slice.map(p => p.low)),
      volume: slice.reduce((s, p) => s + p.volume, 0),
    })
  }
  return result
}

/** Aggregate daily K-line points into larger periods */
function aggregateKLine(data: KLinePoint[], groupSize: number): KLinePoint[] {
  const result: KLinePoint[] = []
  for (let i = 0; i < data.length; i += groupSize) {
    const slice = data.slice(i, i + groupSize)
    if (slice.length === 0) break
    result.push({
      date: slice[0].date,
      open: slice[0].open,
      close: slice[slice.length - 1].close,
      high: Math.max(...slice.map(p => p.high)),
      low: Math.min(...slice.map(p => p.low)),
      volume: slice.reduce((s, p) => s + p.volume, 0),
    })
  }
  return result
}

// ── Announcements (scrape helpers — Sina has no clean JSON API) ──

/**
 * Announcement list — Sina's HTML page; we return the URL and let the
 * frontend open it in a shadow DOM / iframe, or we scrape server-side later.
 * For now, just construct the URL.
 */
export function buildAnnouncementUrl(symbol: string, marketType: string): string {
  const key = buildSinaKey(symbol, marketType)
  // Sina announcement page
  return `https://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllNewsStock/symbol/${key}.phtml`
}

/** Crypto quote (Sina) — e.g. "btcusd" */
export async function fetchCryptoQuote(symbol: string): Promise<{
  symbol: string; name: string; price: number; change: number; changePercent: number
} | null> {
  // Sina uses format like "btcusd" for crypto
  const url = `https://hq.sinajs.cn/list=${symbol}`
  const resp = await fetch(url)
  const text = await resp.text()
  const m = text.match(/hq_str_([^=]+)="([^"]*)"/)
  if (!m || !m[2]) return null
  const parts = m[2].split(",")
  const price = parseFloat(parts[0]) || 0
  const change = parseFloat(parts[1]) || 0
  const changePercent = parseFloat(parts[2]) || 0
  return { symbol: m[1], name: symbol.toUpperCase(), price, change, changePercent }
}
