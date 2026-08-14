// iCalendar (RFC 5545) 解析器：供 sync-calendar 解析 ICS 订阅与 CalDAV 返回的日历数据。
//
// 覆盖范围（按真实日历服务的常见用法取舍）：
//   · 折行还原（RFC 5545 §3.1：CRLF + 空格/制表符为续行）
//   · VEVENT 属性：UID / SUMMARY / DESCRIPTION / LOCATION / ORGANIZER /
//     DTSTART / DTEND / DURATION / RRULE / EXDATE / STATUS
//   · 三种时间形态：VALUE=DATE 全天、以 Z 结尾的 UTC、带 TZID 的地方时
//   · 周期规则展开：FREQ=DAILY|WEEKLY|MONTHLY|YEARLY + INTERVAL / COUNT /
//     UNTIL / BYDAY（周：MO,WE；月：2TU、-1FR）/ EXDATE
//
// 不支持（遇到时按单次事件处理，不致命）：BYSETPOS、BYMONTH 多值组合、
// VTIMEZONE 自定义时区定义（改用 IANA TZID + Intl 解析）、RECURRENCE-ID 覆盖。

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  organizer?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  /** 由周期规则展开而来的实例（外部 UID 需附加实例时间以避免主键冲突） */
  recurrenceInstance?: boolean;
}

/** 全天事件与无时区信息的浮动时间，按此时区落地（面向国内用户） */
export const DEFAULT_TZ = "Asia/Shanghai";

const MAX_OCCURRENCES = 500;

// ---------------------------------------------------------------------------
// 时区换算：用 Intl 拿到 IANA 时区在某一刻的偏移，避免引入 tz 依赖
// ---------------------------------------------------------------------------

function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUTC - instant.getTime();
}

/** 把「某时区的墙上时间」转为绝对时刻；二次逼近以正确处理夏令时边界 */
export function zonedTimeToUtc(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  tz: string,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let ts = guess - tzOffsetMs(new Date(guess), tz);
  ts = guess - tzOffsetMs(new Date(ts), tz);
  return new Date(ts);
}

// ---------------------------------------------------------------------------
// 词法层
// ---------------------------------------------------------------------------

/** 还原折行：续行以空格或制表符开头 */
function unfold(text: string): string[] {
  // 解码 HTML 实体编码（钉钉 CalDAV 等服务器使用）
  const decoded = text
    .replace(/&#13;/g, "\r")
    .replace(/&#10;/g, "\n")
    .replace(/&#9;/g, "\t")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  const normalized = decoded.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const out: string[] = [];
  for (const line of normalized.split("\n")) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

interface IcsLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(raw: string): IcsLine | null {
  // 参数值可能带引号且含冒号（如 TZID="GMT+08:00"），故需跳过引号内的冒号
  let colon = -1;
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;

  const head = raw.slice(0, colon);
  const value = raw.slice(colon + 1);
  const segments: string[] = [];
  let cur = "";
  inQuotes = false;
  for (const c of head) {
    if (c === '"') inQuotes = !inQuotes;
    if (c === ";" && !inQuotes) {
      segments.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  segments.push(cur);

  const name = segments[0].toUpperCase();
  const params: Record<string, string> = {};
  for (const seg of segments.slice(1)) {
    const eq = seg.indexOf("=");
    if (eq === -1) continue;
    params[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name, params, value };
}

/** 反转义 RFC 5545 文本值 */
function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// ---------------------------------------------------------------------------
// 时间值解析
// ---------------------------------------------------------------------------

interface ParsedDate {
  date: Date;
  dateOnly: boolean;
}

function parseIcsDate(line: IcsLine, fallbackTz: string): ParsedDate | null {
  const v = line.value.trim();
  const dateOnly = line.params.VALUE === "DATE" || /^\d{8}$/.test(v);

  if (dateOnly) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    // 全天事件锚定到目标时区的当日 0 点，避免客户端按 UTC 渲染时错位一天
    return {
      date: zonedTimeToUtc(+m[1], +m[2], +m[3], 0, 0, 0, fallbackTz),
      dateOnly: true,
    };
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), dateOnly: false };

  const tz = line.params.TZID || fallbackTz;
  let date: Date;
  try {
    date = zonedTimeToUtc(+y, +mo - 1 + 1, +d, +h, +mi, +s, tz);
  } catch {
    // TZID 不是合法 IANA 名称（部分服务会写 "China Standard Time"）时退回默认时区
    date = zonedTimeToUtc(+y, +mo, +d, +h, +mi, +s, fallbackTz);
  }
  return { date, dateOnly: false };
}

/** ISO 8601 duration → 毫秒，例如 PT1H30M、P1D */
function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const ms =
    (Number(m[2] ?? 0) * 7 * 86400 +
      Number(m[3] ?? 0) * 86400 +
      Number(m[4] ?? 0) * 3600 +
      Number(m[5] ?? 0) * 60 +
      Number(m[6] ?? 0)) *
    1000;
  return sign * ms;
}

// ---------------------------------------------------------------------------
// 周期规则展开
// ---------------------------------------------------------------------------

const WEEKDAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRruleParts(rrule: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of rrule.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return out;
}

/** 取某月中第 n 个（n<0 表示倒数）星期 wd 的日期，越界返回 null */
function nthWeekdayOfMonth(year: number, month: number, wd: number, n: number): Date | null {
  if (n > 0) {
    const first = new Date(Date.UTC(year, month, 1));
    const shift = (wd - first.getUTCDay() + 7) % 7;
    const day = 1 + shift + (n - 1) * 7;
    const probe = new Date(Date.UTC(year, month, day));
    return probe.getUTCMonth() === month ? probe : null;
  }
  const last = new Date(Date.UTC(year, month + 1, 0));
  const shift = (last.getUTCDay() - wd + 7) % 7;
  const day = last.getUTCDate() - shift + (n + 1) * 7;
  if (day < 1) return null;
  return new Date(Date.UTC(year, month, day));
}

/**
 * 展开周期事件在 [windowStart, windowEnd] 内的所有实例开始时间。
 * 以「相对 DTSTART 的偏移」推进，保持每个实例的时刻与原事件一致。
 */
function expandRecurrence(
  start: Date,
  rrule: string,
  exDates: Set<number>,
  windowStart: Date,
  windowEnd: Date,
): Date[] {
  const p = parseRruleParts(rrule);
  const freq = (p.FREQ || "").toUpperCase();
  if (!freq) return [start];

  const interval = Math.max(1, Number(p.INTERVAL ?? 1) || 1);
  const count = p.COUNT ? Number(p.COUNT) : undefined;
  let until: Date | undefined;
  if (p.UNTIL) {
    const u = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(p.UNTIL);
    if (u) {
      until = new Date(
        Date.UTC(+u[1], +u[2] - 1, +u[3], +(u[4] ?? 23), +(u[5] ?? 59), +(u[6] ?? 59)),
      );
    }
  }

  const results: Date[] = [];
  const hardEnd = until && until < windowEnd ? until : windowEnd;

  const push = (d: Date): boolean => {
    if (d < windowStart) return true;
    if (d > hardEnd) return false;
    if (!exDates.has(d.getTime())) results.push(d);
    return true;
  };

  const byDay = (p.BYDAY || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (freq === "DAILY") {
    const intervalMs = interval * 86400000;
    // 计算到窗口起点的跳过次数，避免对历史悠久的事件迭代过多
    let skipCount = 0;
    if (start.getTime() < windowStart.getTime()) {
      const skipMs = windowStart.getTime() - start.getTime();
      skipCount = Math.floor(skipMs / intervalMs);
    }
    for (let i = skipCount; i < skipCount + MAX_OCCURRENCES; i++) {
      if (count !== undefined && i >= count) break;
      const d = new Date(start.getTime() + i * intervalMs);
      if (!push(d)) break;
    }
  } else if (freq === "WEEKLY") {
    // BYDAY 指定一周内的哪几天；缺省沿用 DTSTART 的星期
    const targets = byDay.length
      ? byDay.map((t) => WEEKDAY_INDEX[t.slice(-2).toUpperCase()]).filter((n) => n !== undefined)
      : [start.getUTCDay()];
    // 以 DTSTART 所在周的周日为锚，逐周推进
    const anchor = new Date(start.getTime() - start.getUTCDay() * 86400000);
    let emitted = 0;
    // 跳过窗口之前的周，避免迭代过多（仅无 COUNT 限制时；COUNT 本身已限定迭代上限）
    let startWeek = 0;
    if (count === undefined && start.getTime() < windowStart.getTime()) {
      const weekMs = interval * 7 * 86400000;
      startWeek = Math.floor((windowStart.getTime() - start.getTime()) / weekMs);
    }
    outer: for (let w = startWeek; w < startWeek + MAX_OCCURRENCES; w++) {
      for (const wd of [...targets].sort((a, b) => a - b)) {
        const d = new Date(anchor.getTime() + (w * interval * 7 + wd) * 86400000);
        if (d < start) continue;
        if (count !== undefined && emitted >= count) break outer;
        emitted++;
        if (!push(d)) break outer;
      }
    }
  } else if (freq === "MONTHLY") {
    const ordinalDay = byDay.length ? /^(-?\d+)([A-Z]{2})$/.exec(byDay[0].toUpperCase()) : null;
    let emitted = 0;
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      if (count !== undefined && emitted >= count) break;
      const base = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i * interval, 1),
      );
      let d: Date | null;
      if (ordinalDay) {
        const wd = WEEKDAY_INDEX[ordinalDay[2]];
        const nth = nthWeekdayOfMonth(base.getUTCFullYear(), base.getUTCMonth(), wd, +ordinalDay[1]);
        d = nth
          ? new Date(
              Date.UTC(
                nth.getUTCFullYear(),
                nth.getUTCMonth(),
                nth.getUTCDate(),
                start.getUTCHours(),
                start.getUTCMinutes(),
                start.getUTCSeconds(),
              ),
            )
          : null;
      } else {
        // 同「日」；该月无此日（如 31 号遇到小月）则跳过，符合 RFC 行为
        const dom = start.getUTCDate();
        const probe = new Date(
          Date.UTC(
            base.getUTCFullYear(),
            base.getUTCMonth(),
            dom,
            start.getUTCHours(),
            start.getUTCMinutes(),
            start.getUTCSeconds(),
          ),
        );
        d = probe.getUTCMonth() === base.getUTCMonth() ? probe : null;
      }
      if (!d) continue;
      if (d < start) continue;
      emitted++;
      if (!push(d)) break;
    }
  } else if (freq === "YEARLY") {
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      if (count !== undefined && i >= count) break;
      const d = new Date(
        Date.UTC(
          start.getUTCFullYear() + i * interval,
          start.getUTCMonth(),
          start.getUTCDate(),
          start.getUTCHours(),
          start.getUTCMinutes(),
          start.getUTCSeconds(),
        ),
      );
      if (!push(d)) break;
    }
  } else {
    return [start];
  }

  return results;
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 解析 ICS 文本，返回窗口区间内的事件（周期事件已展开为多个实例）。
 */
export function parseIcs(
  text: string,
  windowStart: Date,
  windowEnd: Date,
  fallbackTz: string = DEFAULT_TZ,
): IcsEvent[] {
  const lines = unfold(text);
  const events: IcsEvent[] = [];

  let inEvent = false;
  let cur: Record<string, IcsLine> = {};
  let exDates: Date[] = [];

  const flush = () => {
    const dtstart = cur.DTSTART;
    if (!dtstart) return;
    const parsedStart = parseIcsDate(dtstart, fallbackTz);
    if (!parsedStart) return;

    // 已取消的日程不展示
    if (cur.STATUS && cur.STATUS.value.toUpperCase() === "CANCELLED") return;

    const allDay = parsedStart.dateOnly;
    let end: Date;
    if (cur.DTEND) {
      const parsedEnd = parseIcsDate(cur.DTEND, fallbackTz);
      end = parsedEnd ? parsedEnd.date : new Date(parsedStart.date.getTime() + 3600000);
    } else if (cur.DURATION) {
      const ms = parseDuration(cur.DURATION.value);
      end = new Date(parsedStart.date.getTime() + (ms ?? 3600000));
    } else {
      // 无 DTEND/DURATION：全天默认 1 天，定时默认 1 小时
      end = new Date(parsedStart.date.getTime() + (allDay ? 86400000 : 3600000));
    }

    // 全天事件的 DTEND 是排他的（次日 0 点），转成「含尾」的当日 23:59:59
    if (allDay) {
      const inclusive = new Date(end.getTime() - 1000);
      end = inclusive > parsedStart.date ? inclusive : new Date(parsedStart.date.getTime() + 86399000);
    }

    const durationMs = Math.max(0, end.getTime() - parsedStart.date.getTime());
    const uid = cur.UID?.value?.trim() || `${parsedStart.date.getTime()}-${cur.SUMMARY?.value ?? ""}`;
    const base = {
      uid,
      summary: unescapeText(cur.SUMMARY?.value ?? "(无标题)").trim() || "(无标题)",
      description: cur.DESCRIPTION ? unescapeText(cur.DESCRIPTION.value) : undefined,
      location: cur.LOCATION ? unescapeText(cur.LOCATION.value) : undefined,
      organizer: cur.ORGANIZER
        ? (cur.ORGANIZER.params.CN ?? cur.ORGANIZER.value.replace(/^mailto:/i, ""))
        : undefined,
      allDay,
    };

    if (cur.RRULE) {
      const exSet = new Set(exDates.map((d) => d.getTime()));
      const starts = expandRecurrence(
        parsedStart.date,
        cur.RRULE.value,
        exSet,
        windowStart,
        windowEnd,
      );
      for (const s of starts) {
        events.push({
          ...base,
          start: s,
          end: new Date(s.getTime() + durationMs),
          recurrenceInstance: starts.length > 1,
        });
      }
      return;
    }

    // 单次事件：落在窗口外的直接丢弃，避免同步无关的历史数据
    if (end < windowStart || parsedStart.date > windowEnd) return;
    events.push({ ...base, start: parsedStart.date, end });
  };

  for (const raw of lines) {
    const upper = raw.toUpperCase();
    if (upper.startsWith("BEGIN:VEVENT")) {
      inEvent = true;
      cur = {};
      exDates = [];
      continue;
    }
    if (upper.startsWith("END:VEVENT")) {
      if (inEvent) flush();
      inEvent = false;
      cur = {};
      exDates = [];
      continue;
    }
    if (!inEvent) continue;

    const line = parseLine(raw);
    if (!line) continue;

    if (line.name === "EXDATE") {
      // EXDATE 可以是逗号分隔的多值
      for (const v of line.value.split(",")) {
        const parsed = parseIcsDate({ ...line, value: v }, fallbackTz);
        if (parsed) exDates.push(parsed.date);
      }
      continue;
    }
    // 同名属性取首次出现，避免 RECURRENCE-ID 等覆盖主值
    if (!(line.name in cur)) cur[line.name] = line;
  }

  return events;
}
