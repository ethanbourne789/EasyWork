use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::commands::AppState;

use super::{int_to_bool, new_id, now};

// ---------------------------------------------------------------------------
// 日历模块
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct CalendarEventOut {
    pub id: String,
    pub user_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    pub start_at: String,
    pub end_at: String,
    pub all_day: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_uid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub organizer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reminder_minutes: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_calendar_event(row: &rusqlite::Row) -> rusqlite::Result<CalendarEventOut> {
    Ok(CalendarEventOut {
        id: row.get(0)?,
        user_id: String::new(),
        subscription_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        location: row.get(4)?,
        start_at: row.get(5)?,
        end_at: row.get(6)?,
        all_day: int_to_bool(row.get(7)?),
        color: row.get(8)?,
        source: row.get(9)?,
        external_uid: row.get(10)?,
        organizer: row.get(11)?,
        reminder_minutes: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

const EVENT_COLS: &str = "id,subscription_id,title,description,location,start_at,end_at,all_day,color,source,external_uid,organizer,reminder_minutes,created_at,updated_at";

#[tauri::command]
pub async fn calendar_event_list_all(state: State<'_, AppState>) -> Result<Vec<CalendarEventOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM calendar_events ORDER BY start_at", EVENT_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_calendar_event(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn calendar_event_get(state: State<'_, AppState>, id: String) -> Result<CalendarEventOut, String> {
    let db = state.db.lock().await;
    db.query_row(&format!("SELECT {} FROM calendar_events WHERE id = ?1", EVENT_COLS), params![id], |r| row_to_calendar_event(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calendar_event_create(
    state: State<'_, AppState>,
    title: String,
    description: Option<String>,
    location: Option<String>,
    start_at: String,
    end_at: String,
    all_day: Option<bool>,
    color: Option<String>,
    reminder_minutes: Option<i64>,
    source: Option<String>,
) -> Result<CalendarEventOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    db.execute(
        "INSERT INTO calendar_events (id,title,description,location,start_at,end_at,all_day,color,source,reminder_minutes,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)",
        params![
            id, title, description, location, start_at, end_at,
            all_day.map(|b| b as i64).unwrap_or(0),
            color,
            source.unwrap_or_else(|| "local".into()),
            reminder_minutes,
            ts,
        ],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM calendar_events WHERE id = ?1", EVENT_COLS), params![id], |r| row_to_calendar_event(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calendar_event_update(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
    description: Option<String>,
    location: Option<String>,
    start_at: Option<String>,
    end_at: Option<String>,
    all_day: Option<bool>,
    color: Option<String>,
    reminder_minutes: Option<i64>,
) -> Result<CalendarEventOut, String> {
    let db = state.db.lock().await;
    db.execute(
        "UPDATE calendar_events SET \
         title = COALESCE(?2, title), \
         description = COALESCE(?3, description), \
         location = COALESCE(?4, location), \
         start_at = COALESCE(?5, start_at), \
         end_at = COALESCE(?6, end_at), \
         all_day = COALESCE(?7, all_day), \
         color = COALESCE(?8, color), \
         reminder_minutes = COALESCE(?9, reminder_minutes), \
         updated_at = ?10 WHERE id = ?1",
        params![id, title, description, location, start_at, end_at, all_day.map(|b| b as i64), color, reminder_minutes, now()],
    )
    .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM calendar_events WHERE id = ?1", EVENT_COLS), params![id], |r| row_to_calendar_event(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calendar_event_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM calendar_events WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    let _ = db.execute("DELETE FROM calendar_event_reminders WHERE event_id = ?1", params![id]);
    Ok(())
}

/// 检查并发送即将开始的日历事件提醒（每分钟由后台任务调用）。
/// 返回本次实际发送的提醒数量；幂等：已提醒过的事件不会重复通知。
#[tauri::command]
pub async fn check_event_reminders(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<i64, String> {
    use tauri_plugin_notification::NotificationExt;

    let now = chrono::Utc::now();
    let mut due: Vec<(String, String, String)> = Vec::new(); // (id, title, start_at)
    {
        let db = state.db.lock().await;
        let mut stmt = db
            .prepare(
                "SELECT e.id, e.title, e.start_at \
                 FROM calendar_events e \
                 WHERE e.reminder_minutes IS NOT NULL AND e.reminder_minutes > 0 \
                   AND NOT EXISTS (SELECT 1 FROM calendar_event_reminders r WHERE r.event_id = e.id)",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))
            .map_err(|e| e.to_string())?;
        for row in rows.filter_map(|r| r.ok()) {
            let (id, title, start_at) = row;
            // 解析 start_at；解析失败跳过，避免坏数据阻塞提醒
            let Ok(start) = chrono::DateTime::parse_from_rfc3339(&start_at) else { continue; };
            let reminder_mins = {
                let v: Option<i64> = db.query_row(
                    "SELECT reminder_minutes FROM calendar_events WHERE id = ?1",
                    params![&id],
                    |r| r.get(0),
                ).ok().flatten();
                v.unwrap_or(0)
            };
            let due_at = start - chrono::Duration::minutes(reminder_mins);
            if due_at <= now {
                due.push((id, title, start_at));
            }
        }
    }

    let mut sent = 0i64;
    for (id, title, start_at) in due {
        let start = chrono::DateTime::parse_from_rfc3339(&start_at)
            .map(|d| d.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M").to_string())
            .unwrap_or_else(|_| start_at.clone());
        let _ = app
            .notification()
            .builder()
            .title("EasyWork 日历提醒")
            .body(format!("「{}」将于 {} 开始", title, start))
            .show();
        // 无论系统通知是否成功，都记录已提醒，避免每分钟重复尝试
        let db = state.db.lock().await;
        let _ = db.execute(
            "INSERT OR IGNORE INTO calendar_event_reminders (event_id, reminded_at) VALUES (?1, ?2)",
            params![&id, chrono::Utc::now().to_rfc3339()],
        );
        sent += 1;
    }
    Ok(sent)
}

// ---- Calendar Subscription ----

#[derive(Serialize)]
pub struct CalendarSubscriptionOut {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub provider: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    pub color: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_synced_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    pub event_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_calendar_subscription(row: &rusqlite::Row) -> rusqlite::Result<CalendarSubscriptionOut> {
    let id: String = row.get(0)?;
    let db_password: Option<String> = row.get(5)?;
    let password = match db_password {
        Some(ref pw) if !pw.is_empty() => db_password,
        _ => crate::calendar_creds::get_password(&id),
    };
    Ok(CalendarSubscriptionOut {
        id,
        user_id: String::new(),
        name: row.get(1)?,
        provider: row.get(2)?,
        url: row.get(3)?,
        username: row.get(4)?,
        password,
        color: row.get(6)?,
        enabled: int_to_bool(row.get(7)?),
        last_synced_at: row.get(8)?,
        last_error: row.get(9)?,
        event_count: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

const SUB_COLS: &str = "id,name,provider,url,username,password,color,enabled,last_synced_at,last_error,event_count,created_at,updated_at";

#[tauri::command]
pub async fn calendar_subscription_list_all(state: State<'_, AppState>) -> Result<Vec<CalendarSubscriptionOut>, String> {
    let db = state.db.lock().await;
    let mut stmt = db
        .prepare(&format!("SELECT {} FROM calendar_subscriptions ORDER BY created_at", SUB_COLS))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| row_to_calendar_subscription(r))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

#[tauri::command]
pub async fn calendar_subscription_get(state: State<'_, AppState>, id: String) -> Result<CalendarSubscriptionOut, String> {
    let db = state.db.lock().await;
    db.query_row(&format!("SELECT {} FROM calendar_subscriptions WHERE id = ?1", SUB_COLS), params![id], |r| row_to_calendar_subscription(r))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calendar_subscription_create(
    state: State<'_, AppState>,
    name: String,
    provider: String,
    url: String,
    username: Option<String>,
    password: Option<String>,
    color: Option<String>,
    enabled: Option<bool>,
) -> Result<CalendarSubscriptionOut, String> {
    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let password_to_store = password.clone().unwrap_or_default();
    crate::calendar_creds::save_password(&id, &password_to_store)
        .map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO calendar_subscriptions (id,name,provider,url,username,password,color,enabled,event_count,created_at,updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,?9,?9)",
        params![
            id, name, provider, url, username, "",
            color.unwrap_or_else(|| "#8b5cf6".into()),
            enabled.map(|b| b as i64).unwrap_or(1),
            ts,
        ],
    )
    .map_err(|e| e.to_string())?;
    let mut sub = db.query_row(&format!("SELECT {} FROM calendar_subscriptions WHERE id = ?1", SUB_COLS), params![id], |r| row_to_calendar_subscription(r))
        .map_err(|e| e.to_string())?;
    sub.password = crate::calendar_creds::get_password(&id);
    Ok(sub)
}

#[tauri::command]
pub async fn calendar_subscription_update(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    provider: Option<String>,
    url: Option<String>,
    username: Option<String>,
    password: Option<String>,
    color: Option<String>,
    enabled: Option<bool>,
) -> Result<CalendarSubscriptionOut, String> {
    let db = state.db.lock().await;
    let password_to_db: Option<String> = password.as_ref().map(|_| String::new());
    if let Some(ref pw) = password {
        crate::calendar_creds::save_password(&id, pw)
            .map_err(|e| e.to_string())?;
    }
    db.execute(
        "UPDATE calendar_subscriptions SET \
         name = COALESCE(?2, name), \
         provider = COALESCE(?3, provider), \
         url = COALESCE(?4, url), \
         username = COALESCE(?5, username), \
         password = COALESCE(?6, password), \
         color = COALESCE(?7, color), \
         enabled = COALESCE(?8, enabled), \
         updated_at = ?9 WHERE id = ?1",
        params![id, name, provider, url, username, password_to_db, color, enabled.map(|b| b as i64), now()],
    )
    .map_err(|e| e.to_string())?;
    let mut sub = db.query_row(&format!("SELECT {} FROM calendar_subscriptions WHERE id = ?1", SUB_COLS), params![id], |r| row_to_calendar_subscription(r))
        .map_err(|e| e.to_string())?;
    sub.password = crate::calendar_creds::get_password(&id);
    Ok(sub)
}

#[tauri::command]
pub async fn calendar_subscription_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().await;
    db.execute("DELETE FROM calendar_subscriptions WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    let _ = crate::calendar_creds::delete_password(&id);
    Ok(())
}

#[derive(Serialize)]
pub struct CalendarSyncResponse {
    pub results: Vec<crate::calendar_sync::SyncResult>,
}

#[tauri::command]
pub async fn calendar_sync_subscription(
    state: State<'_, AppState>,
    subscription_id: Option<String>,
) -> Result<CalendarSyncResponse, String> {
    let results = crate::calendar_sync::sync_all_subscriptions(&state.db, subscription_id).await?;
    Ok(CalendarSyncResponse { results })
}
