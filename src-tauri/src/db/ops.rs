use rusqlite::{params, Result};
use crate::db::DbPool;
use crate::mail::{MailAccount, MailFolder, MailMessage, MailMessageSummary, PendingOp};

pub fn insert_account(pool: &DbPool, account: &MailAccount) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    // Simple base64 "encryption" for Phase 1 — replace with AES+keyring later
    let encoded_pw = base64_encode(account.password.as_bytes());
    conn.execute(
        "INSERT INTO mail_accounts (email, provider, imap_host, imap_port, smtp_host, smtp_port, username, encrypted_password, use_tls, sync_interval_secs, sync_period_days)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            account.email, account.provider, account.imap_host,
            account.imap_port, account.smtp_host, account.smtp_port,
            account.username, encoded_pw,
            account.use_tls as i32, account.sync_interval_secs, account.sync_period_days
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

fn base64_encode(data: &[u8]) -> Vec<u8> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(data).into_bytes()
}

fn base64_decode(data: &[u8]) -> Option<Vec<u8>> {
    use base64::Engine;
    let s = std::str::from_utf8(data).ok()?;
    base64::engine::general_purpose::STANDARD.decode(s).ok()
}

/// Get full account info including decoded password for IMAP connection
pub fn get_account_with_password(pool: &DbPool, account_id: i64) -> Result<Option<(MailAccount, String)>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let result = conn.query_row(
        "SELECT id, email, provider, imap_host, imap_port, smtp_host, smtp_port,
                username, encrypted_password, use_tls, sync_interval_secs, sync_period_days, sync_state
         FROM mail_accounts WHERE id = ?1",
        params![account_id],
        |row| {
            let encrypted: Vec<u8> = row.get(8)?;
            let password = base64_decode(&encrypted)
                .and_then(|b| String::from_utf8(b).ok())
                .unwrap_or_default();
            Ok((
                MailAccount {
                    id: Some(row.get(0)?),
                    email: row.get(1)?,
                    provider: row.get(2)?,
                    imap_host: row.get(3)?,
                    imap_port: row.get::<_, i32>(4)? as u16,
                    smtp_host: row.get(5)?,
                    smtp_port: row.get::<_, i32>(6)? as u16,
                    username: row.get(7)?,
                    password: String::new(),
                    use_tls: row.get::<_, i32>(9)? != 0,
                    sync_interval_secs: row.get(10)?,
                    sync_period_days: row.get(11)?,
                },
                password,
            ))
        },
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn list_accounts(pool: &DbPool) -> Result<Vec<MailAccount>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, email, provider, imap_host, imap_port, smtp_host, smtp_port, username, use_tls, sync_interval_secs, sync_period_days FROM mail_accounts"
    )?;
    let accounts = stmt.query_map([], |row| {
        Ok(MailAccount {
            id: Some(row.get(0)?),
            email: row.get(1)?,
            provider: row.get(2)?,
            imap_host: row.get(3)?,
            imap_port: row.get::<_, i32>(4)? as u16,
            smtp_host: row.get(5)?,
            smtp_port: row.get::<_, i32>(6)? as u16,
            username: row.get(7)?,
            password: String::new(),
            use_tls: row.get::<_, i32>(8)? != 0,
            sync_interval_secs: row.get(9)?,
            sync_period_days: row.get(10)?,
        })
    })?;
    accounts.collect()
}

pub fn delete_account(pool: &DbPool, id: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute("DELETE FROM mail_accounts WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn store_encrypted_password(pool: &DbPool, account_id: i64, encrypted: &[u8]) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_accounts SET encrypted_password = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![encrypted, account_id],
    )?;
    Ok(())
}

pub fn get_encrypted_password(pool: &DbPool, account_id: i64) -> Result<Option<Vec<u8>>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare("SELECT encrypted_password FROM mail_accounts WHERE id = ?1")?;
    let result: Option<Vec<u8>> = stmt.query_row(params![account_id], |row| row.get(0)).ok();
    Ok(result)
}

pub fn insert_message(pool: &DbPool, msg: &MailMessage) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    // Upsert: check if message with same account_id + remote_uid exists
    let existing: Option<i64> = conn.query_row(
        "SELECT id FROM mail_messages WHERE account_id = ?1 AND remote_uid = ?2",
        params![msg.account_id, msg.remote_uid],
        |row| row.get(0),
    ).ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE mail_messages SET subject=?1, from_name=?2, from_email=?3, to_list=?4, cc_list=?5,
             body_text=?6, body_html=?7, is_read=?8, is_starred=?9, has_attachment=?10, size=?11,
             date=?12 WHERE id=?13",
            params![
                msg.subject, msg.from_name, msg.from_email, msg.to_list, msg.cc_list,
                msg.body_text, msg.body_html, msg.is_read as i32, msg.is_starred as i32,
                msg.has_attachment as i32, msg.size, msg.date, id
            ],
        )?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO mail_messages (account_id, remote_uid, message_id_header, subject, from_name, from_email,
             to_list, cc_list, date, body_text, body_html, is_read, is_starred, has_attachment, size)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
            params![
                msg.account_id, msg.remote_uid, msg.message_id_header,
                msg.subject, msg.from_name, msg.from_email, msg.to_list, msg.cc_list,
                msg.date, msg.body_text, msg.body_html,
                msg.is_read as i32, msg.is_starred as i32,
                msg.has_attachment as i32, msg.size
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }
}

pub fn list_messages(
    pool: &DbPool,
    account_id: i64,
    folder_id: Option<i64>,
    page: i64,
    page_size: i64,
) -> Result<Vec<MailMessageSummary>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let offset = (page - 1) * page_size;

    let query = if let Some(_fid) = folder_id {
        "SELECT m.id, m.account_id, m.remote_uid, m.subject, m.from_name, m.from_email, m.date,
                m.is_read, m.is_starred, m.has_attachment, m.size
         FROM mail_messages m
         JOIN mail_message_folders mf ON m.id = mf.message_id
         WHERE m.account_id = ?1 AND mf.folder_id = ?2
         ORDER BY m.date DESC LIMIT ?3 OFFSET ?4"
    } else {
        "SELECT id, account_id, remote_uid, subject, from_name, from_email, date,
                is_read, is_starred, has_attachment, size
         FROM mail_messages WHERE account_id = ?1
         ORDER BY date DESC LIMIT ?2 OFFSET ?3"
    };

    // Diagnostic: count total messages for this account
    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM mail_messages WHERE account_id = ?1",
        rusqlite::params![account_id],
        |row| row.get(0),
    ).unwrap_or(0);
    log::info!(
        "list_messages: account_id={}, folder_id={:?}, page={}, page_size={}, total_in_db={}",
        account_id, folder_id, page, page_size, total
    );

    let mut stmt = conn.prepare(query)?;
    let rows = if let Some(fid) = folder_id {
        stmt.query_map(params![account_id, fid, page_size, offset], map_summary)?
    } else {
        stmt.query_map(params![account_id, page_size, offset], map_summary)?
    };

    let messages: Vec<MailMessageSummary> = rows.filter_map(|r| r.ok()).collect();
    log::info!("list_messages returned {} messages", messages.len());
    if let Some(first) = messages.first() {
        log::info!("list_messages first: id={} subject='{}' from='{}' date='{}'",
            first.id, first.subject, first.from_email, first.date);
    }
    Ok(messages)
}

fn map_summary(row: &rusqlite::Row) -> Result<MailMessageSummary> {
    Ok(MailMessageSummary {
        id: row.get(0)?,
        account_id: row.get(1)?,
        remote_uid: row.get(2)?,
        subject: row.get(3)?,
        from_name: row.get(4)?,
        from_email: row.get(5)?,
        date: row.get(6)?,
        is_read: row.get::<_, i32>(7)? != 0,
        is_starred: row.get::<_, i32>(8)? != 0,
        has_attachment: row.get::<_, i32>(9)? != 0,
        size: row.get(10)?,
    })
}

pub fn get_message_body(pool: &DbPool, message_id: i64) -> Result<(String, String)> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.query_row(
        "SELECT body_text, body_html FROM mail_messages WHERE id = ?1",
        params![message_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
}

pub fn mark_read(pool: &DbPool, message_id: i64, is_read: bool) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_messages SET is_read = ?1 WHERE id = ?2",
        params![is_read as i32, message_id],
    )?;
    Ok(())
}

pub fn toggle_star(pool: &DbPool, message_id: i64) -> Result<bool> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let current: bool = conn.query_row(
        "SELECT is_starred FROM mail_messages WHERE id = ?1",
        params![message_id],
        |row| row.get::<_, i32>(0).map(|v| v != 0),
    )?;
    let new_val = !current;
    conn.execute(
        "UPDATE mail_messages SET is_starred = ?1 WHERE id = ?2",
        params![new_val as i32, message_id],
    )?;
    Ok(new_val)
}

pub fn update_sync_state(pool: &DbPool, account_id: i64, sync_state: &str) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_accounts SET sync_state = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![sync_state, account_id],
    )?;
    Ok(())
}

pub fn insert_folder(pool: &DbPool, folder: &MailFolder) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let existing: Option<i64> = conn.query_row(
        "SELECT id FROM mail_folders WHERE account_id = ?1 AND remote_id = ?2",
        params![folder.account_id, folder.remote_id],
        |row| row.get(0),
    ).ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE mail_folders SET name=?1, role=?2, folder_type=?3 WHERE id=?4",
            params![folder.name, folder.role, folder.folder_type, id],
        )?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO mail_folders (account_id, remote_id, name, role, folder_type) VALUES (?1,?2,?3,?4,?5)",
            params![folder.account_id, folder.remote_id, folder.name, folder.role, folder.folder_type],
        )?;
        Ok(conn.last_insert_rowid())
    }
}

pub fn list_folders(pool: &DbPool, account_id: i64) -> Result<Vec<MailFolder>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, account_id, remote_id, name, role, folder_type FROM mail_folders WHERE account_id = ?1"
    )?;
    let folders = stmt.query_map(params![account_id], |row| {
        Ok(MailFolder {
            id: Some(row.get(0)?),
            account_id: row.get(1)?,
            remote_id: row.get(2)?,
            name: row.get(3)?,
            role: row.get(4)?,
            folder_type: row.get(5)?,
        })
    })?;
    folders.collect()
}

pub fn insert_pending_op(pool: &DbPool, op: &PendingOp) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO mail_pending_ops (account_id, message_id, op_type, status)
         VALUES (?1,?2,?3,?4)",
        params![op.account_id, op.message_id, op.op_type, op.status],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn insert_message_folder(pool: &DbPool, message_id: i64, folder_id: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT OR IGNORE INTO mail_message_folders (message_id, folder_id) VALUES (?1, ?2)",
        params![message_id, folder_id],
    )?;
    Ok(())
}

/// Bulk check: returns the set of remote UIDs that already exist for a given account
/// Used for bulk dedup before parsing (Pebble pattern)
pub fn get_existing_remote_uids(
    pool: &DbPool,
    account_id: i64,
    uids: &[i64],
) -> Result<std::collections::HashSet<i64>> {
    if uids.is_empty() {
        return Ok(std::collections::HashSet::new());
    }
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let placeholders: Vec<String> = uids.iter().enumerate().map(|(i, _)| format!("?{}", i + 2)).collect();
    let query = format!(
        "SELECT remote_uid FROM mail_messages WHERE account_id = ?1 AND remote_uid IN ({})",
        placeholders.join(",")
    );
    let mut stmt = conn.prepare(&query)?;
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(account_id)];
    for uid in uids {
        params.push(Box::new(*uid));
    }
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let existing = stmt
        .query_map(param_refs.as_slice(), |row| row.get::<_, i64>(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(existing)
}
