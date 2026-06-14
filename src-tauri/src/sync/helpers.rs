use rusqlite::{params, Connection, Result};

/// 标记记录为 dirty（待同步）
pub fn mark_dirty(conn: &Connection, table: &str, id: i64) -> Result<()> {
    let sql = format!(
        "UPDATE {} SET sync_status = 'dirty', sync_version = sync_version + 1 WHERE id = ?1",
        table
    );
    conn.execute(&sql, params![id])?;
    Ok(())
}

/// 标记记录为 deleting（待删除同步）
pub fn mark_deleting(conn: &Connection, table: &str, id: i64) -> Result<()> {
    let sql = format!(
        "UPDATE {} SET sync_status = 'deleting', sync_version = sync_version + 1 WHERE id = ?1",
        table
    );
    conn.execute(&sql, params![id])?;
    Ok(())
}

/// 标记记录为 clean（已同步）
pub fn mark_clean(conn: &Connection, table: &str, id: i64) -> Result<()> {
    let sql = format!(
        "UPDATE {} SET sync_status = 'clean' WHERE id = ?1",
        table
    );
    conn.execute(&sql, params![id])?;
    Ok(())
}

/// 批量标记记录为 clean
pub fn mark_clean_batch(conn: &Connection, table: &str, ids: &[i64]) -> Result<()> {
    if ids.is_empty() {
        return Ok(());
    }
    let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{}", i)).collect();
    let sql = format!(
        "UPDATE {} SET sync_status = 'clean' WHERE id IN ({})",
        table,
        placeholders.join(",")
    );
    let params_vec: Vec<Box<dyn rusqlite::types::ToSql>> =
        ids.iter().map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>).collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())?;
    Ok(())
}
