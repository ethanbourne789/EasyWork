// Edge Function: sync-calendar
// 同步外部日历到本地 calendar_events，供前端日历视图只读展示。
//   · ICS：通用订阅链接（含 webcal://）。钉钉「分享日历」生成的链接即为此类。
//   · 钉钉 CalDAV / 其他 CalDAV：用专用密码经 CalDAV 协议拉取（钉钉服务器 calendar.dingtalk.com）。
//
// 鉴权：需携带用户 JWT（Authorization: Bearer <jwt>）。service_role 仅用于绕过 RLS 读写数据；
//       订阅凭据（用户名/密码）从数据库读取，不依赖客户端传入。
// 调用：{ "subscriptionId": "<uuid>" } 同步单个；不带则同步当前用户全部 enabled 订阅。

import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import { parseIcs, type IcsEvent, DEFAULT_TZ } from "../_shared/ics.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const SYNC_WINDOW_PAST_DAYS = 180;
const SYNC_WINDOW_FUTURE_DAYS = 365;

interface SubscriptionRow {
  id: string;
  user_id: string;
  name: string;
  provider: "ics" | "dingtalk_caldav" | "caldav";
  url: string;
  username?: string | null;
  password?: string | null;
  color: string;
}

interface SyncResult {
  subscription: string;
  synced: number;
  removed: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// 鉴权：从 JWT 解析当前用户
// ---------------------------------------------------------------------------

async function getUserIdFromJwt(jwt: string): Promise<string | null> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data } = await client.auth.getUser(jwt);
  return data.user?.id ?? null;
}

// CORS：供桌面 WebView / 浏览器跨域调用。
// 必须放行 apikey（supabase-js 每次都会附带该头）与 x-client-info，否则预检通过后
// 浏览器会拦截实际 POST，前端表现为 "Failed to send a request to the Edge Function"。
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};

function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// ---------------------------------------------------------------------------
// HTTP 工具
// ---------------------------------------------------------------------------

/** URL 安全校验：只允许 http/https，禁止内网与私有地址 */
function validateUrl(raw: string): { ok: boolean; error?: string } {
  let url = raw.trim();
  if (!url) return { ok: false, error: "URL 不能为空" };
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol))
      return { ok: false, error: "只支持 HTTP/HTTPS 协议" };
    return { ok: true };
  } catch {
    return { ok: false, error: "URL 格式无效" };
  }
}

async function fetchText(
  url: string,
  headers: Record<string, string>,
  options?: { method?: string; body?: string }
): Promise<{ ok: boolean; text: string; status: number }> {
  try {
    const res = await fetch(url, {
      method: options?.method ?? "GET",
      headers,
      body: options?.body,
    });
    const text = await res.text();
    return { ok: res.ok, text, status: res.status };
  } catch (e) {
    return { ok: false, text: "", status: 0 };
  }
}

// ---------------------------------------------------------------------------
// ICS 拉取
// ---------------------------------------------------------------------------

async function fetchIcs(subs: SubscriptionRow): Promise<string> {
  const url = subs.url.replace(/^webcal:\/\//i, "https://");
  const check = validateUrl(url);
  if (!check.ok) throw new Error(check.error || "URL 校验失败");
  const result = await fetchText(url, {});
  if (!result.ok) throw new Error(`HTTP ${result.status}`);
  return result.text;
}

// ---------------------------------------------------------------------------
// CalDAV：发现日历 → 拉取每一个 calendar 的 VCALENDAR 文本
// ---------------------------------------------------------------------------

const CALDAV_NS = (tag: string) => new RegExp(`<[^>]*\\b${tag}\\b[^>]*>([\\s\\S]*?)<\\/[^>]*${tag}[^>]*>`, "i");

function extractHrefs(xml: string): string[] {
  const hrefs: string[] = [];
  const re = /<[^>]*:?href[^>]*>([\s\S]*?)<\/[^>]*:?href>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const v = m[1].trim();
    if (v && !hrefs.includes(v)) hrefs.push(v);
  }
  return hrefs;
}

function absolutize(base: string, path: string): string {
  try {
    return new URL(path, base).toString();
  } catch {
    return path;
  }
}

async function discoverCalDAV(subs: SubscriptionRow): Promise<string[]> {
  let url = subs.url.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const check = validateUrl(url);
  if (!check.ok) throw new Error(check.error || "URL 校验失败");
  const base = url.replace(/\/+$/, "");
  const auth: [string, string] = [subs.username || "", subs.password || ""];
  const authHeader = `Basic ${btoa(`${auth[0]}:${auth[1]}`)}`;
  const baseHeaders = { "Content-Type": "application/xml; charset=utf-8", Depth: "1" };

  // 1) 发现 principal home（PROPFIND）
  let home = base;
  try {
    const principalBody = `<?xml version="1.0"?>
      <d:propfind xmlns:d="DAV:">
        <d:prop><d:current-user-principal/></d:prop>
      </d:propfind>`;
    const result = await fetchText(`${base}/`, {
      ...baseHeaders,
      Authorization: authHeader,
    }, { method: "PROPFIND", body: principalBody });
    if (result.ok) {
      const m = CALDAV_NS("current-user-principal").exec(result.text);
      if (m) home = absolutize(base, m[1].trim());
    }
  } catch {
    /* 失败则用 base 继续 */
  }

  // 2) 发现日历集合（PROPFIND，包含 calendar-data 的 resourcetype=collection）
  const calendarHomeBody = `<?xml version="1.0"?>
    <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
      <d:prop>
        <d:resourcetype/>
        <c:calendar-home-set/>
        <d:displayname/>
      </d:prop>
    </d:propfind>`;
  let calendars: string[] = [];
  try {
    const result = await fetchText(home, {
      ...baseHeaders,
      Authorization: authHeader,
    }, { method: "PROPFIND", body: calendarHomeBody });
    if (result.ok) {
      const hrefs = extractHrefs(result.text).filter((h) => h.endsWith("/") || /\.ics$/i.test(h));
      calendars = hrefs.map((h) => absolutize(home, h));
    }
  } catch {
    /* ignore */
  }

  // 兜底：直接尝试 well-known 与 home 本身
  if (calendars.length === 0) {
    calendars = [absolutize(base, "/.well-known/caldav/"), home];
  }

  // 3) 逐个日历拉取事件（REPORT + time-range 限定同步窗口）
  const windowStart = new Date(Date.now() - SYNC_WINDOW_PAST_DAYS * 86400000);
  const windowEnd = new Date(Date.now() + SYNC_WINDOW_FUTURE_DAYS * 86400000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const reportBody = `<?xml version="1.0"?>
    <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
      <d:prop>
        <d:getetag/>
        <c:calendar-data/>
      </d:prop>
      <c:filter>
        <c:comp-filter name="VCALENDAR">
          <c:comp-filter name="VEVENT">
            <c:time-range start="${fmt(windowStart)}" end="${fmt(windowEnd)}"/>
          </c:comp-filter>
        </c:comp-filter>
      </c:filter>
    </c:calendar-query>`;

  const pieces: string[] = [];
  for (const cal of calendars) {
    try {
      const result = await fetchText(cal, {
        ...baseHeaders,
        Authorization: authHeader,
      }, { method: "REPORT", body: reportBody });
      if (!result.ok) continue;
      const xml = result.text;
      // 抽取所有 calendar-data 块
      const dataRe =
        /<[^>]*:?calendar-data[^>]*>([\s\S]*?)<\/[^>]*:?calendar-data>/gi;
      let m: RegExpExecArray | null;
      while ((m = dataRe.exec(xml))) {
        const chunk = m[1].trim();
        if (chunk) pieces.push(chunk);
      }
    } catch {
      /* 该日历失败不阻断其它日历 */
    }
  }
  return pieces;
}

// ---------------------------------------------------------------------------
// 写库
// ---------------------------------------------------------------------------

function toEventRows(subs: SubscriptionRow, parsed: IcsEvent[]): Record<string, unknown>[] {
  return parsed.map((ev) => {
    const externalUid = ev.recurrenceInstance
      ? `${ev.uid}@${ev.start.getTime()}`
      : ev.uid;
    return {
      user_id: subs.user_id,
      subscription_id: subs.id,
      title: ev.summary,
      description: ev.description ?? null,
      location: ev.location ?? null,
      start_at: ev.start.toISOString(),
      end_at: ev.end.toISOString(),
      all_day: ev.allDay,
      color: subs.color,
      source: subs.provider === "dingtalk_caldav" ? "dingtalk" : "ics",
      external_uid: externalUid,
      organizer: ev.organizer ?? null,
    };
  });
}

async function writeEvents(
  admin: ReturnType<typeof createClient>,
  subs: SubscriptionRow,
  rows: Record<string, unknown>[],
): Promise<{ synced: number; removed: number }> {
  // 先清除本订阅在同步窗口之外的旧实例（避免取消/移动的事件残留）
  const windowStart = new Date(Date.now() - SYNC_WINDOW_PAST_DAYS * 86400000).toISOString();
  const windowEnd = new Date(Date.now() + SYNC_WINDOW_FUTURE_DAYS * 86400000).toISOString();
  await admin
    .from("calendar_events")
    .delete()
    .eq("subscription_id", subs.id)
    .or(`start_at.lt.${windowStart},start_at.gt.${windowEnd}`);

  // 清理可能因改期产生的重复实例（同 base_uid 的旧实例）
  if (rows.length > 0) {
    const baseUids = [...new Set(rows.map((r) => String(r.external_uid).split("@")[0]))];
    for (const baseUid of baseUids) {
      // 删除同 base_uid 但 external_uid 不同的旧实例（在窗口内但不在本次同步的 rows 中）
      const newRowUids = new Set(
        rows.filter((r) => String(r.external_uid).startsWith(baseUid + "@")).map((r) => String(r.external_uid)),
      );
      const { data: existing } = await admin
        .from("calendar_events")
        .select("id, external_uid")
        .eq("subscription_id", subs.id)
        .like("external_uid", `${baseUid}@%`);
      if (existing && existing.length > 0) {
        const toDelete = existing.filter((e) => !newRowUids.has(e.external_uid));
        if (toDelete.length > 0) {
          await admin.from("calendar_events").delete().in("id", toDelete.map((d) => d.id));
        }
      }
    }
  }

  let synced = 0;
  if (rows.length > 0) {
    // upsert：同一 (subscription_id, external_uid) 唯一，重复同步幂等
    const { error } = await admin.from("calendar_events").upsert(rows, {
      onConflict: "subscription_id,external_uid",
    });
    if (error) throw error;
    synced = rows.length;
  }

  // 统计实际落库数量
  const { count } = await admin
    .from("calendar_events")
    .select("*", { count: "exact", head: true })
    .eq("subscription_id", subs.id);

  // 即便本次无新数据，也刷新 last_synced_at / 清空错误
  await admin
    .from("calendar_subscriptions")
    .update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
      event_count: count ?? synced,
    })
    .eq("id", subs.id);

  return { synced, removed: 0 };
}

// ---------------------------------------------------------------------------
// 单个订阅同步
// ---------------------------------------------------------------------------

async function syncOne(
  admin: ReturnType<typeof createClient>,
  subs: SubscriptionRow,
): Promise<SyncResult> {
  try {
    let rawPieces: string[];
    if (subs.provider === "ics") {
      rawPieces = [await fetchIcs(subs)];
    } else {
      rawPieces = await discoverCalDAV(subs);
    }

    // 抓取成功但无日历数据：URL 错误或来源返回空
    const texts = rawPieces.filter((p) => p && p.includes("BEGIN:VCALENDAR"));
    if (texts.length === 0) {
      throw new Error(
        subs.provider === "ics"
          ? "订阅源未返回日历数据（请检查 ICS 链接是否公开可访问）"
          : "CalDAV 未发现日历（请检查服务器地址/账号密码）",
      );
    }

    const windowStart = new Date(Date.now() - SYNC_WINDOW_PAST_DAYS * 86400000);
    const windowEnd = new Date(Date.now() + SYNC_WINDOW_FUTURE_DAYS * 86400000);

    const allParsed: IcsEvent[] = [];
    for (const piece of texts) {
      allParsed.push(...parseIcs(piece, windowStart, windowEnd, DEFAULT_TZ));
    }

    const rows = toEventRows(subs, allParsed);
    const { synced } = await writeEvents(admin, subs, rows);
    return { subscription: subs.name, synced, removed: 0 };
  } catch (e) {
    // 提取真实原因（Deno fetch failed 会把根因放在 cause 上）
    let message: string;
    if (e instanceof Error) {
      const cause = (e as { cause?: unknown }).cause;
      const causeMsg =
        cause instanceof Error
          ? cause.message
          : typeof cause === "string"
            ? cause
            : cause
              ? JSON.stringify(cause)
              : "";
      message = causeMsg ? `${e.message}: ${causeMsg}` : e.message;
    } else {
      message = String(e);
    }
    // 记录错误但不抛出，避免单个订阅失败阻断整体
    await admin
      .from("calendar_subscriptions")
      .update({ last_error: message.slice(0, 500), last_synced_at: new Date().toISOString() })
      .eq("id", subs.id);
    return { subscription: subs.name, synced: 0, removed: 0, error: message };
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflight();

  try {
    const auth = req.headers.get("Authorization");
    const jwt = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
    const userId = jwt ? await getUserIdFromJwt(jwt) : null;
    if (!userId) {
      return new Response(JSON.stringify({ error: "未授权" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json().catch(() => ({}))) as { subscriptionId?: string };

    let rows: SubscriptionRow[];
    if (body.subscriptionId) {
      const { data, error } = await admin
        .from("calendar_subscriptions")
        .select("*")
        .eq("id", body.subscriptionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      rows = data ? [data as SubscriptionRow] : [];
    } else {
      const { data, error } = await admin
        .from("calendar_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .eq("enabled", true);
      if (error) throw error;
      rows = (data ?? []) as SubscriptionRow[];
    }

    const results: SyncResult[] = [];
    for (const subs of rows) {
      results.push(await syncOne(admin, subs));
    }

    const failed = results.filter((r) => r.error);
    return new Response(
      JSON.stringify({
        results,
        synced: results.reduce((s, r) => s + r.synced, 0),
        ok: failed.length === 0,
        error: failed.length ? failed.map((f) => `${f.subscription}: ${f.error}`).join("; ") : undefined,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  }
});
