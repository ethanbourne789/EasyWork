use rusqlite::{params, Result as SqlResult};
use crate::db::DbPool;

/// 同步状态
pub const SYNC_CLEAN: &str = "clean";
pub const SYNC_DIRTY: &str = "dirty";
pub const SYNC_DELETING: &str = "deleting";

/// 需要同步的表清单
pub const SYNC_TABLES: &[&str] = &[
    "transactions",
    "categories",
    "budgets",
    "sports_records",
    "stock_watchlist",
    "stock_trades",
    "stock_alerts",
    "mail_accounts",
    "mail_folders",
    "mail_signatures",
    "mail_contacts",
    "mail_contact_groups",
    "notes",
    "note_folders",
    "calendars",
    "tasks",
    "timelines",
    "settings",
    "app_config",
];

/// 查询本地所有 dirty/deleting 的记录（返回 JSON 数组）
pub fn get_dirty_rows(pool: &DbPool, table: &str) -> SqlResult<Vec<serde_json::Value>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let sql = format!(
        "SELECT * FROM {} WHERE sync_status IN ('dirty', 'deleting') ORDER BY sync_version ASC",
        table
    );
    let mut stmt = conn.prepare(&sql)?;
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt.query_map([], |row| {
        let mut map = serde_json::Map::new();
        for (i, col) in cols.iter().enumerate() {
            // 跳过 sync 元数据字段，不上传到云端
            if col == "sync_status" || col == "sync_version" {
                continue;
            }
            let val: rusqlite::types::Value = row.get(i)?;
            map.insert(col.clone(), sqlite_value_to_json(val));
        }
        Ok(serde_json::Value::Object(map))
    })?;
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

/// 查询某表自 last_synced_at 以来云端变更的行
/// （由 SyncEngine 调用 Supabase select_since 后传入）
pub fn merge_remote_rows(pool: &DbPool, table: &str, rows: &[serde_json::Value]) -> SqlResult<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let tx = conn.unchecked_transaction()?;

    for row in rows {
        let obj = match row.as_object() {
            Some(o) => o,
            None => continue,
        };
        // 提取 id
        let id = match obj.get("id").and_then(|v| v.as_i64()) {
            Some(id) => id,
            None => continue,
        };

        // 检查本地是否有更新的版本（last-write-wins）
        let local_newer: bool = tx.query_row(
            &format!("SELECT sync_status = 'dirty' AND sync_version > ?1 FROM {} WHERE id = ?2", table),
            params![obj.get("sync_version").and_then(|v| v.as_i64()).unwrap_or(0), id],
            |r| r.get(0),
        ).unwrap_or(false);

        if local_newer {
            // 本地有更新版本，跳过远端旧数据
            continue;
        }

        // UPSERT：构造 INSERT OR REPLACE
        let cols: Vec<&str> = obj.keys().map(|k| k.as_str()).collect();
        let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("?{}", i)).collect();
        let sql = format!(
            "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
            table,
            cols.join(", "),
            placeholders.join(", ")
        );
        let params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = cols
            .iter()
            .map(|col| {
                let val = obj.get(*col).unwrap_or(&serde_json::Value::Null);
                json_to_sqlite_param(val)
            })
            .collect();
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
        tx.execute(&sql, param_refs.as_slice()).ok();

        // 标记为 clean
        tx.execute(
            &format!("UPDATE {} SET sync_status = 'clean' WHERE id = ?1", table),
            params![id],
        ).ok();
    }

    tx.commit()?;
    Ok(())
}

/// 将本地 dirty 行标记为 clean
pub fn mark_clean(pool: &DbPool, table: &str, ids: &[i64]) -> SqlResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{}", i)).collect();
    let sql = format!(
        "UPDATE {} SET sync_status = '{}' WHERE id IN ({})",
        table,
        SYNC_CLEAN,
        placeholders.join(",")
    );
    let params_vec: Vec<Box<dyn rusqlite::types::ToSql>> =
        ids.iter().map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>).collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())?;
    Ok(())
}

/// 删除本地标记为 deleting 的行（上传成功后调用）
pub fn purge_deleted(pool: &DbPool, table: &str, ids: &[i64]) -> SqlResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{}", i)).collect();
    let sql = format!("DELETE FROM {} WHERE id IN ({})", table, placeholders.join(","));
    let params_vec: Vec<Box<dyn rusqlite::types::ToSql>> =
        ids.iter().map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>).collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())?;
    Ok(())
}

/// 获取某表最后同步时间
pub fn get_last_synced_at(pool: &DbPool, table: &str) -> SqlResult<Option<String>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let result = conn.query_row(
        "SELECT last_synced_at FROM sync_global_version WHERE table_name = ?1",
        params![table],
        |row| row.get(0),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// 更新某表的最后同步时间
pub fn set_last_synced_at(pool: &DbPool, table: &str, ts: &str) -> SqlResult<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO sync_global_version (table_name, last_synced_at) VALUES (?1, ?2)
         ON CONFLICT(table_name) DO UPDATE SET last_synced_at = ?2",
        params![table, ts],
    )?;
    Ok(())
}

// ── helpers ──

fn sqlite_value_to_json(v: rusqlite::types::Value) -> serde_json::Value {
    use rusqlite::types::Value;
    match v {
        Value::Null => serde_json::Value::Null,
        Value::Integer(i) => serde_json::Value::Number(i.into()),
        Value::Real(f) => serde_json::Number::from_f64(f)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Value::Text(s) => serde_json::Value::String(s),
        Value::Blob(b) => serde_json::Value::String(base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            &b,
        )),
    }
}

fn json_to_sqlite_param(v: &serde_json::Value) -> Box<dyn rusqlite::types::ToSql> {
    use serde_json::Value;
    match v {
        Value::Null => Box::new(rusqlite::types::Null),
        Value::Bool(b) => Box::new(if *b { 1i32 } else { 0i32 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else if let Some(f) = n.as_f64() {
                Box::new(f)
            } else {
                Box::new(rusqlite::types::Null)
            }
        }
        Value::String(s) => Box::new(s.clone()),
        // 数组/对象存为 JSON 字符串
        other => Box::new(other.to_string()),
    }
}
