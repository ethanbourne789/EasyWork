use std::sync::Arc;
use rusqlite::{Connection, params};
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
    "email_templates",
    "email_signatures",
    "contacts",
    "contact_groups",
    "contact_group_members",
];

/// Tombstone 保留期：30 天。超过此期限的删除记录可被清理。
const TOMBSTONE_RETENTION_DAYS: i64 = 30;

/// 每张表的主键列。除关联表外均为单列 `id`；
/// `task_tags` / `note_tags` 为复合主键，云端/本地均无 `id` 列。
fn table_pk(table: &str) -> &'static [&'static str] {
    match table {
        "task_tags" => &["task_id", "tag_id"],
        "note_tags" => &["note_id", "tag_name"],
        "contact_group_members" => &["contact_id", "group_id"],
        _ => &["id"],
    }
}

/// 将 tombstone 主键值反序列化。单列返回单个值；复合列返回 JSON 数组中的各元素。
fn deserialize_pk(pk_value: &str, pk_cols: &[&str]) -> Vec<Option<String>> {
    if pk_cols.len() == 1 {
        return vec![Some(pk_value.to_string())];
    }
    serde_json::from_str::<Vec<String>>(pk_value)
        .ok()
        .map(|v| v.into_iter().map(Some).collect())
        .unwrap_or_else(|| vec![None; pk_cols.len()])
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// 同步上传阶段表示一行中某一列的值，避免用字符串 "NULL" 作为哨兵导致与真实文本冲突。
#[derive(Clone)]
enum SqlVal {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Blob(Vec<u8>),
}

impl SqlVal {
    fn from_sqlite_ref(r: rusqlite::types::ValueRef<'_>) -> Self {
        match r {
            rusqlite::types::ValueRef::Null => SqlVal::Null,
            rusqlite::types::ValueRef::Integer(n) => SqlVal::Integer(n),
            rusqlite::types::ValueRef::Real(f) => SqlVal::Real(f),
            rusqlite::types::ValueRef::Text(t) => SqlVal::Text(String::from_utf8_lossy(t).into_owned()),
            rusqlite::types::ValueRef::Blob(b) => SqlVal::Blob(b.to_vec()),
        }
    }

    fn to_pg_param(&self) -> Box<PgParam> {
        match self {
            SqlVal::Null => Box::new(None::<String>),
            SqlVal::Integer(n) => Box::new(*n),
            SqlVal::Real(f) => Box::new(*f),
            SqlVal::Text(s) => Box::new(s.clone()),
            SqlVal::Blob(b) => Box::new(b.clone()),
        }
    }
}

/// SQL 标识符白名单校验：仅允许小写字母、数字和下划线，且首字符不能为数字。
fn validate_sql_identifier(name: &str) -> Result<String, String> {
    if name.is_empty() {
        return Err("SQL 标识符为空".to_string());
    }
    let mut chars = name.chars();
    let first = chars.next().unwrap();
    if !first.is_ascii_lowercase() && first != '_' {
        return Err(format!("SQL 标识符非法: {}", name));
    }
    if !chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err(format!("SQL 标识符非法: {}", name));
    }
    Ok(name.to_string())
}

fn sanitize_table(name: &str) -> Result<String, String> {
    validate_sql_identifier(name)
}

fn sanitize_column(name: &str) -> Result<String, String> {
    validate_sql_identifier(name)
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

    // 上传本地删除产生的 tombstones
    match upload_tombstones(&db, &pg.client, &device_id).await {
        Ok(count) => total_uploaded += count,
        Err(e) => errors.push(format!("tombstones(main): {}", e)),
    }
    match upload_tombstones(&mail_db, &pg.client, &device_id).await {
        Ok(count) => total_uploaded += count,
        Err(e) => errors.push(format!("tombstones(mail): {}", e)),
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
    let safe_table = sanitize_table(table)?;
    let pk = table_pk(table);
    let (col_names, rows): (Vec<String>, Vec<Vec<SqlVal>>) = {
        let guard = db.lock().await;
        let query = format!(
            "SELECT * FROM \"{}\" WHERE sync_modified_at IS NULL OR sync_modified_at > ?1 ORDER BY sync_modified_at",
            safe_table
        );
        let mut stmt = guard.prepare(&query).map_err(|e| format!("准备查询 {}: {}", table, e))?;
        let col_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
        let rows_map = stmt.query_map(rusqlite::params![since], |row| {
            let mut vals = Vec::with_capacity(col_names.len());
            for i in 0..col_names.len() {
                let raw = row.get_ref(i);
                let v = match &raw {
                    Ok(rusqlite::types::ValueRef::Null) => {
                        // 云表 sync_modified_at 为 NOT NULL：NULL 行兜底为纪元时间，
                        // 避免上传报错；本地被编辑/下载后会获得真实值
                        if col_names[i] == "sync_modified_at" {
                            SqlVal::Text("1970-01-01T00:00:00Z".to_string())
                        } else {
                            SqlVal::Null
                        }
                    }
                    Ok(r) => SqlVal::from_sqlite_ref(*r),
                    Err(_) => SqlVal::Null,
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
        if pk_idx.iter().any(|&i| vals.get(i).map_or(true, |v| matches!(v, SqlVal::Null))) {
            continue;
        }

        let placeholders: Vec<String> = (1..=col_names.len()).map(|i| format!("${}", i)).collect();
        let mut insert_cols_vec = Vec::new();
        for c in &col_names {
            insert_cols_vec.push(format!("\"{}\"", sanitize_column(c)?));
        }
        let insert_cols = insert_cols_vec.join(", ");

        let set_parts: Vec<String> = {
            let mut parts = Vec::new();
            for c in &col_names {
                if pk.contains(&c.as_str()) {
                    continue;
                }
                let sc = sanitize_column(c)?;
                parts.push(format!("\"{}\" = EXCLUDED.\"{}\"", sc, sc));
            }
            parts
        };

        // LWW：仅当新行 updated_at 比云端现有行新时才覆盖。
        // 必须用目标表名（而非不存在的别名 t）引用现有行。
        let lww_cond = if col_names.iter().any(|c| *c == "updated_at") {
            format!(" WHERE EXCLUDED.\"updated_at\" > \"{}\".\"updated_at\"", safe_table)
        } else {
            String::new()
        };

        let mut conflict_cols_vec = Vec::new();
        for c in pk.iter() {
            conflict_cols_vec.push(format!("\"{}\"", sanitize_column(c)?));
        }
        let conflict_cols = conflict_cols_vec.join(", ");

        let full_sql = format!(
            "INSERT INTO \"{}\" ({}) VALUES ({}) ON CONFLICT ({}) DO UPDATE SET {}{}",
            safe_table,
            insert_cols,
            placeholders.join(", "),
            conflict_cols,
            set_parts.join(", "),
            lww_cond,
        );

        let pg_params: Vec<Box<PgParam>> = vals.iter().map(|v| v.to_pg_param()).collect();
        let pg_refs: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> =
            pg_params.iter().map(|b| &**b as &(dyn tokio_postgres::types::ToSql + Sync)).collect();

        match pg.execute(&full_sql, pg_refs.as_slice()).await {
            Ok(_) => count += 1,
            Err(e) => {
                // 不再静默吞错：记录首个错误，由调用方汇总上报
                let id_val = pk_idx.iter()
                    .map(|&i| match vals.get(i) {
                        Some(SqlVal::Text(s)) => s.clone(),
                        Some(SqlVal::Integer(n)) => n.to_string(),
                        _ => "?".to_string(),
                    })
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

/// 上传本地 sync_tombstones 中尚未同步的删除记录到云端。
async fn upload_tombstones(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    pg: &Client,
    device_id: &str,
) -> Result<i32, String> {
    let rows: Vec<(String, String, String)> = {
        let guard = db.lock().await;
        let mut stmt = guard.prepare(
            "SELECT table_name, pk_value, deleted_at FROM sync_tombstones WHERE synced_at IS NULL"
        ).map_err(|e| format!("准备 tombstones 查询失败: {}", e))?;
        let mapped = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        }).map_err(|e| format!("查询 tombstones 失败: {}", e))?;
        mapped.filter_map(|r| r.ok()).collect()
    };

    if rows.is_empty() {
        return Ok(0);
    }

    let mut count = 0i32;
    let mut first_error: Option<String> = None;
    for (table, pk_value, deleted_at) in rows {
        let safe_table = sanitize_table(&table)?;
        match pg.execute(
            "INSERT INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id) \
             VALUES ($1, $2, $3, $4) ON CONFLICT (table_name, pk_value) DO UPDATE SET \
             deleted_at = EXCLUDED.deleted_at, sync_device_id = EXCLUDED.sync_device_id",
            &[&safe_table, &pk_value, &deleted_at, &device_id],
        ).await {
            Ok(_) => {
                count += 1;
                // 标记本地 tombstone 已上传
                let guard = db.lock().await;
                let _ = guard.execute(
                    "UPDATE sync_tombstones SET synced_at = ?1 WHERE table_name = ?2 AND pk_value = ?3",
                    params![now_rfc3339(), &table, &pk_value],
                );
            }
            Err(e) => {
                let msg = format!("上传 {} tombstone 失败: {}", table, e);
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

/// 从云端下载其他设备产生的 tombstones 并应用到本地。
async fn download_tombstones(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    pg: &Client,
    since: &str,
    device_id: &str,
) -> Result<i32, String> {
    let pg_rows = pg.query(
        "SELECT table_name, pk_value, deleted_at, sync_device_id FROM sync_tombstones \
         WHERE deleted_at > $1 AND sync_device_id IS DISTINCT FROM $2",
        &[&since, &device_id],
    ).await.map_err(|e| format!("从云端查询 tombstones 失败: {}", e))?;

    if pg_rows.is_empty() {
        return Ok(0);
    }

    let mut guard = db.lock().await;
    config::mute_sync_triggers(&guard).map_err(|e| format!("禁用触发器失败: {}", e))?;
    let result = apply_downloaded_tombstones(&mut guard, &pg_rows);
    let _ = config::unmute_sync_triggers(&guard);
    result
}

fn apply_downloaded_tombstones(
    guard: &Connection,
    pg_rows: &[tokio_postgres::Row],
) -> Result<i32, String> {
    let mut count = 0i32;
    let mut first_error: Option<String> = None;
    for pg_row in pg_rows {
        let table: String = pg_row.get("table_name");
        let pk_value: String = pg_row.get("pk_value");
        let deleted_at: String = pg_row.get("deleted_at");
        let sync_device_id: Option<String> = pg_row.get("sync_device_id");

        let safe_table = match sanitize_table(&table) {
            Ok(s) => s,
            Err(e) => {
                let msg = format!("应用 {} tombstone 失败: {}", table, e);
                if first_error.is_none() { first_error = Some(msg); }
                continue;
            }
        };
        let pk = table_pk(&table);
        let pk_vals = deserialize_pk(&pk_value, pk);
        if pk_vals.iter().any(|v| v.is_none()) {
            continue;
        }

        let mut where_parts = Vec::new();
        for (i, c) in pk.iter().enumerate() {
            where_parts.push(format!("\"{}\" = ?{}", sanitize_column(c)?, i + 1));
        }
        let where_clause = where_parts.join(" AND ");
        let params: Vec<Box<dyn rusqlite::types::ToSql>> = pk_vals.iter()
            .map(|v| -> Box<dyn rusqlite::types::ToSql> {
                match v.as_deref() {
                    Some(s) => Box::new(s.to_string()),
                    None => Box::new(None::<String>),
                }
            }).collect();

        match guard.execute(
            &format!("DELETE FROM \"{}\" WHERE {}", safe_table, where_clause),
            rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
        ) {
            Ok(_) => {
                count += 1;
                // 记录已应用的远程 tombstone，避免后续被当作本地删除再次上传
                let _ = guard.execute(
                    "INSERT OR REPLACE INTO sync_tombstones (table_name, pk_value, deleted_at, sync_device_id, synced_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![&table, &pk_value, &deleted_at, sync_device_id.as_deref(), now_rfc3339()],
                );
            }
            Err(e) => {
                let msg = format!("应用 {} tombstone 失败: {}", table, e);
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

    // 下载并应用其他设备产生的删除 tombstones
    match download_tombstones(&db, &pg.client, &last_sync_at, &device_id).await {
        Ok(count) => total_downloaded += count,
        Err(e) => errors.push(format!("tombstones(main): {}", e)),
    }
    match download_tombstones(&mail_db, &pg.client, &last_sync_at, &device_id).await {
        Ok(count) => total_downloaded += count,
        Err(e) => errors.push(format!("tombstones(mail): {}", e)),
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
    let safe_table = sanitize_table(table)?;
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

    let mut guard = db.lock().await;
    config::mute_sync_triggers(&guard).map_err(|e| format!("{}: 禁用触发器失败 {}", table, e))?;
    let result = apply_downloaded_rows(&mut guard, table, &pk, &pg_rows, since);
    let _ = config::unmute_sync_triggers(&guard);
    result
}

fn get_local_sync_modified(
    guard: &Connection,
    table: &str,
    pk_vals: &[Option<String>],
) -> Option<String> {
    let pk = table_pk(table);
    let safe_table = sanitize_table(table).ok()?;
    let mut where_parts = Vec::new();
    for (i, c) in pk.iter().enumerate() {
        where_parts.push(format!("\"{}\" = ?{}", sanitize_column(c).ok()?, i + 1));
    }
    let where_clause = where_parts.join(" AND ");
    let sql = format!("SELECT sync_modified_at FROM \"{}\" WHERE {}", safe_table, where_clause);
    let params: Vec<Box<dyn rusqlite::types::ToSql>> = pk_vals.iter().map(|v| -> Box<dyn rusqlite::types::ToSql> {
        match v.as_deref() {
            Some(s) => Box::new(s.to_string()),
            None => Box::new(None::<String>),
        }
    }).collect();
    guard.query_row(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |row| row.get::<_, String>(0)).ok()
}

fn get_local_updated_at(
    guard: &Connection,
    table: &str,
    pk_vals: &[Option<String>],
) -> Option<String> {
    let pk = table_pk(table);
    let safe_table = sanitize_table(table).ok()?;
    let mut where_parts = Vec::new();
    for (i, c) in pk.iter().enumerate() {
        where_parts.push(format!("\"{}\" = ?{}", sanitize_column(c).ok()?, i + 1));
    }
    let where_clause = where_parts.join(" AND ");
    // 无 updated_at 列的表（如 categories/note_folders/note_tags）查询报错 → None → 走幂等 upsert
    let sql = format!("SELECT updated_at FROM \"{}\" WHERE {}", safe_table, where_clause);
    let params: Vec<Box<dyn rusqlite::types::ToSql>> = pk_vals.iter().map(|v| -> Box<dyn rusqlite::types::ToSql> {
        match v.as_deref() {
            Some(s) => Box::new(s.to_string()),
            None => Box::new(None::<String>),
        }
    }).collect();
    guard.query_row(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |row| row.get::<_, String>(0)).ok()
}

fn apply_downloaded_rows(
    guard: &Connection,
    table: &str,
    pk: &[&str],
    pg_rows: &[tokio_postgres::Row],
    since: &str,
) -> Result<i32, String> {
    let mut count = 0i32;
    let mut conflict_count = 0i32;
    let mut first_error: Option<String> = None;
    for pg_row in pg_rows {
        let pk_vals: Vec<Option<String>> = pk.iter()
            .map(|c| pg_row.try_get::<_, Option<String>>(*c).ok().flatten())
            .collect();
        if pk_vals.iter().any(|v| v.is_none()) {
            continue;
        }
        // LWW：优先用业务语义 updated_at 比较；无该列的表回退到幂等 upsert（始终应用）。
        let pg_updated: Option<String> = pg_row.try_get("updated_at").ok();
        let local_updated = get_local_updated_at(guard, table, &pk_vals);
        let should_apply = match (&pg_updated, local_updated.as_ref()) {
            (Some(pg_ts), Some(local_ts)) => pg_ts > local_ts,
            _ => true,
        };

        // 冲突检测：本地行在最后一次同步后也被修改过（sync_modified_at > since），
        // 且云端 updated_at 与本地不一致 → 双方并发修改，暂存冲突交由用户裁决，不静默覆盖。
        let is_conflict = if let (Some(pg_ts), Some(local_ts)) = (&pg_updated, &local_updated) {
            let local_sync_modified = get_local_sync_modified(guard, table, &pk_vals);
            local_sync_modified.as_deref().map_or(false, |ts| ts > since) && pg_ts != local_ts
        } else {
            false
        };

        if is_conflict {
            // 邮件库（独立 DB）未建 sync_conflicts 表：无法暂存冲突，回退到原有 LWW 行为。
            let has_conflicts_table: bool = guard.query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_conflicts')",
                [],
                |r| r.get(0),
            ).unwrap_or(false);
            if !has_conflicts_table {
                if should_apply {
                    match upsert_local_row(guard, table, pg_row, &pk_vals) {
                        Ok(()) => count += 1,
                        Err(e) => {
                            if first_error.is_none() {
                                first_error = Some(e);
                            }
                        }
                    }
                }
                continue;
            }
            let conflict_id = uuid::Uuid::new_v4().to_string();
            let local_snapshot = local_row_snapshot(guard, table, &pk_vals).unwrap_or_else(|| "{}".to_string());
            let remote_snapshot = pg_row_snapshot(pg_row);
            let _ = guard.execute(
                "INSERT OR REPLACE INTO sync_conflicts \
                 (id, table_name, pk_value, local_snapshot, remote_snapshot, detected_at, resolved) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)",
                rusqlite::params![
                    &conflict_id, table, &serialize_pk_from_vals(&pk_vals),
                    &local_snapshot, &remote_snapshot, now_rfc3339(),
                ],
            );
            conflict_count += 1;
            continue;
        }

        if should_apply {
            match upsert_local_row(guard, table, pg_row, &pk_vals) {
                Ok(()) => count += 1,
                Err(e) => {
                    if first_error.is_none() {
                        first_error = Some(e);
                    }
                }
            }
        }
    }
    if conflict_count > 0 {
        tracing::info!("[sync] {} 存在 {} 条待处理冲突", table, conflict_count);
    }
    match first_error {
        Some(err) => Err(err),
        None => Ok(count),
    }
}

/// 将主键值序列化为 JSON 数组字符串（单列直接存值，复合列存数组）。
fn serialize_pk_from_vals(pk_vals: &[Option<String>]) -> String {
    if pk_vals.len() == 1 {
        return pk_vals[0].clone().unwrap_or_default();
    }
    let parts: Vec<&str> = pk_vals.iter().map(|v| v.as_deref().unwrap_or("")).collect();
    serde_json::to_string(&parts).unwrap_or_else(|_| parts.join("|"))
}

/// 读取本地行并序列化为 JSON 快照（供冲突界面展示与「保留云端」时回写）。
fn local_row_snapshot(guard: &Connection, table: &str, pk_vals: &[Option<String>]) -> Option<String> {
    let pk = table_pk(table);
    let safe_table = sanitize_table(table).ok()?;
    let mut where_parts = Vec::new();
    for (i, c) in pk.iter().enumerate() {
        where_parts.push(format!("\"{}\" = ?{}", sanitize_column(c).ok()?, i + 1));
    }
    let where_clause = where_parts.join(" AND ");
    let sql = format!("SELECT * FROM \"{}\" WHERE {}", safe_table, where_clause);
    let params: Vec<Box<dyn rusqlite::types::ToSql>> = pk_vals.iter().map(|v| -> Box<dyn rusqlite::types::ToSql> {
        match v.as_deref() {
            Some(s) => Box::new(s.to_string()),
            None => Box::new(None::<String>),
        }
    }).collect();
    let mut stmt = guard.prepare(&sql).ok()?;
    let cols: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
    let mut rows = stmt.query_map(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |row| {
        let mut map = serde_json::Map::new();
        for (i, c) in cols.iter().enumerate() {
            let v = match row.get_ref(i) {
                Ok(rusqlite::types::ValueRef::Null) => serde_json::Value::Null,
                Ok(rusqlite::types::ValueRef::Integer(n)) => serde_json::Value::from(n),
                Ok(rusqlite::types::ValueRef::Real(f)) => serde_json::Value::from(f),
                Ok(rusqlite::types::ValueRef::Text(t)) => serde_json::Value::String(String::from_utf8_lossy(t).into_owned()),
                Ok(rusqlite::types::ValueRef::Blob(b)) => serde_json::Value::String(format!("\\x{}", b.iter().map(|x| format!("{:02x}", x)).collect::<String>())),
                Err(_) => serde_json::Value::Null,
            };
            map.insert(c.clone(), v);
        }
        Ok(serde_json::Value::Object(map))
    }).ok()?;
    let first = rows.next()?.ok()?;
    serde_json::to_string(&first).ok()
}

/// 将 PostgreSQL 行序列化为 JSON 快照。
fn pg_row_snapshot(pg_row: &tokio_postgres::Row) -> String {
    let mut map = serde_json::Map::new();
    for col in pg_row.columns() {
        let name = col.name();
        let v = if let Ok(Some(s)) = pg_row.try_get::<_, Option<String>>(name) {
            serde_json::Value::String(s)
        } else if let Ok(Some(n)) = pg_row.try_get::<_, Option<i64>>(name) {
            serde_json::Value::from(n)
        } else if let Ok(Some(f)) = pg_row.try_get::<_, Option<f64>>(name) {
            serde_json::Value::from(f)
        } else {
            serde_json::Value::Null
        };
        map.insert(name.to_string(), v);
    }
    serde_json::Value::Object(map).to_string()
}

/// 将云端冲突快照（JSON 对象）写回本地表，作为「采用云端版本」的裁决结果。
/// 写回后把 sync_modified_at 置为当前时间、sync_device_id 置为本地设备，
/// 保证该行在下一轮下载中被过滤（避免无限回拉），并作为本地最新变更正常上传。
pub fn apply_conflict_remote(
    guard: &Connection,
    table: &str,
    _pk_value: &str,
    remote_snapshot: &str,
) -> Result<(), String> {
    let obj: serde_json::Map<String, serde_json::Value> = serde_json::from_str(remote_snapshot)
        .map_err(|e| format!("解析云端快照失败: {}", e))?;
    if obj.is_empty() {
        return Err("云端快照为空".to_string());
    }
    let safe_table = sanitize_table(table)?;
    let pk = table_pk(table);

    // 快照中缺失主键列则直接报错（无法定位行）
    for c in pk {
        if !obj.contains_key(*c) {
            return Err(format!("云端快照缺少主键列 {}", c));
        }
    }

    let cols: Vec<String> = obj.keys().cloned().collect();
    // 仅保留快照中存在的、且为合法标识符的列
    let mut insert_cols: Vec<String> = Vec::new();
    for c in &cols {
        let sc = sanitize_column(c)?;
        insert_cols.push(sc);
    }
    if insert_cols.is_empty() {
        return Err("云端快照无有效列".to_string());
    }

    let placeholders: Vec<String> = (1..=insert_cols.len()).map(|i| format!("?{}", i)).collect();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    for c in &cols {
        let v = obj.get(c).cloned().unwrap_or(serde_json::Value::Null);
        params.push(snapshot_val_to_param(&v));
    }

    // 冲突裁决视为一次本地变更：覆盖 sync_modified_at/sync_device_id
    let now = now_rfc3339();
    let device_id = guard.query_row(
        "SELECT device_id FROM device_info WHERE id = 'local'",
        [],
        |r| r.get::<_, String>(0),
    ).unwrap_or_else(|_| uuid::Uuid::new_v4().to_string());

    let mut set_parts: Vec<String> = Vec::new();
    let mut set_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    for c in &insert_cols {
        if pk.contains(&c.as_str()) {
            continue;
        }
        set_parts.push(format!("\"{}\" = ?{}", c, insert_cols.len() + set_params.len() + 1));
        let v = obj.get(c).cloned().unwrap_or(serde_json::Value::Null);
        set_params.push(snapshot_val_to_param(&v));
    }
    set_parts.push(format!("\"sync_modified_at\" = ?{}", insert_cols.len() + set_params.len() + 1));
    set_params.push(Box::new(now.clone()));
    set_parts.push(format!("\"sync_device_id\" = ?{}", insert_cols.len() + set_params.len() + 1));
    set_params.push(Box::new(device_id));

    let mut conflict_cols_vec = Vec::new();
    for c in pk.iter() {
        conflict_cols_vec.push(format!("\"{}\"", sanitize_column(c)?));
    }
    let conflict_cols = conflict_cols_vec.join(", ");

    // 表可能没有 sync_modified_at 列（如某些关联表）——先检测，若存在才写入
    let has_sync_cols = guard.query_row(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name IN ('sync_modified_at','sync_device_id'))",
        rusqlite::params![safe_table],
        |r| r.get::<_, bool>(0),
    ).unwrap_or(false);

    let full_sql = if has_sync_cols {
        format!(
            "INSERT INTO \"{}\" ({}) VALUES ({}) ON CONFLICT ({}) DO UPDATE SET {}",
            safe_table,
            insert_cols.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", "),
            placeholders.join(", "),
            conflict_cols,
            set_parts.join(", "),
        )
    } else {
        format!(
            "INSERT INTO \"{}\" ({}) VALUES ({}) ON CONFLICT ({}) DO UPDATE SET {}",
            safe_table,
            insert_cols.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", "),
            placeholders.join(", "),
            conflict_cols,
            insert_cols.iter()
                .filter(|c| !pk.contains(&c.as_str()))
                .map(|c| format!("\"{}\" = excluded.\"{}\"", c, c))
                .collect::<Vec<_>>().join(", "),
        )
    };

    let mut all_params: Vec<Box<dyn rusqlite::types::ToSql>> = params;
    all_params.extend(set_params);
    guard.execute(&full_sql, rusqlite::params_from_iter(all_params.iter().map(|p| p.as_ref())))
        .map_err(|e| format!("写回本地 {} 失败: {}", table, e))?;
    Ok(())
}

/// 将 JSON 值转换为 SQLite 参数。
fn snapshot_val_to_param(v: &serde_json::Value) -> Box<dyn rusqlite::types::ToSql> {
    match v {
        serde_json::Value::Null => Box::new(None::<String>),
        serde_json::Value::String(s) => Box::new(s.clone()),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else if let Some(f) = n.as_f64() {
                Box::new(f)
            } else {
                Box::new(n.to_string())
            }
        }
        serde_json::Value::Bool(b) => Box::new(*b),
        _ => Box::new(v.to_string()),
    }
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

fn upsert_local_row(
    guard: &Connection,
    table: &str,
    pg_row: &tokio_postgres::Row,
    pk_vals: &[Option<String>],
) -> Result<(), String> {
    let pk = table_pk(table);
    let columns: Vec<String> = pg_row.columns().iter().map(|c| c.name().to_string()).collect();
    let safe_table = sanitize_table(table)?;

    let mut where_parts = Vec::new();
    for (i, c) in pk.iter().enumerate() {
        where_parts.push(format!("\"{}\" = ?{}", sanitize_column(c)?, i + 1));
    }
    let where_clause = where_parts.join(" AND ");

    let pk_params: Vec<Box<dyn rusqlite::types::ToSql>> = pk_vals.iter().map(|v| -> Box<dyn rusqlite::types::ToSql> {
        match v.as_deref() {
            Some(s) => Box::new(s.to_string()),
            None => Box::new(None::<String>),
        }
    }).collect();

    let existing: bool = guard.query_row(
        &format!("SELECT 1 FROM \"{}\" WHERE {}", safe_table, where_clause),
        rusqlite::params_from_iter(pk_params.iter().map(|p| p.as_ref())),
        |_| Ok(true),
    ).unwrap_or(false);

    if existing {
        let non_pk: Vec<&String> = columns.iter().filter(|c| !pk.contains(&c.as_str())).collect();
        if non_pk.is_empty() {
            return Ok(());
        }
        // 参数索引必须递增：?1..?k 为主键，其后按列顺序 ?(k+1)..?n
        let mut set_parts = Vec::new();
        for (idx, c) in non_pk.iter().enumerate() {
            set_parts.push(format!("\"{}\" = ?{}", sanitize_column(c)?, pk.len() + idx + 1));
        }
        let sql = format!("UPDATE \"{}\" SET {} WHERE {}", safe_table, set_parts.join(", "), where_clause);

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
        let mut conflict_cols_vec = Vec::new();
        for c in pk.iter() {
            conflict_cols_vec.push(format!("\"{}\"", sanitize_column(c)?));
        }
        let conflict_cols = conflict_cols_vec.join(", ");
        let mut upsert_set = Vec::new();
        for c in &columns {
            if pk.contains(&c.as_str()) {
                continue;
            }
            let sc = sanitize_column(c)?;
            upsert_set.push(format!("\"{}\" = excluded.\"{}\"", sc, sc));
        }
        let mut insert_cols_vec = Vec::new();
        for c in &columns {
            insert_cols_vec.push(format!("\"{}\"", sanitize_column(c)?));
        }
        let insert_cols = insert_cols_vec.join(", ");
        let sql = format!(
            "INSERT INTO \"{}\" ({}) VALUES ({}) ON CONFLICT ({}) DO UPDATE SET {}",
            safe_table,
            insert_cols,
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

/// 清理超过保留期的已同步 tombstones（本地 + 云端）。
/// 在完整同步成功后调用，避免保留期内的设备错过删除传播。
async fn cleanup_tombstones(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    mail_db: &Arc<tokio::sync::Mutex<Connection>>,
    pg: &Client,
) {
    let cutoff = chrono::Utc::now() - chrono::Duration::days(TOMBSTONE_RETENTION_DAYS);
    let cutoff_str = cutoff.to_rfc3339();

    let _ = pg.execute(
        "DELETE FROM sync_tombstones WHERE deleted_at < $1",
        &[&cutoff_str],
    ).await;

    let guard = db.lock().await;
    let _ = guard.execute(
        "DELETE FROM sync_tombstones WHERE synced_at IS NOT NULL AND synced_at < ?1",
        params![&cutoff_str],
    );
    drop(guard);

    let guard = mail_db.lock().await;
    let _ = guard.execute(
        "DELETE FROM sync_tombstones WHERE synced_at IS NOT NULL AND synced_at < ?1",
        params![&cutoff_str],
    );
}

pub async fn full_sync(
    db: &Arc<tokio::sync::Mutex<Connection>>,
    mail_db: &Arc<tokio::sync::Mutex<Connection>>,
) -> Result<SyncResult, String> {
    tracing::info!("开始全量同步...");

    let upload_result = sync_upload(db, mail_db).await?;
    let download_result = sync_download(db, mail_db).await?;

    if upload_result.success && download_result.success {
        // 复用下载阶段已建立的 PG 连接清理过期 tombstones
        let cfg = {
            let guard = db.lock().await;
            config::get_sync_config(&guard).ok().flatten()
        };
        if let Some(cfg) = cfg {
            if cfg.enabled {
                if let Ok(pg) = crate::sync::postgres::connect(&cfg.connection_string).await {
                    cleanup_tombstones(db, mail_db, &pg.client).await;
                }
            }
        }
    }

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
