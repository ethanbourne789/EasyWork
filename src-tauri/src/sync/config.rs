use rusqlite::{Connection, params};
use super::*;

/// 创建同步相关的数据库表（sync_config, sync_log, device_info, sync_mute_triggers），如果表已存在则跳过。
pub fn create_sync_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(r#"
        CREATE TABLE IF NOT EXISTS sync_config (
            id TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL DEFAULT 0,
            provider TEXT NOT NULL DEFAULT 'custom',
            connection_string TEXT NOT NULL DEFAULT '',
            database_name TEXT NOT NULL DEFAULT '',
            last_sync_at TEXT,
            sync_error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_log (
            id TEXT PRIMARY KEY,
            direction TEXT NOT NULL,
            table_name TEXT NOT NULL,
            records_count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL,
            error_message TEXT,
            duration_ms INTEGER,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sync_log_created ON sync_log(created_at DESC);

        CREATE TABLE IF NOT EXISTS device_info (
            id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL UNIQUE,
            device_name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_mute_triggers (
            id INTEGER PRIMARY KEY CHECK (id = 0),
            muted INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO sync_mute_triggers (id, muted) VALUES (0, 0);

        -- 云同步冲突记录：本地与云端同时修改同一行且内容不一致时暂存，由用户在 UI 中决定保留哪一方。
        CREATE TABLE IF NOT EXISTS sync_conflicts (
            id TEXT PRIMARY KEY,
            table_name TEXT NOT NULL,
            pk_value TEXT NOT NULL,
            local_snapshot TEXT NOT NULL,
            remote_snapshot TEXT NOT NULL,
            detected_at TEXT NOT NULL,
            resolved INTEGER NOT NULL DEFAULT 0,
            UNIQUE (table_name, pk_value)
        );
        CREATE INDEX IF NOT EXISTS idx_sync_conflicts_resolved ON sync_conflicts(resolved, detected_at);
    "#)
}

/// 生成当前时间的 RFC3339 格式时间戳（带微秒精度）。
fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Micros, true)
}

/// 从 sync_config 表中读取 id='default' 的同步配置，如果没有配置则返回 None。
/// 连接串保存在系统密钥库中，表中仅留空占位。
pub fn get_sync_config(conn: &Connection) -> rusqlite::Result<Option<SyncConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, enabled, provider, connection_string, database_name, \
         last_sync_at, sync_error, created_at, updated_at \
         FROM sync_config WHERE id = 'default'"
    )?;
    let result = stmt.query_map(params![], |row| {
        let mut cfg = SyncConfig {
            id: row.get(0)?,
            enabled: row.get::<_, i32>(1)? != 0,
            provider: row.get(2)?,
            connection_string: row.get(3)?,
            database_name: row.get(4)?,
            last_sync_at: row.get(5)?,
            sync_error: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        };
        // 如果表中连接串为空，尝试从系统密钥库回填。
        if cfg.connection_string.is_empty() {
            if let Some(cs) = super::creds::get_connection_string() {
                cfg.connection_string = cs;
            }
        }
        Ok(cfg)
    });
    match result {
        Ok(rows) => {
            let mut config = None;
            for row in rows {
                config = row.ok();
            }
            Ok(config)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// 将同步配置写入 sync_config 表，使用 INSERT OR REPLACE 实现Upsert（id='default'）。
/// 连接串不写入 SQLite，而是保存到系统密钥库，避免随备份导出外泄。
pub fn save_sync_config(conn: &Connection, config: &SyncConfig) -> Result<(), String> {
    let connection_string = config.connection_string.clone();
    if let Err(e) = super::creds::save_connection_string(&connection_string) {
        return Err(e);
    }
    let mut db_config = config.clone();
    db_config.connection_string = String::new();
    conn.execute(
        "INSERT OR REPLACE INTO sync_config \
         (id, enabled, provider, connection_string, database_name, \
          last_sync_at, sync_error, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            db_config.id,
            db_config.enabled as i32,
            db_config.provider,
            db_config.connection_string,
            db_config.database_name,
            db_config.last_sync_at,
            db_config.sync_error,
            db_config.created_at,
            db_config.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 删除 sync_config 表中的默认同步配置，并清除密钥库中的连接串。
pub fn delete_sync_config(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM sync_config WHERE id = 'default'",
        params![],
    )
    .map_err(|e| e.to_string())?;
    super::creds::delete_connection_string()?;
    Ok(())
}

/// 获取当前设备的唯一 ID。如果设备信息不存在，则自动生成一个 UUID v4 并写入 device_info 表。
pub fn get_device_id(conn: &Connection) -> rusqlite::Result<String> {
    let mut stmt = conn.prepare(
        "SELECT device_id FROM device_info WHERE id = 'local'"
    )?;
    let result: Option<String> = stmt.query_row(params![], |row| row.get(0)).ok();
    match result {
        Some(id) => Ok(id),
        None => {
            // 设备信息不存在，生成新的 UUID 并写入
            let new_id = uuid::Uuid::new_v4().to_string();
            let n = now_rfc3339();
            conn.execute(
                "INSERT OR REPLACE INTO device_info (id, device_id, device_name, created_at) \
                 VALUES ('local', ?1, 'EasyWork Device', ?2)",
                params![new_id.clone(), n],
            )?;
            Ok(new_id)
        }
    }
}

/// 设置当前设备的显示名称。如果设备记录不存在，则先创建一条新记录。
pub fn set_device_name(conn: &Connection, name: &str) -> rusqlite::Result<()> {
    let exists: i32 = conn.query_row(
        "SELECT COUNT(*) FROM device_info WHERE id = 'local'",
        params![],
        |row| row.get(0),
    )?;
    if exists == 0 {
        // 设备记录不存在，创建新记录
        let device_id = uuid::Uuid::new_v4().to_string();
        let n = now_rfc3339();
        conn.execute(
            "INSERT INTO device_info (id, device_id, device_name, created_at) \
             VALUES ('local', ?1, ?2, ?3)",
            params![device_id, name, n],
        )?;
    } else {
        // 更新现有设备名称
        conn.execute(
            "UPDATE device_info SET device_name = ?1 WHERE id = 'local'",
            params![name],
        )?;
    }
    Ok(())
}

/// 获取当前设备的显示名称。
pub fn get_device_name(conn: &Connection) -> rusqlite::Result<String> {
    conn.query_row(
        "SELECT device_name FROM device_info WHERE id = 'local'",
        params![],
        |row| row.get(0),
    )
}

/// 向 sync_log 表写入一条同步事件日志记录。
pub fn log_sync_event(
    conn: &Connection,
    direction: &str,
    table: &str,
    count: i32,
    status: &str,
    error: Option<&str>,
    duration_ms: Option<i64>,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let created = now_rfc3339();
    conn.execute(
        "INSERT INTO sync_log (id, direction, table_name, records_count, status, error_message, duration_ms, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, direction, table, count, status, error, duration_ms, created],
    )?;
    Ok(())
}

/// insert_sync_event 的兼容别名（供 engine.rs 调用）。
pub fn insert_sync_log(
    conn: &Connection,
    direction: &str,
    table_name: &str,
    records_count: i32,
    status: &str,
    error_message: Option<&str>,
    duration_ms: Option<i64>,
) -> rusqlite::Result<()> {
    log_sync_event(conn, direction, table_name, records_count, status, error_message, duration_ms)
}

/// 查询最新的同步日志记录，按创建时间倒序排列，返回指定数量的记录。
pub fn get_sync_logs(conn: &Connection, limit: i32) -> rusqlite::Result<Vec<SyncLogEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, direction, table_name, records_count, status, error_message, duration_ms, created_at \
         FROM sync_log ORDER BY created_at DESC LIMIT ?1"
    )?;
    let rows = stmt.query_map(params![limit], |row| {
        Ok(SyncLogEntry {
            id: row.get(0)?,
            direction: row.get(1)?,
            table_name: row.get(2)?,
            records_count: row.get(3)?,
            status: row.get(4)?,
            error_message: row.get(5)?,
            duration_ms: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

/// get_sync_logs 的兼容别名（供 engine.rs 调用）。
pub fn get_sync_log(conn: &Connection, limit: i32) -> rusqlite::Result<Vec<SyncLogEntry>> {
    get_sync_logs(conn, limit)
}

/// 更新 sync_config 表中的同步错误信息和最后同步时间。
/// 如果 error 为 None，则清空错误信息；如果为 Some，则写入错误消息并更新时间戳。
pub fn update_sync_error(conn: &Connection, error: Option<&str>) -> rusqlite::Result<()> {
    let n = now_rfc3339();
    match error {
        Some(err_msg) => {
            conn.execute(
                "UPDATE sync_config SET sync_error = ?1, updated_at = ?2 WHERE id = 'default'",
                params![err_msg, n],
            )?;
        }
        None => {
            conn.execute(
                "UPDATE sync_config SET sync_error = NULL, updated_at = ?1 WHERE id = 'default'",
                params![n],
            )?;
        }
    }
    Ok(())
}

/// update_sync_error 的兼容别名（接受 &str 参数，供 engine.rs 调用）。
pub fn update_sync_error_str(conn: &Connection, error: &str) -> rusqlite::Result<()> {
    update_sync_error(conn, Some(error))
}

/// 更新最后同步成功的时间戳，并清空错误信息。
pub fn update_last_sync_at(conn: &Connection) -> rusqlite::Result<()> {
    let n = now_rfc3339();
    conn.execute(
        "UPDATE sync_config SET last_sync_at = ?1, sync_error = NULL, updated_at = ?1 WHERE id = 'default'",
        params![n],
    )?;
    Ok(())
}

/// 在同步下载期间临时禁用业务表的 sync_modified_at UPDATE 触发器，
/// 以便写入云端同步时间戳而不触发本地更新时间戳，避免下载回环。
pub fn mute_sync_triggers(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO sync_mute_triggers (id, muted) VALUES (0, 1)",
        [],
    )?;
    Ok(())
}

/// 恢复业务表的 sync_modified_at UPDATE 触发器。
pub fn unmute_sync_triggers(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO sync_mute_triggers (id, muted) VALUES (0, 0)",
        [],
    )?;
    Ok(())
}
