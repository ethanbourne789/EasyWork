use rusqlite::{params, Result};
use crate::db::DbPool;
use crate::mail::{MailAccount, MailFolder, MailMessage, MailMessageSummary, PendingOp, MailContact};

pub fn insert_account(pool: &DbPool, account: &MailAccount) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
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

pub fn insert_message(pool: &DbPool, msg: &MailMessage) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let existing: Option<i64> = conn.query_row(
        "SELECT id FROM mail_messages WHERE account_id = ?1 AND remote_uid = ?2",
        params![msg.account_id, msg.remote_uid],
        |row| row.get(0),
    ).ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE mail_messages SET subject=?1, from_name=?2, from_email=?3, to_list=?4, cc_list=?5,
             body_text=?6, body_html=?7, is_read=?8, is_starred=?9, has_attachment=?10, size=?11,
             date=?12, updated_at=datetime('now') WHERE id=?13",
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
             to_list, cc_list, date, body_text, body_html, is_read, is_starred, has_attachment, size, thread_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
            params![
                msg.account_id, msg.remote_uid, msg.message_id_header,
                msg.subject, msg.from_name, msg.from_email, msg.to_list, msg.cc_list,
                msg.date, msg.body_text, msg.body_html,
                msg.is_read as i32, msg.is_starred as i32,
                msg.has_attachment as i32, msg.size, msg.thread_id
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }
}

pub fn update_message_thread_id(pool: &DbPool, message_id: i64, thread_id: &str) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_messages SET thread_id = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![thread_id, message_id],
    )?;
    Ok(())
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
                m.is_read, m.is_starred, m.has_attachment, m.size, m.thread_id, m.is_deleted
         FROM mail_messages m
         JOIN mail_message_folders mf ON m.id = mf.message_id
         WHERE m.account_id = ?1 AND mf.folder_id = ?2
         ORDER BY m.date DESC LIMIT ?3 OFFSET ?4"
    } else {
        "SELECT id, account_id, remote_uid, subject, from_name, from_email, date,
                is_read, is_starred, has_attachment, size, thread_id, is_deleted
         FROM mail_messages WHERE account_id = ?1 AND is_deleted = 0
         ORDER BY date DESC LIMIT ?2 OFFSET ?3"
    };

    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM mail_messages WHERE account_id = ?1 AND is_deleted = 0",
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
        thread_id: row.get(11).unwrap_or_default(),
        is_deleted: row.get::<_, i32>(12).unwrap_or(0) != 0,
    })
}

pub fn get_message_body(pool: &DbPool, message_id: i64) -> Result<(String, String, String)> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.query_row(
        "SELECT body_text, body_html, cc_list FROM mail_messages WHERE id = ?1",
        params![message_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
}

pub fn get_message_headers(pool: &DbPool, message_id: i64) -> Result<(String, String, String, String, String)> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.query_row(
        "SELECT subject, from_name, from_email, to_list, message_id_header FROM mail_messages WHERE id = ?1",
        params![message_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    )
}

pub fn mark_read(pool: &DbPool, message_id: i64, is_read: bool) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_messages SET is_read = ?1, updated_at = datetime('now') WHERE id = ?2",
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
        "UPDATE mail_messages SET is_starred = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![new_val as i32, message_id],
    )?;
    Ok(new_val)
}

// ---- Soft Delete ----

pub fn soft_delete_message(pool: &DbPool, message_id: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_messages SET is_deleted = 1, deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        params![message_id],
    )?;
    Ok(())
}

pub fn hard_delete_messages(pool: &DbPool, message_ids: &[i64]) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    for id in message_ids {
        conn.execute("DELETE FROM mail_messages WHERE id = ?1", params![id])?;
    }
    Ok(())
}

// ---- Archive ----

pub fn archive_message(pool: &DbPool, message_id: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    // Remove from inbox folder, add/move to archive folder
    let account_id: i64 = conn.query_row(
        "SELECT account_id FROM mail_messages WHERE id = ?1",
        params![message_id],
        |row| row.get(0),
    )?;

    // Find or create Archive folder
    let archive_id: Option<i64> = conn.query_row(
        "SELECT id FROM mail_folders WHERE account_id = ?1 AND role = 'archive' LIMIT 1",
        params![account_id],
        |row| row.get(0),
    ).ok();

    let archive_folder_id = if let Some(id) = archive_id {
        id
    } else {
        conn.execute(
            "INSERT INTO mail_folders (account_id, remote_id, name, role, folder_type) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![account_id, "ARCHIVE", "Archive", "archive", "system"],
        )?;
        conn.last_insert_rowid()
    };

    // Remove from inbox
    conn.execute(
        "DELETE FROM mail_message_folders WHERE message_id = ?1 AND folder_id IN (SELECT id FROM mail_folders WHERE account_id = ?2 AND role = 'inbox')",
        params![message_id, account_id],
    )?;

    // Add to archive
    conn.execute(
        "INSERT OR IGNORE INTO mail_message_folders (message_id, folder_id) VALUES (?1, ?2)",
        params![message_id, archive_folder_id],
    )?;

    Ok(())
}

// ---- Message by folders ----

pub fn get_message_folder_ids(pool: &DbPool, message_id: i64) -> Result<Vec<i64>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare("SELECT folder_id FROM mail_message_folders WHERE message_id = ?1")?;
    let ids: Vec<i64> = stmt.query_map(params![message_id], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(ids)
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

/// Get unread count per folder for an account
pub fn folder_unread_counts(pool: &DbPool, account_id: i64) -> Result<Vec<(i64, i64)>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT mf.folder_id, COUNT(*)
         FROM mail_messages m
         JOIN mail_message_folders mf ON m.id = mf.message_id
         WHERE m.account_id = ?1 AND m.is_read = 0 AND m.is_deleted = 0
         GROUP BY mf.folder_id"
    )?;
    let counts = stmt.query_map(params![account_id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    })?.filter_map(|r| r.ok()).collect();
    Ok(counts)
}

// ---- Pending Ops ----

pub fn insert_pending_op(pool: &DbPool, op: &PendingOp) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO mail_pending_ops (account_id, message_id, op_type, payload, status)
         VALUES (?1,?2,?3,?4,?5)",
        params![op.account_id, op.message_id, op.op_type, op.payload, op.status],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_pending_ops(pool: &DbPool, account_id: i64) -> Result<Vec<PendingOp>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, account_id, message_id, op_type, payload, status, last_error, attempts
         FROM mail_pending_ops WHERE account_id = ?1 AND status = 'pending'
         ORDER BY created_at ASC LIMIT 50"
    )?;
    let ops = stmt.query_map(params![account_id], |row| {
        Ok(PendingOp {
            id: Some(row.get(0)?),
            account_id: row.get(1)?,
            message_id: row.get(2)?,
            op_type: row.get(3)?,
            payload: row.get(4).unwrap_or_default(),
            status: row.get(5)?,
            last_error: row.get(6)?,
            attempts: row.get(7)?,
        })
    })?;
    ops.collect()
}

pub fn update_pending_op_status(pool: &DbPool, op_id: i64, status: &str, error: Option<&str>) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let attempts = if status == "failed" || status == "retrying" {
        ", attempts = attempts + 1"
    } else {
        ""
    };
    conn.execute(
        &format!("UPDATE mail_pending_ops SET status = ?1, last_error = ?2{} WHERE id = ?3", attempts),
        params![status, error, op_id],
    )?;
    Ok(())
}

// ---- Attachments ----

pub fn insert_attachment(
    pool: &DbPool,
    message_id: i64,
    filename: &str,
    content_type: &str,
    size: i64,
    local_path: &str,
    content_id: &str,
) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT OR IGNORE INTO mail_attachments (message_id, filename, content_type, size, local_path, content_id)
         VALUES (?1,?2,?3,?4,?5,?6)",
        params![message_id, filename, content_type, size, local_path, content_id],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_attachments(pool: &DbPool, message_id: i64) -> Result<Vec<(i64, String, String, i64, String)>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, filename, content_type, size, local_path FROM mail_attachments WHERE message_id = ?1"
    )?;
    let attachments = stmt.query_map(params![message_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
    })?.filter_map(|r| r.ok()).collect();
    Ok(attachments)
}

// ---- Contacts ----

pub fn insert_contact(pool: &DbPool, contact: &MailContact) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO mail_contacts (account_id, name, email, phone, group_name, notes)
         VALUES (?1,?2,?3,?4,?5,?6)",
        params![contact.account_id, contact.name, contact.email, contact.phone, contact.group_name, contact.notes],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_contacts(pool: &DbPool, account_id: i64) -> Result<Vec<MailContact>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, account_id, name, email, phone, group_name, notes FROM mail_contacts WHERE account_id = ?1"
    )?;
    let contacts = stmt.query_map(params![account_id], |row| {
        Ok(MailContact {
            id: Some(row.get(0)?),
            account_id: row.get(1)?,
            name: row.get(2)?,
            email: row.get(3)?,
            phone: row.get(4).unwrap_or_default(),
            group_name: row.get(5).unwrap_or_default(),
            notes: row.get(6).unwrap_or_default(),
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(contacts)
}

pub fn delete_contact(pool: &DbPool, id: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute("DELETE FROM mail_contacts WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn insert_message_folder(pool: &DbPool, message_id: i64, folder_id: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT OR IGNORE INTO mail_message_folders (message_id, folder_id) VALUES (?1, ?2)",
        params![message_id, folder_id],
    )?;
    Ok(())
}

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

/// Search messages by keyword using FTS5 with LIKE fallback.
pub fn search_messages(pool: &DbPool, account_id: i64, query: &str) -> Result<Vec<MailMessageSummary>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    // Try FTS5 first
    if let Ok(mut stmt) = conn.prepare("SELECT rowid FROM mail_fts WHERE mail_fts MATCH ?1 LIMIT 200") {
        let ids: Vec<i64> = stmt.query_map(params![query], |row| row.get(0))?
            .filter_map(|r| r.ok()).collect();

        if !ids.is_empty() {
            let placeholders: Vec<String> = ids.iter().enumerate()
                .map(|(i, _)| format!("?{}", i + 1)).collect();
            let sql = format!(
                "SELECT id, account_id, remote_uid, subject, from_name, from_email, date,
                        is_read, is_starred, has_attachment, size, thread_id, is_deleted
                 FROM mail_messages
                 WHERE id IN ({}) AND account_id = ?{} AND is_deleted = 0
                 ORDER BY date DESC LIMIT 100",
                placeholders.join(","), ids.len() + 1
            );

            if let Ok(mut msg_stmt) = conn.prepare(&sql) {
                let mut dyn_params: Vec<Box<dyn rusqlite::types::ToSql>> = ids.iter()
                    .map(|id| Box::new(*id) as Box<dyn rusqlite::types::ToSql>).collect();
                dyn_params.push(Box::new(account_id));
                let refs: Vec<&dyn rusqlite::types::ToSql> = dyn_params.iter().map(|p| p.as_ref()).collect();

                let rows: Vec<MailMessageSummary> = msg_stmt.query_map(refs.as_slice(), map_summary)?
                    .filter_map(|r| r.ok()).collect();
                if !rows.is_empty() {
                    return Ok(rows);
                }
            }
        }
    }

    // Fallback: LIKE search
    let search = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, account_id, remote_uid, subject, from_name, from_email, date,
                is_read, is_starred, has_attachment, size, thread_id, is_deleted
         FROM mail_messages
         WHERE account_id = ?1 AND is_deleted = 0
           AND (subject LIKE ?2 OR from_name LIKE ?2 OR from_email LIKE ?2 OR body_text LIKE ?2)
         ORDER BY date DESC LIMIT 100"
    )?;
    let messages: Vec<MailMessageSummary> = stmt.query_map(params![account_id, search], map_summary)?
        .filter_map(|r| r.ok()).collect();
    Ok(messages)
}

// ---- Flag Reconciliation ----

/// Get local flag state for reconciliation: (msg_id, remote_uid, is_read, is_starred, updated_at_ts)
pub fn get_local_flag_state(
    pool: &DbPool,
    account_id: i64,
    folder_id: i64,
) -> Result<Vec<(i64, i64, bool, bool, i64)>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT m.id, m.remote_uid, m.is_read, m.is_starred,
                CAST(strftime('%s', COALESCE(m.updated_at, m.created_at)) AS INTEGER)
         FROM mail_messages m
         JOIN mail_message_folders mf ON m.id = mf.message_id
         WHERE m.account_id = ?1 AND mf.folder_id = ?2 AND m.is_deleted = 0"
    )?;
    let results = stmt.query_map(params![account_id, folder_id], |row| {
        Ok((row.get(0)?, row.get::<_, i64>(1)?, row.get::<_, i32>(2)? != 0, row.get::<_, i32>(3)? != 0, row.get(4)?))
    })?.filter_map(|r| r.ok()).collect();
    Ok(results)
}

/// Set starred flag directly (used by reconciliation, not toggle)
pub fn set_starred(pool: &DbPool, message_id: i64, is_starred: bool) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_messages SET is_starred = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![is_starred as i32, message_id],
    )?;
    Ok(())
}

// ---- Folder Cursor ----

pub fn update_folder_cursor(
    pool: &DbPool,
    folder_id: i64,
    uid_validity: Option<i64>,
    highest_modseq: Option<i64>,
    last_uid: Option<i32>,
) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut updates = Vec::new();
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(v) = uid_validity {
        updates.push("uid_validity = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = highest_modseq {
        updates.push("highest_modseq = ?".to_string());
        param_values.push(Box::new(v));
    }
    if let Some(v) = last_uid {
        updates.push("last_uid = ?".to_string());
        param_values.push(Box::new(v as i64));
    }

    if updates.is_empty() {
        return Ok(());
    }

    param_values.push(Box::new(folder_id));
    let query = format!("UPDATE mail_folders SET {} WHERE id = ?", updates.join(", "));
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&query, param_refs.as_slice())?;
    Ok(())
}

pub fn get_folder_cursor(pool: &DbPool, folder_id: i64) -> Result<Option<(Option<i64>, Option<i64>, Option<i32>)>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let result = conn.query_row(
        "SELECT uid_validity, highest_modseq, last_uid FROM mail_folders WHERE id = ?1",
        params![folder_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// ---- FTS ----

pub fn fts_insert(pool: &DbPool, message_id: i64, subject: &str, from_name: &str, from_email: &str, body_text: &str) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    // Delete existing if any
    conn.execute("DELETE FROM mail_fts WHERE rowid = ?1", params![message_id])?;
    // Insert into FTS
    conn.execute(
        "INSERT INTO mail_fts(rowid, subject, from_name, from_email, body_text) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![message_id, subject, from_name, from_email, body_text],
    )?;
    Ok(())
}

pub fn fts_delete(pool: &DbPool, message_id: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute("DELETE FROM mail_fts WHERE rowid = ?1", params![message_id])?;
    Ok(())
}

// ---- Pending Ops Summary ----

pub fn get_pending_ops_summary(pool: &DbPool) -> Result<serde_json::Value> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let pending: i64 = conn.query_row(
        "SELECT COUNT(*) FROM mail_pending_ops WHERE status = 'pending'", [],
        |row| row.get(0),
    ).unwrap_or(0);
    let failed: i64 = conn.query_row(
        "SELECT COUNT(*) FROM mail_pending_ops WHERE status = 'failed'", [],
        |row| row.get(0),
    ).unwrap_or(0);
    let retrying: i64 = conn.query_row(
        "SELECT COUNT(*) FROM mail_pending_ops WHERE status = 'retrying'", [],
        |row| row.get(0),
    ).unwrap_or(0);

    Ok(serde_json::json!({
        "pending_count": pending,
        "failed_count": failed,
        "retrying_count": retrying,
        "total_active": pending + retrying,
    }))
}
