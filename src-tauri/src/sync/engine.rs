use std::sync::Arc;
use rusqlite::Connection;
use tokio_postgres::Client;
use crate::sync::{SyncResult, config};

const SYNC_TABLES_MAIN: &[&str] = &[
    "tasks", "subtasks", "tags", "task_tags",
    "accounts", "categories", "transactions", "budgets",
    "notes", "note_folders", "note_tags",
    "calendar_events", "calendar_subscriptions",
];

const SYNC_TABLES_MAIL: &[&str] = &[
    "email_accounts",
];

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub async fn sync_upload(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    mail_db: &Arc<tokio::sync::Mutex<Connection>>,
) -> Result<SyncResult, String> {
    let config_entry = {
        let guard = db.lock().await;
        config::get_sync_config(&guard).map_err(|e| format!("读取同步配置失败: {}", e))?
    };

    let Some(cfg) = config_entry else {
        return Ok(SyncResult {
            success: true,
            records_uploaded: 0,
            records_downloaded: 0,
            error: None,
        });
    };

    if !cfg.enabled {
        return Ok(SyncResult {
            success: true,
            records_uploaded: 0,
            records_downloaded: 0,
            error: None,
        });
    }

    let device_id = {
        let guard = db.lock().await;
        config::get_device_id(&guard).map_err(|e| format!("获取设备 ID 失败: {}", e))?
    };

    let pg = crate::sync::postgres::connect(&cfg.connection_string)
        .await.map_err(|e| {
            let _ = {
                let g = db.blocking_lock();
                config::update_sync_error_str(&g, &e)
            };
            e
        })?;

    let _ = crate::sync::postgres::ensure_schema(&pg.client).await;

    let last_sync_at = cfg.last_sync_at.clone().unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());
    let start = std::time::Instant::now();
    let mut total_uploaded = 0i32;

    for table in SYNC_TABLES_MAIN {
        let count = upload_table(&db, &pg.client, table, &last_sync_at, &device_id).await?;
        total_uploaded += count;
    }

    for table in SYNC_TABLES_MAIL {
        let count = upload_table(&mail_db, &pg.client, table, &last_sync_at, &device_id).await?;
        total_uploaded += count;
    }

    let duration = start.elapsed().as_millis() as i64;

    {
        let guard = db.lock().await;
        config::update_last_sync_at(&guard).ok();
        config::insert_sync_log(
            &guard, "upload", "all", total_uploaded, "success", None, Some(duration),
        ).ok();
    }

    let device_name = {
        let guard = db.lock().await;
        config::get_device_name(&guard).unwrap_or_else(|_| "EasyWork Device".to_string())
    };

    let _ = pg.client.execute(
        "INSERT INTO devices (device_id, device_name, last_seen_at) \
         VALUES ($1, $2, $3) ON CONFLICT (device_id) DO UPDATE SET last_seen_at = $3",
        &[&device_id, &device_name, &now_rfc3339()],
    ).await;

    Ok(SyncResult {
        success: true,
        records_uploaded: total_uploaded,
        records_downloaded: 0,
        error: None,
    })
}

async fn upload_table(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    pg: &Client,
    table: &str,
    since: &str,
    _device_id: &str,
) -> Result<i32, String> {
    let safe_table = sanitize_table(table);
    let rows: Vec<(Vec<String>, Vec<String>)> = {
        let guard = db.lock().await;
        let query = format!(
            "SELECT * FROM {} WHERE sync_modified_at > ?1 ORDER BY sync_modified_at",
            safe_table
        );
        let mut stmt = guard.prepare(&query).map_err(|e| format!("准备查询 {}: {}", table, e))?;
        let col_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
        let rows_map = stmt.query_map(rusqlite::params![since], |row| {
            let mut vals = Vec::new();
            for (i, _col_name) in col_names.iter().enumerate() {
                let value: Option<String> = row.get(i).ok();
                match value {
                    Some(v) => vals.push(v),
                    None => vals.push("NULL".to_string()),
                }
            }
            Ok((col_names.clone(), vals))
        }).map_err(|e| format!("查询 {}: {}", table, e))?;
        rows_map.filter_map(|r| r.ok()).collect()
    };

    if rows.is_empty() {
        return Ok(0);
    }

    let mut count = 0i32;
    for (cols, vals) in &rows {
        let id_val = vals.first().unwrap_or(&"NULL".to_string()).clone();
        if id_val == "NULL" {
            continue;
        }

        let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("${}", i)).collect();
        let insert_cols = cols.iter().map(|c| format!("\"{}\"", sanitize_column(c))).collect::<Vec<_>>().join(", ");

        let set_parts: Vec<String> = cols.iter().skip(1).map(|c| {
            let sc = sanitize_column(c);
            format!("\"{}\" = EXCLUDED.\"{}\"", sc, sc)
        }).collect();

        let lww_cond = if cols.iter().any(|c| *c == "updated_at") {
            " WHERE EXCLUDED.\"updated_at\" > t.\"updated_at\""
        } else {
            ""
        };

        let full_sql = format!(
            "INSERT INTO \"{}\" ({}) VALUES ({}) ON CONFLICT (\"id\") DO UPDATE SET {}{} ",
            safe_table,
            insert_cols,
            placeholders.join(", "),
            set_parts.join(", "),
            lww_cond,
        );

        let pg_params: Vec<Box<dyn tokio_postgres::types::ToSql + Sync>> = vals.iter().map(|v| {
            if *v == "NULL" {
                Box::new(None::<String>)
            } else {
                let s = v.clone();
                Box::new(s)
            }
        }).collect();
        let pg_refs: Vec<&dyn tokio_postgres::types::ToSql + Sync> = pg_params.iter().map(|b| b.as_ref()).collect();

        let _ = pg.execute(&full_sql, pg_refs.as_slice()).await;
        count += 1;
    }

    Ok(count)
}

fn sanitize_table(name: &str) -> String {
    name.replace('\"', "").replace('\'', "").replace("--", "").replace(";", "")
}

fn sanitize_column(name: &str) -> String {
    name.replace('\"', "").replace('\'', "").replace("--", "").replace(";", "")
}

pub async fn sync_download(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    mail_db: &Arc<tokio::sync::Mutex<Connection>>,
) -> Result<SyncResult, String> {
    let config_entry = {
        let guard = db.lock().await;
        config::get_sync_config(&guard).map_err(|e| format!("读取同步配置失败: {}", e))?
    };

    let Some(cfg) = config_entry else {
        return Ok(SyncResult {
            success: true,
            records_uploaded: 0,
            records_downloaded: 0,
            error: None,
        });
    };

    if !cfg.enabled {
        return Ok(SyncResult {
            success: true,
            records_uploaded: 0,
            records_downloaded: 0,
            error: None,
        });
    }

    let device_id = {
        let guard = db.lock().await;
        config::get_device_id(&guard).map_err(|e| format!("获取设备 ID 失败: {}", e))?
    };

    let pg = crate::sync::postgres::connect(&cfg.connection_string)
        .await.map_err(|e| {
            let _ = {
                let g = db.blocking_lock();
                config::update_sync_error_str(&g, &e)
            };
            e
        })?;

    let _ = crate::sync::postgres::ensure_schema(&pg.client).await;

    let last_sync_at = cfg.last_sync_at.clone().unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());
    let start = std::time::Instant::now();
    let mut total_downloaded = 0i32;

    for table in SYNC_TABLES_MAIN {
        let count = download_table(&db, &pg.client, table, &last_sync_at, &device_id).await?;
        total_downloaded += count;
    }

    for table in SYNC_TABLES_MAIL {
        let count = download_table(&mail_db, &pg.client, table, &last_sync_at, &device_id).await?;
        total_downloaded += count;
    }

    let duration = start.elapsed().as_millis() as i64;

    {
        let guard = db.lock().await;
        config::insert_sync_log(
            &guard, "download", "all", total_downloaded, "success", None, Some(duration),
        ).ok();
    }

    Ok(SyncResult {
        success: true,
        records_uploaded: 0,
        records_downloaded: total_downloaded,
        error: None,
    })
}

async fn download_table(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    pg: &Client,
    table: &str,
    since: &str,
    device_id: &str,
) -> Result<i32, String> {
    let safe_table = sanitize_table(table);
    let pg_rows = pg.query(
        &format!(
            "SELECT * FROM \"{}\" WHERE sync_modified_at > $1 AND sync_device_id != $2 ORDER BY sync_modified_at",
            safe_table
        ),
        &[&since, &device_id],
    ).await.map_err(|e| format!("从云端查询 {} 失败: {}", table, e))?;

    if pg_rows.is_empty() {
        return Ok(0);
    }

    let mut count = 0i32;
    for pg_row in &pg_rows {
        let id: String = pg_row.get(0);
        let pg_modified: String = pg_row.get("sync_modified_at");

        let local_updated = get_local_updated_at(&db, table, &id).await;

        match local_updated {
            Some(local_ts) => {
                if pg_modified > local_ts {
                    if upsert_local_row(&db, table, pg_row).await.is_ok() {
                        count += 1;
                    }
                }
            }
            None => {
                if upsert_local_row(&db, table, pg_row).await.is_ok() {
                    count += 1;
                }
            }
        }
    }

    Ok(count)
}

async fn get_local_updated_at(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    table: &str,
    id: &str,
) -> Option<String> {
    let guard = db.lock().await;
    let query = format!(
        "SELECT updated_at FROM {} WHERE id = ?1",
        sanitize_table(table)
    );
    guard.query_row(&query, rusqlite::params![id], |row| row.get::<_, String>(0)).ok()
}

async fn upsert_local_row(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    table: &str,
    pg_row: &tokio_postgres::Row,
) -> Result<(), String> {
    let columns: Vec<String> = pg_row.columns().iter().map(|c| c.name().to_string()).collect();
    let id_val: String = pg_row.get(0);

    let guard = db.lock().await;

    let existing: Option<String> = guard.query_row(
        &format!("SELECT id FROM {} WHERE id = ?1", sanitize_table(table)),
        rusqlite::params![&id_val],
        |row| row.get::<_, String>(0)
    ).ok();

    if existing.is_some() {
        let set_parts: Vec<String> = columns.iter().filter(|c| **c != "id").map(|c| {
            format!("{} = ?{}", sanitize_column(c), columns.len() + 1)
        }).collect();
        let sql = format!(
            "UPDATE {} SET {} WHERE id = ?1",
            sanitize_table(table),
            set_parts.join(", ")
        );

        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        params.push(Box::new(id_val.clone()));
        for col in &columns {
            if *col == "id" { continue; }
            let col_str = col.as_str();
            match pg_row.try_get::<_, Option<String>>(col_str) {
                Ok(Some(v)) => params.push(Box::new(v)),
                Ok(None) => params.push(Box::new(None::<String>)),
                Err(_) => {
                    if let Ok(v) = pg_row.try_get::<_, Option<i32>>(col_str) {
                        params.push(Box::new(v));
                    } else if let Ok(v) = pg_row.try_get::<_, Option<i64>>(col_str) {
                        params.push(Box::new(v));
                    } else if let Ok(v) = pg_row.try_get::<_, Option<bool>>(col_str) {
                        params.push(Box::new(v));
                    } else {
                        params.push(Box::new(None::<String>));
                    }
                }
            }
        }

        guard.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))
            .map_err(|e| format!("更新本地 {} 失败: {}", table, e))?;
    } else {
        let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({})",
            sanitize_table(table),
            columns.iter().map(|c| sanitize_column(c)).collect::<Vec<_>>().join(", "),
            placeholders.join(", ")
        );

        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        for col in &columns {
            let col_str = col.as_str();
            match pg_row.try_get::<_, Option<String>>(col_str) {
                Ok(Some(v)) => params.push(Box::new(v)),
                Ok(None) => params.push(Box::new(None::<String>)),
                Err(_) => {
                    if let Ok(v) = pg_row.try_get::<_, Option<i32>>(col_str) {
                        params.push(Box::new(v));
                    } else if let Ok(v) = pg_row.try_get::<_, Option<i64>>(col_str) {
                        params.push(Box::new(v));
                    } else if let Ok(v) = pg_row.try_get::<_, Option<bool>>(col_str) {
                        params.push(Box::new(v));
                    } else {
                        params.push(Box::new(None::<String>));
                    }
                }
            }
        }

        guard.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))
            .map_err(|e| format!("插入本地 {} 失败: {}", table, e))?;
    }

    Ok(())
}

pub async fn full_sync(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    mail_db: &Arc<tokio::sync::Mutex<Connection>>,
) -> Result<SyncResult, String> {
    tracing::info!("开始全量同步...");

    let upload_result = sync_upload(db, mail_db).await?;
    let download_result = sync_download(db, mail_db).await?;

    tracing::info!(
        "全量同步完成: 上传 {} 条, 下载 {} 条",
        upload_result.records_uploaded,
        download_result.records_downloaded
    );

    Ok(SyncResult {
        success: true,
        records_uploaded: upload_result.records_uploaded,
        records_downloaded: download_result.records_downloaded,
        error: None,
    })
}
