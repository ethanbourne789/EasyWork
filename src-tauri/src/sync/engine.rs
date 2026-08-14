use std::sync::Arc;
use rusqlite::Connection;
use tokio_postgres::Client;
use crate::sync::{SyncResult, config};

/// 云端写入参数的占位类型。
/// 同时满足 tokio_postgres `&(dyn ToSql + Sync)` 的约束，并附加 `Send`，
/// 以保证包含此参数的 future 可在 Tauri 命令线程池 / tokio::spawn 中跨 await 安全传递。
/// 用别名隐藏 `dyn A + B` 以避免该工具链对内联多约束 trait object 的解析歧义。
type PgParam = dyn tokio_postgres::types::ToSql + Sync + Send;

const SYNC_TABLES_MAIN: &[&str] = &[
    "tasks", "subtasks", "tags", "task_tags",
    "accounts", "categories", "transactions", "budgets",
    "notes", "note_folders", "note_tags", "note_tag_master", "note_note_tags",
    "calendar_events", "calendar_subscriptions",
];

const SYNC_TABLES_MAIL: &[&str] = &[
    "email_accounts",
];

/// 每张表的主键列。除关联表外均为单列 `id`；
/// `task_tags` / `note_tags` 为复合主键，云端/本地均无 `id` 列。
fn table_pk(table: &str) -> &'static [&'static str] {
    match table {
        "task_tags" => &["task_id", "tag_id"],
        "note_tags" => &["note_id", "tag_name"],
        _ => &["id"],
    }
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// 简易 hex 编码（仅用于把 SQLite BLOB 值以可读文本形式带过同步协议；
/// 业务表当前没有 BLOB 列，此分支基本不会触发）。
fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0x0f) as usize] as char);
    }
    s
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

    let pg = match crate::sync::postgres::connect(&cfg.connection_string).await {
        Ok(pg) => pg,
        Err(e) => {
            let g = db.lock().await;
            let _ = config::update_sync_error_str(&g, &e);
            return Err(e);
        }
    };

    let _ = crate::sync::postgres::ensure_schema(&pg.client).await;

    let last_sync_at = cfg.last_sync_at.clone().unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());
    let start = std::time::Instant::now();
    let mut total_uploaded = 0i32;
    // 收集各表上传错误：单表失败不中断其他表，最终把首个错误汇总到 SyncResult
    let mut errors: Vec<String> = Vec::new();

    for table in SYNC_TABLES_MAIN {
        match upload_table(&db, &pg.client, table, &last_sync_at, &device_id).await {
            Ok(count) => total_uploaded += count,
            Err(e) => errors.push(format!("{}: {}", table, e)),
        }
    }

    for table in SYNC_TABLES_MAIL {
        match upload_table(&mail_db, &pg.client, table, &last_sync_at, &device_id).await {
            Ok(count) => total_uploaded += count,
            Err(e) => errors.push(format!("{}: {}", table, e)),
        }
    }

    let duration = start.elapsed().as_millis() as i64;

    if !errors.is_empty() {
        // 存在失败：不更新 last_sync_at（下次重试），但把错误落库并上报
        let msg = errors.join("; ");
        let guard = db.lock().await;
        config::update_sync_error(&guard, Some(&msg)).ok();
        config::insert_sync_log(
            &guard, "upload", "all", total_uploaded, "error", Some(&msg), Some(duration),
        ).ok();
        drop(guard);
        return Ok(SyncResult {
            success: false,
            records_uploaded: total_uploaded,
            records_downloaded: 0,
            error: Some(msg),
        });
    }

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
    let pk = table_pk(table);
    let (col_names, rows): (Vec<String>, Vec<Vec<String>>) = {
        let guard = db.lock().await;
        let query = format!(
            "SELECT * FROM {} WHERE sync_modified_at > ?1 ORDER BY sync_modified_at",
            safe_table
        );
        let mut stmt = guard.prepare(&query).map_err(|e| format!("准备查询 {}: {}", table, e))?;
        let col_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
        let rows_map = stmt.query_map(rusqlite::params![since], |row| {
            let mut vals = Vec::with_capacity(col_names.len());
            for i in 0..col_names.len() {
                // 按存储类型读取并转为文本，避免 INTEGER/REAL 列被 Option<String> 读成 NULL
                let v = match row.get_ref(i) {
                    Ok(rusqlite::types::ValueRef::Null) => "NULL".to_string(),
                    Ok(rusqlite::types::ValueRef::Integer(n)) => n.to_string(),
                    Ok(rusqlite::types::ValueRef::Real(f)) => f.to_string(),
                    Ok(rusqlite::types::ValueRef::Text(t)) => String::from_utf8_lossy(t).into_owned(),
                    Ok(rusqlite::types::ValueRef::Blob(b)) => format!("\\x{}", hex_encode(b)),
                    Err(_) => "NULL".to_string(),
                };
                vals.push(v);
            }
            Ok((col_names.clone(), vals))
        }).map_err(|e| format!("查询 {}: {}", table, e))?;
        let rows = rows_map.filter_map(|r| r.ok()).map(|(_, vals)| vals).collect();
        (col_names, rows)
    };
    if rows.is_empty() {
        return Ok(0);
    }

    // 主键列在结果中的索引
    let pk_idx: Vec<usize> = pk.iter()
        .map(|c| col_names.iter().position(|n| n == c).unwrap_or(0))
        .collect();

    let mut count = 0i32;
    let mut first_error: Option<String> = None;
    for vals in &rows {
        // 任一主键为 NULL 则跳过（不应发生）
        if pk_idx.iter().any(|&i| vals.get(i).map_or(true, |v| v == "NULL")) {
            continue;
        }

        let placeholders: Vec<String> = (1..=col_names.len()).map(|i| format!("${}", i)).collect();
        let insert_cols = col_names.iter().map(|c| format!("\"{}\"", sanitize_column(c))).collect::<Vec<_>>().join(", ");

        let set_parts: Vec<String> = col_names.iter()
            .filter(|c| !pk.contains(&c.as_str()))
            .map(|c| {
                let sc = sanitize_column(c);
                format!("\"{}\" = EXCLUDED.\"{}\"", sc, sc)
            }).collect();

        // LWW：仅当新行 updated_at 比云端现有行新时才覆盖。
        // 必须用目标表名（而非不存在的别名 t）引用现有行。
        let lww_cond = if col_names.iter().any(|c| *c == "updated_at") {
            format!(" WHERE EXCLUDED.\"updated_at\" > \"{}\".\"updated_at\"", safe_table)
        } else {
            String::new()
        };

        let conflict_cols = pk.iter().map(|c| format!("\"{}\"", sanitize_column(c))).collect::<Vec<_>>().join(", ");

        let full_sql = format!(
            "INSERT INTO \"{}\" ({}) VALUES ({}) ON CONFLICT ({}) DO UPDATE SET {}{} ",
            safe_table,
            insert_cols,
            placeholders.join(", "),
            conflict_cols,
            set_parts.join(", "),
            lww_cond,
        );

        let pg_params: Vec<Box<PgParam>> = vals.iter().map(|v| -> Box<PgParam> {
            if *v == "NULL" {
                Box::new(None::<String>)
            } else {
                let s = v.clone();
                Box::new(s)
            }
        }).collect();
        // 显式标注为目标类型 `&(dyn ToSql + Sync)`（不含 Send），
        // 由 `&dyn (ToSql + Sync + Send)` 向下 coerce；同时 Box 仍含 Send，
        // 保证持有 pg_params 的 future 可在跨 await 时满足 Send 约束。
        let pg_refs: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> =
            pg_params.iter().map(|b| &**b as &(dyn tokio_postgres::types::ToSql + Sync)).collect();

        match pg.execute(&full_sql, pg_refs.as_slice()).await {
            Ok(_) => count += 1,
            Err(e) => {
                // 不再静默吞错：记录首个错误，由调用方汇总上报
                let id_val = pk_idx.iter()
                    .map(|&i| vals.get(i).cloned().unwrap_or_default())
                    .collect::<Vec<_>>().join("/");
                let msg = format!("上传 {} 行({})失败: {}", table, id_val, e);
                if first_error.is_none() {
                    first_error = Some(msg);
                }
            }
        }
    }

    match first_error {
        Some(err) => Err(err),
        None => Ok(count),
    }
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

    let pg = match crate::sync::postgres::connect(&cfg.connection_string).await {
        Ok(pg) => pg,
        Err(e) => {
            let g = db.lock().await;
            let _ = config::update_sync_error_str(&g, &e);
            return Err(e);
        }
    };

    let _ = crate::sync::postgres::ensure_schema(&pg.client).await;

    let last_sync_at = cfg.last_sync_at.clone().unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());
    let start = std::time::Instant::now();
    let mut total_downloaded = 0i32;
    let mut errors: Vec<String> = Vec::new();

    for table in SYNC_TABLES_MAIN {
        match download_table(&db, &pg.client, table, &last_sync_at, &device_id).await {
            Ok(count) => total_downloaded += count,
            Err(e) => errors.push(format!("{}: {}", table, e)),
        }
    }

    for table in SYNC_TABLES_MAIL {
        match download_table(&mail_db, &pg.client, table, &last_sync_at, &device_id).await {
            Ok(count) => total_downloaded += count,
            Err(e) => errors.push(format!("{}: {}", table, e)),
        }
    }

    let duration = start.elapsed().as_millis() as i64;

    if !errors.is_empty() {
        let msg = errors.join("; ");
        let guard = db.lock().await;
        config::update_sync_error(&guard, Some(&msg)).ok();
        config::insert_sync_log(
            &guard, "download", "all", total_downloaded, "error", Some(&msg), Some(duration),
        ).ok();
        drop(guard);
        return Ok(SyncResult {
            success: false,
            records_uploaded: 0,
            records_downloaded: total_downloaded,
            error: Some(msg),
        });
    }

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
    let pk = table_pk(table);
    // 用 IS DISTINCT FROM 而非 != ：云端行的 sync_device_id 可能为 NULL（本地旧数据上传而来），
    // `NULL != $2` 恒为 NULL 会把所有行过滤掉，导致其他设备永远下载不到数据。
    let pg_rows = pg.query(
        &format!(
            "SELECT * FROM \"{}\" WHERE sync_modified_at > $1 AND sync_device_id IS DISTINCT FROM $2 ORDER BY sync_modified_at",
            safe_table
        ),
        &[&since, &device_id],
    ).await.map_err(|e| format!("从云端查询 {} 失败: {}", table, e))?;

    if pg_rows.is_empty() {
        return Ok(0);
    }

    let mut count = 0i32;
    let mut first_error: Option<String> = None;
    for pg_row in &pg_rows {
        // 主键值必须齐全（均为 TEXT 列）
        let pk_vals: Vec<Option<String>> = pk.iter()
            .map(|c| pg_row.try_get::<_, Option<String>>(*c).ok().flatten())
            .collect();
        if pk_vals.iter().any(|v| v.is_none()) {
            continue;
        }
        let pg_modified: String = pg_row.get("sync_modified_at");

        let local_updated = get_local_updated_at(&db, table, &pk_vals).await;

        let should_apply = match local_updated {
            Some(local_ts) => pg_modified > local_ts,
            None => true,
        };

        if should_apply {
            match upsert_local_row(&db, table, pg_row, &pk_vals).await {
                Ok(()) => count += 1,
                Err(e) => {
                    if first_error.is_none() {
                        first_error = Some(e);
                    }
                }
            }
        }
    }

    match first_error {
        Some(err) => Err(err),
        None => Ok(count),
    }
}

async fn get_local_updated_at(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    table: &str,
    pk_vals: &[Option<String>],
) -> Option<String> {
    let pk = table_pk(table);
    let where_clause = pk.iter().enumerate()
        .map(|(i, c)| format!("{} = ?{}", sanitize_column(c), i + 1))
        .collect::<Vec<_>>().join(" AND ");
    // 关联表（task_tags/note_tags）无 updated_at 列，查询报错 → None → 走幂等 upsert
    let sql = format!("SELECT updated_at FROM {} WHERE {}", sanitize_table(table), where_clause);
    let guard = db.lock().await;
    let params: Vec<Box<dyn rusqlite::types::ToSql>> = pk_vals.iter().map(|v| -> Box<dyn rusqlite::types::ToSql> {
        match v.as_deref() {
            Some(s) => Box::new(s.to_string()),
            None => Box::new(None::<String>),
        }
    }).collect();
    guard.query_row(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |row| row.get::<_, String>(0)).ok()
}

/// 把 PostgreSQL 行某列按 SQLite 可接受的类型读成参数（String→i32→i64→f64→bool 依次回退）。
fn col_to_param(pg_row: &tokio_postgres::Row, col: &str) -> Box<dyn rusqlite::types::ToSql> {
    if let Ok(Some(v)) = pg_row.try_get::<_, Option<String>>(col) { return Box::new(v); }
    if let Ok(Some(v)) = pg_row.try_get::<_, Option<i32>>(col) { return Box::new(v); }
    if let Ok(Some(v)) = pg_row.try_get::<_, Option<i64>>(col) { return Box::new(v); }
    if let Ok(Some(v)) = pg_row.try_get::<_, Option<f64>>(col) { return Box::new(v); }
    if let Ok(Some(v)) = pg_row.try_get::<_, Option<bool>>(col) { return Box::new(v); }
    Box::new(None::<String>)
}

async fn upsert_local_row(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    table: &str,
    pg_row: &tokio_postgres::Row,
    pk_vals: &[Option<String>],
) -> Result<(), String> {
    let pk = table_pk(table);
    let columns: Vec<String> = pg_row.columns().iter().map(|c| c.name().to_string()).collect();
    let safe_table = sanitize_table(table);

    let where_clause = pk.iter().enumerate()
        .map(|(i, c)| format!("{} = ?{}", sanitize_column(c), i + 1))
        .collect::<Vec<_>>().join(" AND ");

    let guard = db.lock().await;

    let pk_params: Vec<Box<dyn rusqlite::types::ToSql>> = pk_vals.iter().map(|v| -> Box<dyn rusqlite::types::ToSql> {
        match v.as_deref() {
            Some(s) => Box::new(s.to_string()),
            None => Box::new(None::<String>),
        }
    }).collect();

    let existing: bool = guard.query_row(
        &format!("SELECT 1 FROM {} WHERE {}", safe_table, where_clause),
        rusqlite::params_from_iter(pk_params.iter().map(|p| p.as_ref())),
        |_| Ok(true),
    ).unwrap_or(false);

    if existing {
        let non_pk: Vec<&String> = columns.iter().filter(|c| !pk.contains(&c.as_str())).collect();
        if non_pk.is_empty() {
            return Ok(());
        }
        // 参数索引必须递增：?1..?k 为主键，其后按列顺序 ?(k+1)..?n
        let set_parts: Vec<String> = non_pk.iter().enumerate()
            .map(|(idx, c)| format!("{} = ?{}", sanitize_column(c), pk.len() + idx + 1))
            .collect();
        let sql = format!("UPDATE {} SET {} WHERE {}", safe_table, set_parts.join(", "), where_clause);

        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        for v in pk_vals {
            params.push(Box::new(v.clone().unwrap_or_default()));
        }
        for c in non_pk {
            params.push(col_to_param(pg_row, c));
        }
        guard.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))
            .map_err(|e| format!("更新本地 {} 失败: {}", table, e))?;
    } else {
        let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("?{}", i)).collect();
        let conflict_cols = pk.iter().map(|c| format!("\"{}\"", sanitize_column(c))).collect::<Vec<_>>().join(", ");
        let upsert_set: Vec<String> = columns.iter()
            .filter(|c| !pk.contains(&c.as_str()))
            .map(|c| format!("\"{}\" = excluded.\"{}\"", sanitize_column(c), sanitize_column(c)))
            .collect();
        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT ({}) DO UPDATE SET {}",
            safe_table,
            columns.iter().map(|c| format!("\"{}\"", sanitize_column(c))).collect::<Vec<_>>().join(", "),
            placeholders.join(", "),
            conflict_cols,
            upsert_set.join(", "),
        );

        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        for c in &columns {
            params.push(col_to_param(pg_row, c));
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
        success: upload_result.success && download_result.success,
        records_uploaded: upload_result.records_uploaded,
        records_downloaded: download_result.records_downloaded,
        error: upload_result.error.clone().or(download_result.error.clone()),
    })
}
