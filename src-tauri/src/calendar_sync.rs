use reqwest::Client;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::Arc;
use tracing::{error, info, warn};

#[derive(Serialize, Debug, Clone)]
pub struct SyncResult {
    pub synced: usize,
    pub removed: usize,
    pub subscription: String,
}

#[derive(Debug, Clone)]
pub struct ParsedEvent {
    pub uid: String,
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub organizer: Option<String>,
}

pub async fn sync_all_subscriptions(
    db: &Arc<tokio::sync::Mutex<rusqlite::Connection>>,
    subscription_id: Option<String>,
) -> Result<Vec<SyncResult>, String> {
    let subscriptions = {
        let db_conn = db.lock().await;
        get_enabled_subscriptions(&db_conn, subscription_id)?
    };
    
    let mut results = Vec::new();

    for sub in subscriptions {
        match sync_single_subscription(db, &sub).await {
            Ok(result) => {
                results.push(result);
            }
            Err(e) => {
                error!("Sync failed for subscription {}: {}", sub.name, e);
                {
                    let db_conn = db.lock().await;
                    update_subscription_error(&db_conn, &sub.id, &e)?;
                }
                results.push(SyncResult {
                    synced: 0,
                    removed: 0,
                    subscription: sub.name,
                });
            }
        }
    }

    Ok(results)
}

fn get_enabled_subscriptions(
    db: &rusqlite::Connection,
    subscription_id: Option<String>,
) -> Result<Vec<CalendarSubscriptionDb>, String> {
    if let Some(ref id) = subscription_id {
        let sql = "SELECT id, name, provider, url, username, password, color FROM calendar_subscriptions \
                   WHERE id = ?1 AND enabled = 1";
        let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
        let subs = stmt
            .query_map(rusqlite::params![id], |row| {
                Ok(CalendarSubscriptionDb {
                    id: row.get(0).unwrap_or_default(),
                    name: row.get(1).unwrap_or_default(),
                    provider: row.get(2).unwrap_or_default(),
                    url: row.get(3).unwrap_or_default(),
                    username: row.get(4).ok(),
                    password: row.get(5).ok(),
                    color: row.get(6).unwrap_or_else(|_| "#8b5cf6".to_string()),
                })
            })
            .map_err(|e| e.to_string())?;
        return subs.collect::<Result<Vec<_>, rusqlite::Error>>().map_err(|e| e.to_string());
    }

    let sql = "SELECT id, name, provider, url, username, password, color FROM calendar_subscriptions \
               WHERE enabled = 1";
    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
    let subs = stmt
        .query_map(rusqlite::params![], |row| {
            Ok(CalendarSubscriptionDb {
                id: row.get(0).unwrap_or_default(),
                name: row.get(1).unwrap_or_default(),
                provider: row.get(2).unwrap_or_default(),
                url: row.get(3).unwrap_or_default(),
                username: row.get(4).ok(),
                password: row.get(5).ok(),
                color: row.get(6).unwrap_or_else(|_| "#8b5cf6".to_string()),
            })
        })
        .map_err(|e| e.to_string())?;

    subs.collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone)]
struct CalendarSubscriptionDb {
    id: String,
    name: String,
    provider: String,
    url: String,
    username: Option<String>,
    password: Option<String>,
    color: String,
}

async fn sync_single_subscription(
    db: &Arc<tokio::sync::Mutex<rusqlite::Connection>>,
    sub: &CalendarSubscriptionDb,
) -> Result<SyncResult, String> {
    info!(
        "Syncing subscription: {} (provider: {})",
        sub.name, sub.provider
    );

    let events = match sub.provider.as_str() {
        "ics" => fetch_ics_events(&sub.url).await?,
        "dingtalk_caldav" => {
            fetch_dingtalk_caldav_events(
                &sub.url,
                sub.username.as_deref(),
                sub.password.as_deref(),
            )
            .await?
        }
        "caldav" => {
            fetch_caldav_events(
                &sub.url,
                sub.username.as_deref(),
                sub.password.as_deref(),
            )
            .await?
        }
        _ => {
            return Err(format!("Unknown provider: {}", sub.provider));
        }
    };

    info!(
        "Fetched {} events from subscription {}",
        events.len(),
        sub.name
    );

    let (synced, removed) = {
        let db_conn = db.lock().await;
        store_events_for_subscription(&db_conn, sub, &events)?
    };

    {
        let db_conn = db.lock().await;
        update_subscription_synced(&db_conn, &sub.id, events.len())?;
    }

    Ok(SyncResult {
        synced,
        removed,
        subscription: sub.name.clone(),
    })
}

async fn fetch_ics_events(url: &str) -> Result<Vec<ParsedEvent>, String> {
    let client = Client::builder()
        .user_agent("EasyWork/1.0")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch ICS: {}", e))?;

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read ICS body: {}", e))?;

    parse_ical_events(&body)
}

async fn fetch_dingtalk_caldav_events(
    server_url: &str,
    username: Option<&str>,
    password: Option<&str>,
) -> Result<Vec<ParsedEvent>, String> {
    let client = Client::builder()
        .user_agent("EasyWork/1.0")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let base_url = server_url.trim_end_matches('/');
    let username_for_auth = username.unwrap_or("");
    let password_for_auth = password.unwrap_or("");

    let calendar_url = format!("{}/caldav/principals/user/{}/Calendar/", base_url, username_for_auth);

    let events = fetch_caldav_calendar_events(&client, &calendar_url, Some(username_for_auth), Some(password_for_auth)).await?;

    if events.is_empty() {
        warn!("No events found via standard CalDAV path, trying alternative...");
        return fetch_dingtalk_events_fallback(&client, base_url, Some(username_for_auth), Some(password_for_auth)).await;
    }

    Ok(events)
}

async fn fetch_dingtalk_events_fallback(
    client: &Client,
    base_url: &str,
    username: Option<&str>,
    password: Option<&str>,
) -> Result<Vec<ParsedEvent>, String> {
    let calendar_url = format!("{}/caldav/principals/user/Calendar/", base_url);

    let username_for_auth = username.unwrap_or("");
    let password_for_auth = password.unwrap_or("");

    let response = client
        .get(&calendar_url)
        .basic_auth(username_for_auth, Some(password_for_auth))
        .header("Depth", "1")
        .send()
        .await;

    match response {
        Ok(resp) => {
            let body = resp.text().await.unwrap_or_default();
            if !body.is_empty() {
                let hrefs = extract_hrefs_from_multistatus(&body);
                let mut events = Vec::new();
                for href in hrefs {
                    if href.contains(".ics") {
                        let full_url = if href.starts_with("http") {
                            href.clone()
                        } else {
                            format!("{}/{}", base_url, href.trim_start_matches('/'))
                        };

                        match client
                            .get(&full_url)
                            .basic_auth(username_for_auth, Some(password_for_auth))
                            .send()
                            .await
                        {
                            Ok(event_resp) => {
                                if let Ok(event_body) = event_resp.text().await {
                                    if let Ok(parsed) = parse_ical_events(&event_body) {
                                        events.extend(parsed);
                                    }
                                }
                            }
                            Err(e) => {
                                warn!("Failed to fetch fallback event {}: {}", href, e);
                            }
                        }
                    }
                }
                return Ok(events);
            }
        }
        Err(e) => {
            warn!("Fallback CalDAV fetch failed: {}", e);
        }
    }

    Ok(Vec::new())
}

async fn fetch_caldav_events(
    server_url: &str,
    username: Option<&str>,
    password: Option<&str>,
) -> Result<Vec<ParsedEvent>, String> {
    let client = Client::builder()
        .user_agent("EasyWork/1.0")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let base_url = server_url.trim_end_matches('/');
    let username_for_auth = username.unwrap_or("");
    let password_for_auth = password.unwrap_or("");

    let calendar_url = format!("{}/calendar/", base_url);
    fetch_caldav_calendar_events(&client, &calendar_url, Some(username_for_auth), Some(password_for_auth)).await
}

async fn fetch_caldav_calendar_events(
    client: &Client,
    calendar_url: &str,
    username: Option<&str>,
    password: Option<&str>,
) -> Result<Vec<ParsedEvent>, String> {
    let username_for_auth = username.unwrap_or("");
    let password_for_auth = password.unwrap_or("");

    let builder = client
        .request(reqwest::Method::from_bytes(b"REPORT").unwrap(), calendar_url)
        .header("Depth", "1")
        .header("Content-Type", "text/xml; charset=utf-8")
        .basic_auth(username_for_auth, Some(password_for_auth));

    let vcalendar_report = r#"<?xml version="1.0" encoding="UTF-8"?>
    <C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <D:prop>
        <C:calendar-data>
          <C:comp-fname>VEVENT</C:comp-fname>
        </C:calendar-data>
      </D:prop>
      <C:filter>
        <C:comp-filter name="VCALENDAR">
          <C:comp-filter name="VEVENT"/>
        </C:comp-filter>
      </C:filter>
    </C:calendar-query>"#;

    let response = builder.body(vcalendar_report.to_string()).send().await;

    match response {
        Ok(resp) => {
            let body = resp.text().await.map_err(|e| format!("Failed to read CalDAV response: {}", e))?;
            if body.is_empty() {
                return Ok(Vec::new());
            }

            let hrefs = extract_hrefs_from_multistatus(&body);
            let mut all_events = Vec::new();

            for href in hrefs {
                let full_url = if href.starts_with("http") {
                    href.clone()
                } else {
                    let base = calendar_url.trim_end_matches('/');
                    if href.starts_with('/') {
                        let domain = extract_domain(calendar_url).unwrap_or_default();
                        format!("https://{}{}", domain, href)
                    } else {
                        format!("{}/{}", base, href)
                    }
                };

                match client
                    .get(&full_url)
                    .basic_auth(username_for_auth, Some(password_for_auth))
                    .send()
                    .await
                {
                    Ok(event_resp) => {
                        if let Ok(event_body) = event_resp.text().await {
                            if let Ok(events) = parse_ical_events(&event_body) {
                                all_events.extend(events);
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Failed to fetch event {}: {}", href, e);
                    }
                }
            }

            Ok(all_events)
        }
        Err(e) => {
            warn!("CalDAV REPORT failed: {}", e);
            Ok(Vec::new())
        }
    }
}

fn parse_ical_events(ics_content: &str) -> Result<Vec<ParsedEvent>, String> {
    let mut events = Vec::new();
    let mut current_event = None;

    for line in ics_content.lines() {
        let line = line.trim();
        
        if line.starts_with("BEGIN:VEVENT") {
            current_event = Some(ParsedEvent {
                uid: uuid::Uuid::new_v4().to_string(),
                summary: String::from("Untitled"),
                description: None,
                location: None,
                start: String::new(),
                end: String::new(),
                all_day: false,
                organizer: None,
            });
        } else if line.starts_with("END:VEVENT") {
            if let Some(event) = current_event.take() {
                events.push(event);
            }
        } else if let Some(ref mut event) = current_event {
            if let Some((key, value)) = line.split_once(':') {
                match key {
                    "UID" => event.uid = value.to_string(),
                    "SUMMARY" => event.summary = value.to_string(),
                    "DESCRIPTION" => event.description = Some(value.to_string()),
                    "LOCATION" => event.location = Some(value.to_string()),
                    "DTSTART" => {
                        if value.contains("VALUE=DATE") {
                            event.all_day = true;
                            event.start = format!("{}T00:00:00", extract_date_value(&value));
                        } else {
                            event.start = parse_datetime(value);
                        }
                    }
                    "DTEND" => {
                        if value.contains("VALUE=DATE") {
                            event.end = format!("{}T00:00:00", extract_date_value(&value));
                        } else {
                            event.end = parse_datetime(value);
                        }
                    }
                    "ORGANIZER" => {
                        if let Some(mailto) = value.strip_prefix("mailto:") {
                            event.organizer = Some(mailto.to_string());
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(events)
}

fn extract_date_value(value: &str) -> String {
    value.split(';').find(|part| part.len() == 8 && part.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(value)
        .to_string()
}

fn parse_datetime(value: &str) -> String {
    let dt = value.split(';').next().unwrap_or(value);
    
    if dt.len() >= 15 && dt.contains("TZID") {
        return dt.to_string();
    }
    
    if dt.len() == 8 {
        return format!("{}T00:00:00", dt);
    }
    
    if dt.len() == 15 {
        let date_part = &dt[..8];
        let time_part = &dt[9..];
        format!("{}T{}", date_part, time_part)
    } else {
        dt.to_string()
    }
}

fn extract_hrefs_from_multistatus(xml: &str) -> Vec<String> {
    let mut hrefs = Vec::new();
    let mut in_href = false;
    let mut current_href = String::new();

    for line in xml.lines() {
        let trimmed = line.trim();
        if trimmed.contains("<D:href>") || trimmed.contains("<href>") {
            in_href = true;
            current_href = trimmed
                .replace("<D:href>", "")
                .replace("<href>", "")
                .trim()
                .to_string();
        } else if in_href {
            if trimmed.contains("</D:href>") || trimmed.contains("</href>") {
                current_href = current_href
                    .replace("</D:href>", "")
                    .replace("</href>", "")
                    .trim()
                    .to_string();
                hrefs.push(urlencoding::decode(&current_href).unwrap_or_default().to_string());
                in_href = false;
                current_href.clear();
            } else {
                current_href.push_str(trimmed);
            }
        }
    }

    hrefs
}

fn extract_domain(url: &str) -> Option<String> {
    url.strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .and_then(|u| u.split('/').next())
        .map(String::from)
}

fn store_events_for_subscription(
    db: &rusqlite::Connection,
    sub: &CalendarSubscriptionDb,
    events: &[ParsedEvent],
) -> Result<(usize, usize), String> {
    let existing_uids: Vec<String> = db
        .prepare(
            "SELECT external_uid FROM calendar_events \
             WHERE subscription_id = ?1 AND external_uid IS NOT NULL",
        )
        .map_err(|e| e.to_string())?
        .query_and_then([sub.id.clone()], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut synced = 0;
    let mut seen_uids = HashSet::new();

    for event in events {
        seen_uids.insert(event.uid.clone());

        let event_id = format!("cal_{}", uuid::Uuid::new_v4());
        let now = chrono::Utc::now().to_rfc3339();

        db.execute(
            "INSERT INTO calendar_events \
             (id, subscription_id, title, description, location, start_at, end_at, all_day, \
              color, source, external_uid, organizer, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'ics', ?10, ?11, ?12, ?12)",
            rusqlite::params![
                event_id,
                sub.id,
                event.summary,
                event.description,
                event.location,
                event.start,
                event.end,
                event.all_day as i32,
                sub.color,
                event.uid,
                event.organizer,
                now,
            ],
        )
        .map_err(|e| format!("Failed to store event: {}", e))?;

        synced += 1;
    }

    let removed = existing_uids
        .iter()
        .filter(|uid| !seen_uids.contains(*uid))
        .count();

    if removed > 0 {
        let placeholders: Vec<String> = (0..existing_uids.len())
            .map(|i| format!("?{}", i + 1))
            .collect();

        let sql = format!(
            "DELETE FROM calendar_events \
             WHERE subscription_id = ?{} AND external_uid IN ({})",
            existing_uids.len() + 1,
            placeholders.join(", ")
        );

        let mut params: Vec<&dyn rusqlite::types::ToSql> = existing_uids
            .iter()
            .map(|uid| uid as &dyn rusqlite::types::ToSql)
            .collect();
        params.push(&sub.id);

        db.execute(&sql, rusqlite::params_from_iter(params))
            .map_err(|e| format!("Failed to remove old events: {}", e))?;
    }

    Ok((synced, removed))
}

fn update_subscription_synced(
    db: &rusqlite::Connection,
    subscription_id: &str,
    event_count: usize,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "UPDATE calendar_subscriptions \
         SET last_synced_at = ?1, last_error = NULL, event_count = ?2, updated_at = ?3 \
         WHERE id = ?4",
        rusqlite::params![now, event_count as i32, now, subscription_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn update_subscription_error(
    db: &rusqlite::Connection,
    subscription_id: &str,
    error: &str,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "UPDATE calendar_subscriptions \
         SET last_error = ?1, updated_at = ?2 \
         WHERE id = ?3",
        rusqlite::params![error, now, subscription_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
