/**
 * vCard 3.0 / 4.0 解析与生成。
 *
 * 设计目标：
 * - 纯前端、无依赖（避免引入 vcard npm 包的供应链风险）
 * - 覆盖 RFC 6350 中 90% 真实数据（FN / N / EMAIL / TEL / ORG / NOTE / CATEGORIES）
 * - 严格处理：折叠行（CRLF + 空格/制表符）、参数（TYPE=WORK,CHARSET=UTF-8）、QUOTED-PRINTABLE
 *   解码、UTF-8 + ASCII 兼容
 *
 * 不覆盖的（YAGNI）：
 * - AGENT / PHOTO / LOGO / SOUND / KEY / URL 等大对象属性（v1 仅文本字段）
 * - vCard 4.0 的 KIND / XML 编码（v1 接受 v3.0 + v4.0 文本，输出统一 v3.0）
 *
 * 兼容性：
 * - 输入容忍 BOM、CRLF/LF/CR、嵌套引号
 * - 输出稳定 3.0 格式（Outlook/邮件程序兼容性最好）
 */

export interface VcfAddress {
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface VcfContact {
  /** 显示名（FN 属性）。 */
  fullName: string;
  /** 结构化姓名（解析 N 属性）：姓 / 名 / 中间名 / 前缀 / 后缀。 */
  structuredName?: {
    family: string;
    given: string;
    middle?: string;
    prefix?: string;
    suffix?: string;
  };
  /** 邮箱列表（保留 TYPE 标签）。 */
  emails: Array<{ value: string; types: string[] }>;
  /** 电话列表。 */
  phones: Array<{ value: string; types: string[] }>;
  /** 组织 / 部门。 */
  organization?: string;
  /** 备注。 */
  note?: string;
  /** 分类 / 分组。 */
  categories: string[];
  /** 地址列表。 */
  addresses: VcfAddress[];
  /** 原始未识别属性，便于诊断。 */
  raw: Record<string, string[]>;
}

/* ────────────────────────── 解析 ────────────────────────── */

/** Quoted-printable 解码（含软换行 =CRLF）。 */
function decodeQuotedPrintable(input: string): string {
  // 1) 软换行：= 后跟 CRLF 或 LF → 删除
  let s = input.replace(/=(?:\r\n|\r|\n)/g, "")
  // 2) 十六进制转义：=XX → byte
  s = s.replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  )
  // 3) 字节 → 字符串（按 UTF-8 解码；如果 bytes 不是合法 UTF-8 则退回 latin1）
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(s, (c) => c.charCodeAt(0)),
    )
  } catch {
    return s
  }
}

/** 解码属性值：先尝试 QP（= 开头），否则按 UTF-8 直接读。 */
function decodeValue(raw: string, charset?: string): string {
  const trimmed = raw.replace(/[\r\n]+$/, "")
  if (/=[0-9A-Fa-f]{2}/.test(trimmed) || /=(?:\r\n|\r|\n)/.test(trimmed)) {
    return decodeQuotedPrintable(trimmed)
  }
  if (charset && /utf-?8/i.test(charset)) {
    return trimmed
  }
  return trimmed
}

/** 解析参数段。返回 { name: types[], charset?: string, ... }。 */
function parseParams(paramStr: string): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {}
  if (!paramStr) return params
  // 用 ; 拆分参数；处理 TYPE="A,B" 嵌套 + TYPE=A,B
  // 关键：; 仅在顶层分隔，quoted 内的 ; 不拆
  const parts: string[] = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < paramStr.length; i++) {
    const ch = paramStr[i]
    if (ch === '"') { inQuote = !inQuote; cur += ch; continue }
    if (ch === ";" && !inQuote) { parts.push(cur); cur = ""; continue }
    cur += ch
  }
  if (cur.length > 0) parts.push(cur)
  for (const part of parts) {
    const eq = part.indexOf("=")
    let key: string
    let value: string
    if (eq === -1) {
      // TYPE=WORK 简写（无 KEY=）— RFC 允许；视为 TYPE=key
      key = "TYPE"
      value = part.trim()
    } else {
      key = part.slice(0, eq).trim().toUpperCase()
      value = part.slice(eq + 1).trim()
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1)
      }
    }
    if (key === "TYPE") {
      const types = value.split(",").map((t) => t.trim()).filter(Boolean)
      params[key] = types
    } else {
      params[key] = value
    }
  }
  return params
}

/**
 * 按 RFC 6350 折叠：CRLF + WSP 视为逻辑换行。合并到上一行末尾并保留前导 WSP。
 *
 * RFC 6350 4.1：CRLF 后跟 WSP（SPACE / HTAB）→ 移除 CRLF，**保留 WSP 作为内容**。
 * 例如 "a\r\n b" → "a b"（保留一个空格）。
 */
function unfoldLines(text: string): string {
  return text.replace(/\r?\n([ \t])/g, "$1")
}

/** 把一行属性拆成 [name, params, value]。 */
function splitLine(line: string): { name: string; params: string; value: string } {
  // 第一个 : 之前是 name;params，之后是 value
  const colon = line.indexOf(":")
  if (colon === -1) {
    return { name: line.toUpperCase().trim(), params: "", value: "" }
  }
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const headParts = head.split(";")
  const name = headParts[0].trim().toUpperCase()
  const params = headParts.slice(1).join(";")
  return { name, params, value }
}

/**
 * 解析 vCard 文本（可能包含 BEGIN:VCARD ... END:VCARD 多张）。
 *
 * 返回 VcfContact[]。每张卡片开始于 `BEGIN:VCARD` 结束于 `END:VCARD`。
 *
 * @example
 *   const contacts = parseVcf(`BEGIN:VCARD
 * VERSION:3.0
 * FN:张三
 * EMAIL:zhangsan@x.com
 * END:VCARD`)
 */
export function parseVcf(input: string): VcfContact[] {
  if (!input) return []
  // 去掉 BOM
  let text = input.replace(/^\uFEFF/, "")
  // 统一换行
  text = text.replace(/\r\n?/g, "\n")
  // 折叠
  text = unfoldLines(text)
  const lines = text.split("\n")

  const cards: VcfContact[] = []
  let cur: Partial<VcfContact> | null = null
  let raw: Record<string, string[]> = {}

  const finalize = () => {
    if (!cur) return
    // FN 缺失时回退到 N.first + N.last
    if (!cur.fullName && cur.structuredName) {
      const n = cur.structuredName
      cur.fullName = [n.prefix, n.given, n.middle, n.family, n.suffix]
        .filter(Boolean)
        .join(" ")
    }
    if (!cur.fullName) cur.fullName = ""
    cur.emails = cur.emails ?? []
    cur.phones = cur.phones ?? []
    cur.categories = cur.categories ?? []
    cur.addresses = cur.addresses ?? []
    cur.raw = raw
    cards.push(cur as VcfContact)
    cur = null
    raw = {}
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const upper = line.toUpperCase()
    if (upper === "BEGIN:VCARD") {
      cur = {
        fullName: "",
        emails: [],
        phones: [],
        categories: [],
        addresses: [],
      }
      raw = {}
      continue
    }
    if (upper === "END:VCARD") {
      finalize()
      continue
    }
    if (!cur) continue

    const { name, params, value } = splitLine(line)
    const pmap = parseParams(params)
    const charset = typeof pmap.CHARSET === "string" ? pmap.CHARSET : undefined
    const types = Array.isArray(pmap.TYPE) ? pmap.TYPE : []
    const decoded = decodeValue(value, charset)

    if (name === "VERSION") continue
    if (name === "FN") {
      // 反义 \; → ;，\\, → ,，\\n → newline，\\\\ → \
      // 关键：\\\\ 必须先于其它替换（避免 \\; 被错解为 \; → ; 而非 \ + ;）
      const unesc = (s: string) => s
        .replace(/\\\\/g, "\u0001")
        .replace(/\\;/g, ";")
        .replace(/\\,/g, ",")
        .replace(/\\n/gi, "\n")
        .replace(/\u0001/g, "\\")
      cur.fullName = unesc(decoded)
    } else if (name === "N") {
      // N:Family;Given;Middle;Prefix;Suffix
      // 关键：必须先 unescape 整个 value（恢复 \; 为 ;），再 split；
      // 否则 "Acme\;研发部" 会被 split 拆成 ["Acme\", "研发部"]，丢 \; 上下文。
      const unesc = (s: string) => s.replace(/\\\\/g, "\u0001").replace(/\\;/g, ";").replace(/\\,/g, ",").replace(/\\n/gi, "\n").replace(/\u0001/g, "\\")
      const unescaped = unesc(decoded)
      const parts = unescaped.split(";")
      cur.structuredName = {
        family: parts[0] ?? "",
        given: parts[1] ?? "",
        middle: parts[2] || undefined,
        prefix: parts[3] || undefined,
        suffix: parts[4] || undefined,
      }
    } else if (name === "EMAIL") {
      cur.emails!.push({ value: decoded.toLowerCase(), types })
    } else if (name === "TEL") {
      cur.phones!.push({ value: decoded, types })
    } else if (name === "ORG") {
      // ORG:Company;Department
      // 关键：unescape 整个 value 再 split（同 N 的修复）。
      // 保留原 `;` 分隔符（结构化字段）— UI 层用别的 separator 渲染。
      const unesc = (s: string) => s.replace(/\\\\/g, "\u0001").replace(/\\;/g, ";").replace(/\\,/g, ",").replace(/\\n/gi, "\n").replace(/\u0001/g, "\\")
      const unescaped = unesc(decoded)
      cur.organization = unescaped.split(";").filter(Boolean).join(";")
    } else if (name === "NOTE") {
      const unesc = (s: string) => s
        .replace(/\\\\/g, "\u0001")
        .replace(/\\;/g, ";")
        .replace(/\\,/g, ",")
        .replace(/\\n/gi, "\n")
        .replace(/\u0001/g, "\\")
      cur.note = unesc(decoded)
    } else if (name === "CATEGORIES") {
      // CATEGORIES:Work,Family — ; 也可以出现在 value 中（用于项内转义）
      // 关键：先 unescape 整个 value（恢复 \, → ,），再 split，避免 \; 切错
      const unesc = (s: string) => s.replace(/\\\\/g, "\u0001").replace(/\\;/g, ";").replace(/\\,/g, ",").replace(/\\n/gi, "\n").replace(/\u0001/g, "\\")
      const unescaped = unesc(decoded)
      cur.categories = unescaped.split(",").map((s) => s.trim()).filter(Boolean)
    } else if (name === "ADR") {
      // ADR:PO Box;Extended;Street;City;Region;Postal;Country
      const parts = decoded.split(";")
      cur.addresses!.push({
        street: [parts[2], parts[1]].filter(Boolean).join(" ") || undefined,
        city: parts[3] || undefined,
        region: parts[4] || undefined,
        postalCode: parts[5] || undefined,
        country: parts[6] || undefined,
      })
    }
    if (!raw[name]) raw[name] = []
    raw[name].push(decoded)
  }
  return cards
}

/* ────────────────────────── 生成 ────────────────────────── */

function escapeVcfText(s: string): string {
  // RFC 6350 必转义：\ , ; 换行
  // 反斜杠本身要首先转义
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
}

/** 软换行（≤75 字节）— RFC 6350 4.1。 */
function foldLine(line: string): string {
  if (line.length <= 75) return line
  const out: string[] = []
  let i = 0
  while (i < line.length) {
    const isFirst = i === 0
    const take = isFirst ? 75 : 74
    let chunk = line.slice(i, i + take)
    if (!isFirst) {
      // 续行：去掉上一段末尾多余的空格，避免和续行的前导空格叠加成双空格
      if (out.length > 0 && out[out.length - 1].endsWith(" ")) {
        out[out.length - 1] = out[out.length - 1].replace(/ +$/, "")
      }
      chunk = " " + chunk
    }
    out.push(chunk)
    i += take
  }
  return out.join("\r\n")
}

/**
 * 把 VcfContact[] 序列化为 vCard 3.0 字符串。
 *
 * 每张卡片：BEGIN:VCARD / VERSION:3.0 / FN / N / EMAIL/TEL/... / END:VCARD，
 * 用 \r\n 分隔。
 */
export function serializeVcf(contacts: readonly VcfContact[]): string {
  const lines: string[] = []
  for (const c of contacts) {
    lines.push("BEGIN:VCARD")
    lines.push("VERSION:3.0")
    lines.push(foldLine(`FN:${escapeVcfText(c.fullName)}`))
    if (c.structuredName) {
      const n = c.structuredName
      lines.push(
        `N:${escapeVcfText(n.family)};${escapeVcfText(n.given)};${escapeVcfText(n.middle ?? "")};${escapeVcfText(n.prefix ?? "")};${escapeVcfText(n.suffix ?? "")}`,
      )
    }
    for (const e of c.emails) {
      if (!e.value) continue
      const typePart = e.types.length > 0 ? `;TYPE=${e.types.join(",")}` : ""
      lines.push(foldLine(`EMAIL${typePart}:${e.value}`))
    }
    for (const p of c.phones) {
      if (!p.value) continue
      const typePart = p.types.length > 0 ? `;TYPE=${p.types.join(",")}` : ""
      lines.push(foldLine(`TEL${typePart}:${p.value}`))
    }
    if (c.organization) {
      lines.push(foldLine(`ORG:${escapeVcfText(c.organization)}`))
    }
    if (c.note) {
      lines.push(foldLine(`NOTE:${escapeVcfText(c.note)}`))
    }
    if (c.categories.length > 0) {
      lines.push(
        foldLine(
          `CATEGORIES:${c.categories.map((cat) => escapeVcfText(cat)).join(",")}`,
        ),
      )
    }
    for (const a of c.addresses) {
      const adr = [
        "", // PO Box
        "", // Extended
        escapeVcfText(a.street ?? ""),
        escapeVcfText(a.city ?? ""),
        escapeVcfText(a.region ?? ""),
        escapeVcfText(a.postalCode ?? ""),
        escapeVcfText(a.country ?? ""),
      ].join(";")
      lines.push(foldLine(`ADR:${adr}`))
    }
    lines.push("END:VCARD")
  }
  return lines.join("\r\n")
}
