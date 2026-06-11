/**
 * Sina Finance free API helpers.
 *
 * All requests are plain HTTP GET — Tauri desktop has no CORS,
 * so we can call them directly from the renderer.
 */

// ── Helpers ──

function buildSinaKey(symbol: string, marketType: string): string {
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
 * Fetch real-time quotes from Sina.
 * `symbols` can be ["600900","002459"] — we auto-prefix sh/sz.
 */
export async function fetchQuotes(
  symbols: { symbol: string; market_type: string }[]
): Promise<SinaQuote[]> {
  if (symbols.length === 0) return []

  const keys = symbols
    .map(s => buildSinaKey(s.symbol, s.market_type))
    .join(",")

  const url = `https://hq.sinajs.cn/list=${keys}`
  const resp = await fetch(url)
  const text = await resp.text()

  const quotes: SinaQuote[] = []
  // Each line: var hq_str_sh600900="长江电力,28.45,0.12,0.42,..."
  const lines = text.split("\n")
  for (const line of lines) {
    const m = line.match(/hq_str_([^=]+)="([^"]*)"/)
    if (!m) continue
    const sym = m[1]
    const parts = m[2].split(",")
    if (parts.length < 32) continue
    const price = parseFloat(parts[3]) || 0
    const closePrev = parseFloat(parts[2]) || 0
    const change = +(price - closePrev).toFixed(4)
    const changePercent = closePrev
      ? +((change / closePrev) * 100).toFixed(4)
      : 0
    quotes.push({
      symbol: sym,
      name: parts[0],
      price,
      open: parseFloat(parts[1]) || 0,
      close_prev: closePrev,
      change,
      changePercent,
      high: parseFloat(parts[4]) || 0,
      low: parseFloat(parts[5]) || 0,
      volume: parseInt(parts[8]) || 0,
      amount: parseInt(parts[9]) || 0,
      bid: parseFloat(parts[11]) || 0,
      ask: parseFloat(parts[21]) || 0,
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
 * `scale`: 5 / 15 / 30 / 60 (minutes), or 240 (daily), or "week" / "month".
 * Sina's API actually uses: scale=5/15/30/60/240, ma=5, datalen=N.
 */
export async function fetchKLine(
  symbol: string,
  marketType: string,
  scale: number = 240,
  datalen: number = 120,
): Promise<KLinePoint[]> {
  const key = buildSinaKey(symbol, marketType)
  const url =
    `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/` +
    `CN_MarketData.getKLineData?symbol=${key}` +
    `&scale=${scale}&ma=5&datalen=${datalen}`

  const resp = await fetch(url)
  const text = await resp.text()

  // Sina may return a BOM or plain array JSON
  const clean = text.replace(/^\uFEFF/, "")
  let raw: any[] = []
  try { raw = JSON.parse(clean) } catch { return [] }

  return raw.map((p: any) => ({
    date: p.day || p.date || "",
    open:  +p.open  || 0,
    close: +p.close || 0,
    high:  +p.high  || 0,
    low:   +p.low   || 0,
    volume: +p.volume || 0,
  }))
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
