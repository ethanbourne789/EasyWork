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
  let principal = base;
  let calendarHomeSet = null;
  
  // 尝试查找 principal
  try {
    const principalBody = `<?xml version="1.0"?>
      <d:propfind xmlns:d="DAV:">
        <d:prop><d:current-user-principal/></d:prop>
      </d:propfind>`;
    
    // 尝试多个可能的路径
    const principalPaths = [`${base}/`, `${base}/dav/`, `${base}/.well-known/caldav`];
    for (const path of principalPaths) {
      try {
        const result = await fetchText(path, {
          ...baseHeaders,
          Authorization: authHeader,
        }, { method: "PROPFIND", body: principalBody });
        
        if (result.ok || result.status === 207) {
          // 先找到 current-user-principal 的内容，再从中提取 href
          const principalMatch = CALDAV_NS("current-user-principal").exec(result.text);
          if (principalMatch) {
            const hrefMatch = /<D:href[^>]*>([\s\S]*?)<\/D:href>/i.exec(principalMatch[1]);
            if (hrefMatch) {
              principal = absolutize(base, hrefMatch[1].trim());
              break;
            }
          }
        }
      } catch {
        /* continue */
      }
    }
  } catch {
    /* 失败则用 base 继续 */
  }

  // 2) 查找 calendar-home-set
  try {
    const calendarHomeBody = `<?xml version="1.0"?>
      <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:prop>
          <c:calendar-home-set/>
          <d:displayname/>
        </d:prop>
      </d:propfind>`;
    
    // 使用 Depth: 0 因为 principal 不是 collection
    const result = await fetchText(principal, {
      ...baseHeaders,
      Depth: "0",
      Authorization: authHeader,
    }, { method: "PROPFIND", body: calendarHomeBody });
    
    if (result.ok || result.status === 207) {
      const m = /calendar-home-set[^>]*>([\s\S]*?)<\/[^>]*calendar-home-set/i.exec(result.text);
      if (m) {
        // 从 calendar-home-set 内容中提取 href
        const hrefMatch = /<D:href[^>]*>([\s\S]*?)<\/D:href>/i.exec(m[1]);
        if (hrefMatch) {
          calendarHomeSet = absolutize(base, hrefMatch[1].trim());
        }
      }
    }
  } catch {
    /* ignore */
  }

  // 3) 发现日历集合
  let calendars: string[] = [];
  
  if (calendarHomeSet) {
    // 在 calendar-home-set 下查找日历集合
    try {
      const calListBody = `<?xml version="1.0"?>
        <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
          <d:prop>
            <d:resourcetype/>
            <d:displayname/>
          </d:prop>
        </d:propfind>`;
      
      const result = await fetchText(calendarHomeSet, {
        ...baseHeaders,
        Authorization: authHeader,
      }, { method: "PROPFIND", body: calListBody });
      
      if (result.ok || result.status === 207) {
        // 解析每个 response 块，找到包含 calendar 类型的集合
        const responseBlocks = result.text.split("<D:response>");
        for (const block of responseBlocks) {
          // 提取 href
          const hrefMatch = /<D:href>(.*?)<\/D:href>/.exec(block);
          const typeMatch = /<C:calendar[^>]*>|<c:calendar[^>]*>/i.exec(block);
          
          if (hrefMatch && typeMatch) {
            const href = hrefMatch[1].trim();
            if (href.endsWith("/") && !href.includes("Inbox") && !href.includes("Outbox")) {
              calendars.push(absolutize(calendarHomeSet, href));
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 兜底：如果没找到日历集合，尝试常见路径
  if (calendars.length === 0) {
    const fallbackPaths = [
      absolutize(base, "/.well-known/caldav/"),
      principal,
      calendarHomeSet,
    ].filter(Boolean);
    calendars = fallbackPaths;
  }

  // 4) 逐个日历拉取事件（REPORT + time-range 限定同步窗口）
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
      
      if (!result.ok && result.status !== 207) continue;
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
    // 由于唯一索引是部分索引（带有 WHERE 条件），ON CONFLICT 无法直接使用。
    // 改用先查询再插入/更新的方式实现幂等 upsert。
    const externalUids = rows.map((r) => String(r.external_uid));
    const { data: existing } = await admin
      .from("calendar_events")
      .select("id, external_uid")
      .eq("subscription_id", subs.id)
      .in("external_uid", externalUids);

    const existingMap = new Map();
    for (const row of (existing ?? [])) {
      existingMap.set(row.external_uid, row.id);
    }

    // 更新已存在的事件
    const toUpdate = rows.filter((r) => existingMap.has(String(r.external_uid)));
    if (toUpdate.length > 0) {
      for (const row of toUpdate) {
        await admin
          .from("calendar_events")
          .update({
            title: row.title,
            description: row.description,
            location: row.location,
            start_at: row.start_at,
            end_at: row.end_at,
            all_day: row.all_day,
            color: row.color,
            organizer: row.organizer,
          })
          .eq("id", existingMap.get(String(row.external_uid)));
      }
    }

    // 插入新事件（先去重，避免同一 external_uid 多次出现）
    const toInsert = rows.filter((r) => !existingMap.has(String(r.external_uid)));
    if (toInsert.length > 0) {
      // 按 external_uid 去重，保留第一条
      const uidSet = new Set();
      const uniqueInserts = toInsert.filter((r) => {
        const uid = String(r.external_uid);
        if (uidSet.has(uid)) return false;
        uidSet.add(uid);
        return true;
      });
      
      const { error } = await admin.from("calendar_events").insert(uniqueInserts);
      if (error) throw error;
    }

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
      let causeMsg = "";
      if (cause instanceof Error) {
        causeMsg = cause.message;
      } else if (typeof cause === "string") {
        causeMsg = cause;
      } else if (cause && typeof cause === "object") {
        // 安全地序列化对象
        try {
          causeMsg = JSON.stringify(cause, null, 2);
        } catch {
          causeMsg = String(cause);
        }
      }
      message = causeMsg ? `${e.message}: ${causeMsg}` : e.message;
    } else if (e && typeof e === "object") {
      // 处理非 Error 对象
      try {
        message = JSON.stringify(e, null, 2);
      } catch {
        message = String(e);
      }
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
