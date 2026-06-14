use rusqlite::{params, Result};
use crate::db::DbPool;
use crate::mail::{self, MailAccount, MailFolder, MailMessage, MailMessageSummary, PendingOp, MailContact, MailContactGroup, ContactMailSummary, MailSignature};

// =====================================================================
// FTS5 NOTE (do not remove without testing):
//
// `mail_fts` is declared as `content='mail_messages'` (contentless FTS5 table).
// Manually deleting from `mail_fts` via:
//     DELETE FROM mail_fts WHERE rowid IN (SELECT id FROM mail_messages ...)
// reliably triggers `database disk image is malformed` once the source table
// exceeds ~50 rows.  `PRAGMA integrity_check` returns `ok` — the corruption
// is in the FTS5 segment tree, not the file.
//
// Workaround: never touch `mail_fts` directly in account/folder operations.
// Contentless tables do not cascade, but the stale FTS rows are harmless:
// they only appear in `MATCH` queries and won't match real text after the
// source rows are gone (the FTS index is content-addressed by rowid).
// =====================================================================

pub fn insert_account(pool: &DbPool, account: &MailAccount) -> Result<i64> {
    let mut conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    // Encrypt password with AES-GCM (key stored in OS keyring).
    // Falls back to base64 if keyring is unavailable (e.g., headless Windows).
    let pw_b64 = mail::crypto::encrypt_password(&account.password)
        .unwrap_or_else(|e| {
            log::warn!("Password encryption failed for {}: {}. Using base64 fallback.", account.email, e);
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, account.password.as_bytes())
        });
    let encrypted_pw: Vec<u8> = pw_b64.into_bytes();

    // Use a transaction so a partial failure doesn't corrupt the DB.
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO mail_accounts (email, provider, imap_host, imap_port, smtp_host, smtp_port, username, encrypted_password, use_tls, sync_interval_secs, sync_period_days, display_name, color, is_default, notifications_enabled)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            account.email, account.provider, account.imap_host,
            account.imap_port, account.smtp_host, account.smtp_port,
            account.username, encrypted_pw,
            account.use_tls as i32, account.sync_interval_secs, account.sync_period_days,
            account.display_name, account.color,
            account.is_default as i32, account.notifications_enabled as i32
        ],
    )?;
    let id = tx.last_insert_rowid();
    tx.commit()?;

    log::debug!("insert_account committed: id={} email={}", id, account.email);
    Ok(id)
}

#[allow(dead_code)]
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
                username, encrypted_password, use_tls, sync_interval_secs, sync_period_days, sync_state,
                display_name, color, is_default, notifications_enabled
         FROM mail_accounts WHERE id = ?1",
        params![account_id],
        |row| {
            let encrypted: Vec<u8> = row.get(8)?;
            // Try AES-GCM decryption first, fall back to base64 for legacy data
            let password = mail::crypto::decrypt_password(&encrypted)
                .or_else(|_| {
                    base64_decode(&encrypted)
                        .and_then(|b| String::from_utf8(b).ok())
                        .ok_or_else(|| "both decryptions failed".to_string())
                })
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
                    display_name: row.get::<_, String>(12).unwrap_or_default(),
                    color: row.get::<_, String>(13).unwrap_or_default(),
                    is_default: row.get::<_, i32>(14).unwrap_or(0) != 0,
                    notifications_enabled: row.get::<_, i32>(15).unwrap_or(1) != 0,
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
        "SELECT id, email, provider, imap_host, imap_port, smtp_host, smtp_port, username, use_tls, sync_interval_secs, sync_period_days,
                display_name, color, is_default, notifications_enabled FROM mail_accounts"
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
            display_name: row.get::<_, String>(11).unwrap_or_default(),
            color: row.get::<_, String>(12).unwrap_or_default(),
            is_default: row.get::<_, i32>(13).unwrap_or(0) != 0,
            notifications_enabled: row.get::<_, i32>(14).unwrap_or(1) != 0,
        })
    })?;
    accounts.collect()
}

pub fn delete_account(pool: &DbPool, id: i64) -> Result<()> {
    let mut conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    // All deletes in a single transaction so a partial failure (e.g. mid-way
    // SQLITE_MALFORMED) rolls back and leaves the DB in a consistent state.
    // PRAGMA foreign_keys is intentionally NOT enabled here: we use explicit
    // ordered DELETEs instead of relying on ON DELETE CASCADE so we can avoid
    // the FTS5 contentless-table `WHERE rowid IN (SELECT ...)` malformed trap.
    let tx = conn.transaction()?;

    // 1. Leaf tables first (depend on messages)
    tx.execute("DELETE FROM mail_attachments WHERE message_id IN (SELECT id FROM mail_messages WHERE account_id = ?1)", params![id])?;
    tx.execute("DELETE FROM mail_message_folders WHERE message_id IN (SELECT id FROM mail_messages WHERE account_id = ?1)", params![id])?;

    // 2. Messages. mail_fts is a contentless FTS5 table linked via content='mail_messages';
    //    removing source rows makes the FTS entries stale but does NOT error.
    //    We deliberately do NOT touch mail_fts here — see ops.rs top-of-file comment.
    tx.execute("DELETE FROM mail_messages WHERE account_id = ?1", params![id])?;

    // 3. Folders, pending ops, contacts (depend on account)
    tx.execute("DELETE FROM mail_folders WHERE account_id = ?1", params![id])?;
    tx.execute("DELETE FROM mail_pending_ops WHERE account_id = ?1", params![id])?;
    tx.execute("DELETE FROM mail_contacts WHERE account_id = ?1", params![id])?;

    // 4. Account last
    tx.execute("DELETE FROM mail_accounts WHERE id = ?1", params![id])?;

    tx.commit()?;
    log::info!("Deleted account {} and all associated data (transactional)", id);
    Ok(())
}

pub fn update_account(pool: &DbPool, account: &MailAccount) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let id = account.id.ok_or_else(|| {
        rusqlite::Error::InvalidParameterName("id is required for update".into())
    })?;

    // ── Password semantics ──
    // The frontend intentionally sends an empty password when the user
    // didn't change it (the field is masked in the form). In that case
    // we MUST NOT overwrite the stored encrypted_password with an empty
    // blob — the account would become un-loggable.
    //
    // The Rust command layer also has this guard (commands/mail.rs), but
    // we double-check here so direct callers of ops::update_account stay
    // safe.
    if account.password.is_empty() {
        log::debug!("update_account: id={} password empty, preserving existing encrypted_password", id);
        conn.execute(
            "UPDATE mail_accounts SET
                email = ?1, provider = ?2, imap_host = ?3, imap_port = ?4,
                smtp_host = ?5, smtp_port = ?6, username = ?7,
                use_tls = ?8, sync_interval_secs = ?9, sync_period_days = ?10,
                updated_at = datetime('now')
             WHERE id = ?11",
            params![
                account.email, account.provider, account.imap_host,
                account.imap_port, account.smtp_host, account.smtp_port,
                account.username,
                account.use_tls as i32, account.sync_interval_secs, account.sync_period_days,
                id,
            ],
        )?;
        return Ok(());
    }

    let pw_b64 = mail::crypto::encrypt_password(&account.password)
        .unwrap_or_else(|e| {
            log::warn!("Password encryption failed, using base64: {}", e);
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, account.password.as_bytes())
        });
    let encrypted_pw: Vec<u8> = pw_b64.into_bytes();
    conn.execute(
        "UPDATE mail_accounts SET
            email = ?1, provider = ?2, imap_host = ?3, imap_port = ?4,
            smtp_host = ?5, smtp_port = ?6, username = ?7, encrypted_password = ?8,
            use_tls = ?9, sync_interval_secs = ?10, sync_period_days = ?11,
            updated_at = datetime('now')
         WHERE id = ?12",
        params![
            account.email, account.provider, account.imap_host,
            account.imap_port, account.smtp_host, account.smtp_port,
            account.username, encrypted_pw,
            account.use_tls as i32, account.sync_interval_secs, account.sync_period_days,
            id,
        ],
    )?;
    Ok(())
}

pub fn insert_message(pool: &DbPool, msg: &MailMessage) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    // Compute sortable ISO date from raw date header
    let date_sort = normalize_date(&msg.date);

    // ── Dedup Layer 1: By remote_uid (IMAP UID) ──
    // When the message already exists we only refresh server-controlled
    // fields (subject, from, body, size, flags, date). User-controlled
    // flags (is_read, is_starred) MUST be preserved — otherwise a manual
    // sync would re-mark a message as unread after the user read it.
    let existing: Option<(i64, bool, bool)> = conn.query_row(
        "SELECT id, is_read, is_starred FROM mail_messages
         WHERE account_id = ?1 AND remote_uid = ?2",
        params![msg.account_id, msg.remote_uid],
        |row| Ok((row.get(0)?, row.get::<_, i32>(1)? != 0, row.get::<_, i32>(2)? != 0)),
    ).ok();

    if let Some((id, prev_read, prev_starred)) = existing {
        conn.execute(
            "UPDATE mail_messages SET subject=?1, from_name=?2, from_email=?3, to_list=?4, cc_list=?5,
             body_text=?6, body_html=?7, has_attachment=?8, size=?9,
             date=?10, date_sort=?11, updated_at=datetime('now') WHERE id=?12",
            params![
                msg.subject, msg.from_name, msg.from_email, msg.to_list, msg.cc_list,
                msg.body_text, msg.body_html, msg.has_attachment as i32, msg.size,
                msg.date, date_sort, id
            ],
        )?;
        log::debug!(
            "Dedup by UID: refreshed server fields for message id={} (account={}, uid={}); preserved is_read={} is_starred={}",
            id, msg.account_id, msg.remote_uid, prev_read, prev_starred
        );
        return Ok(id);
    }

    // ── Dedup Layer 2: By Message-ID ──
    // Catches IMAP server UID reassignment (e.g. QQ Mail re-indexing).
    // Same preservation rule: keep local is_read / is_starred, only update
    // server-controlled fields and the new remote_uid.
    if !msg.message_id_header.is_empty() {
        let existing_by_msgid: Option<(i64, bool, bool)> = conn.query_row(
            "SELECT id, is_read, is_starred FROM mail_messages
             WHERE account_id = ?1 AND message_id_header = ?2",
            params![msg.account_id, msg.message_id_header],
            |row| Ok((row.get(0)?, row.get::<_, i32>(1)? != 0, row.get::<_, i32>(2)? != 0)),
        ).ok();

        if let Some((id, prev_read, prev_starred)) = existing_by_msgid {
            // Same Message-ID, different UID → server re-assigned UID, update and reuse
            conn.execute(
                "UPDATE mail_messages SET remote_uid=?1, subject=?2, from_name=?3, from_email=?4,
                 to_list=?5, cc_list=?6, date=?7, date_sort=?8, body_text=?9, body_html=?10,
                 has_attachment=?11, size=?12, thread_id=?13,
                 updated_at=datetime('now')
                 WHERE id=?14",
                params![
                    msg.remote_uid, msg.subject, msg.from_name, msg.from_email,
                    msg.to_list, msg.cc_list, msg.date, date_sort, msg.body_text, msg.body_html,
                    msg.has_attachment as i32, msg.size, msg.thread_id, id
                ],
            )?;
            log::info!(
                "Dedup by Message-ID: updated UID for existing message id={} (account={}); preserved is_read={} is_starred={}",
                id, msg.account_id, prev_read, prev_starred
            );
            return Ok(id);
        }
    }

    // ── Dedup Layer 3: By content hash (subject + from + date) ──
    // Last-resort catch for emails with missing/invalid Message-ID.
    // Also preserves user flags.
    {
        let hash = compute_content_hash(&msg.subject, &msg.from_email, &msg.date);
        let existing_by_hash: Option<(i64, bool, bool)> = conn.query_row(
            "SELECT m.id, m.is_read, m.is_starred FROM mail_messages m
             WHERE m.account_id = ?1 AND m.content_hash = ?2
             LIMIT 1",
            params![msg.account_id, hash],
            |row| Ok((row.get(0)?, row.get::<_, i32>(1)? != 0, row.get::<_, i32>(2)? != 0)),
        ).ok();

        if let Some((id, prev_read, prev_starred)) = existing_by_hash {
            conn.execute(
                "UPDATE mail_messages SET remote_uid=?1, thread_id=?2, date_sort=?3,
                 has_attachment=?4, body_text=?5, body_html=?6, size=?7,
                 updated_at=datetime('now')
                 WHERE id=?8",
                params![msg.remote_uid, msg.thread_id, date_sort,
                    msg.has_attachment as i32, msg.body_text, msg.body_html, msg.size, id],
            )?;
            log::info!(
                "Dedup by content hash: refreshed server fields for id={} (account={}); preserved is_read={} is_starred={}",
                id, msg.account_id, prev_read, prev_starred
            );
            return Ok(id);
        }
    }

    // ── New message ──
    let hash = compute_content_hash(&msg.subject, &msg.from_email, &msg.date);
    conn.execute(
        "INSERT INTO mail_messages (account_id, remote_uid, message_id_header, subject, from_name, from_email,
         to_list, cc_list, date, body_text, body_html, is_read, is_starred, has_attachment, size, thread_id, content_hash, date_sort)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
        params![
            msg.account_id, msg.remote_uid, msg.message_id_header,
            msg.subject, msg.from_name, msg.from_email, msg.to_list, msg.cc_list,
            msg.date, msg.body_text, msg.body_html,
            msg.is_read as i32, msg.is_starred as i32,
            msg.has_attachment as i32, msg.size, msg.thread_id, hash, date_sort
        ],
    )?;
    let new_id = conn.last_insert_rowid();
    log::debug!("New message inserted: id={} (account={}, uid={})", new_id, msg.account_id, msg.remote_uid);
    Ok(new_id)
}

/// Compute a content hash for dedup: SHA256 of (subject|from_email|date).
fn compute_content_hash(subject: &str, from_email: &str, date: &str) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(subject.as_bytes());
    hasher.update(b"|");
    hasher.update(from_email.as_bytes());
    hasher.update(b"|");
    hasher.update(date.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..8]) // first 8 hex chars for a short, unique-enough hash
}

/// Normalize an email date header string to ISO 8601 format (YYYY-MM-DD HH:MM:SS)
/// for correct text sorting. Returns empty string if parsing fails.
pub fn normalize_date(date_str: &str) -> String {
    if date_str.is_empty() {
        return String::new();
    }
    // If already in YYYY-MM-DD HH:MM:SS format (output of normalize_rfc2822_date),
    // return as-is — no need to re-parse.
    if date_str.len() >= 19
        && date_str.as_bytes().get(4) == Some(&b'-')
        && date_str.as_bytes().get(7) == Some(&b'-')
        && date_str.as_bytes().get(10) == Some(&b' ')
        && date_str.as_bytes().get(13) == Some(&b':')
        && date_str.as_bytes().get(16) == Some(&b':')
    {
        let candidate = &date_str[..19];
        // Quick validation: all chars in YYYY-MM-DD HH:MM:SS are ASCII digits, '-', ' ', or ':'
        if candidate.bytes().all(|b| b.is_ascii_digit() || b == b'-' || b == b' ' || b == b':') {
            return candidate.to_string();
        }
    }
    // Try mailparse::dateparse first (handles RFC 2822 dates with timezone)
    if let Ok(ts) = mailparse::dateparse(date_str) {
        // mailparse returns a Unix timestamp
        // Use chrono to format as ISO 8601
        if let Some(dt) = chrono::DateTime::from_timestamp(ts, 0) {
            return dt.format("%Y-%m-%d %H:%M:%S").to_string();
        }
    }
    // Fallback: try common date formats with chrono
    for fmt in &[
        "%a, %d %b %Y %H:%M:%S %z",
        "%d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%d %b %Y %H:%M:%S %Z",
    ] {
        if let Ok(dt) = chrono::DateTime::parse_from_str(date_str, fmt) {
            return dt.format("%Y-%m-%d %H:%M:%S").to_string();
        }
    }
    // At minimum, return a truncated version for basic sorting
    log::debug!("normalize_date: could not parse '{}'", date_str);
    String::new()
}

// ============================================================================
// Combined inbox (跨账户) + unified search (跨账户) + 全局已读统计
// ============================================================================

/// List messages from multiple accounts (combined inbox).
/// `account_ids == None` means ALL accounts.
/// `folder_role == None` means ANY folder (subject to folder_role filter via JOIN).
/// `folder_role == Some("inbox")` means only the inbox folder of each account.
pub fn list_messages_multi(
    pool: &DbPool,
    account_ids: Option<&[i64]>,
    folder_role: Option<&str>,
    page: i64,
    page_size: i64,
) -> Result<Vec<MailMessageSummary>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let offset = (page - 1) * page_size;

    // Build dynamic SQL
    let (where_clause, params_vec): (String, Vec<rusqlite::types::Value>) = match (account_ids, folder_role) {
        (Some(ids), Some(role)) if !ids.is_empty() => {
            let placeholders: Vec<String> = (0..ids.len()).map(|_| "?".to_string()).collect();
            let ph = placeholders.join(",");
            let mut p: Vec<rusqlite::types::Value> = ids.iter().map(|i| rusqlite::types::Value::Integer(*i)).collect();
            p.push(rusqlite::types::Value::Text(role.to_string()));
            (
                format!(
                    "WHERE m.account_id IN ({ph})
                       AND m.is_deleted = 0
                       AND EXISTS (SELECT 1 FROM mail_message_folders mf
                                    JOIN mail_folders f ON mf.folder_id = f.id
                                    WHERE mf.message_id = m.id AND f.role = ?{n})",
                    ph = ph,
                    n = ids.len() + 1,
                ),
                p,
            )
        }
        (Some(ids), _) if !ids.is_empty() => {
            let placeholders: Vec<String> = (0..ids.len()).map(|_| "?".to_string()).collect();
            let ph = placeholders.join(",");
            let p: Vec<rusqlite::types::Value> = ids.iter().map(|i| rusqlite::types::Value::Integer(*i)).collect();
            (
                format!("WHERE m.account_id IN ({ph}) AND m.is_deleted = 0", ph = ph),
                p,
            )
        }
        (Some(_), _) => {
            // empty ids -> no accounts -> empty result
            return Ok(vec![]);
        }
        (None, Some(role)) => {
            let p = vec![rusqlite::types::Value::Text(role.to_string())];
            (
                "WHERE m.is_deleted = 0
                 AND EXISTS (SELECT 1 FROM mail_message_folders mf
                              JOIN mail_folders f ON mf.folder_id = f.id
                              WHERE mf.message_id = m.id AND f.role = ?1)".to_string(),
                p,
            )
        }
        (None, None) => {
            ("WHERE m.is_deleted = 0".to_string(), vec![])
        }
    };

    let sql = format!(
        "SELECT m.id, m.account_id, m.remote_uid, m.subject, m.from_name, m.from_email, m.date,
                m.is_read, m.is_starred, m.has_attachment, m.size, m.thread_id, m.is_deleted,
                m.to_list, m.cc_list
         FROM mail_messages m
         {where_clause}
         ORDER BY m.date_sort DESC LIMIT ?{lim} OFFSET ?{off}",
        where_clause = where_clause,
        lim = params_vec.len() + 1,
        off = params_vec.len() + 2,
    );

    let mut all_params = params_vec;
    all_params.push(rusqlite::types::Value::Integer(page_size));
    all_params.push(rusqlite::types::Value::Integer(offset));

    let mut stmt = conn.prepare(&sql)?;
    let map_summary = |row: &rusqlite::Row| -> rusqlite::Result<MailMessageSummary> {
        Ok(MailMessageSummary {
            id: row.get(0)?,
            account_id: row.get(1)?,
            remote_uid: row.get(2)?,
            subject: row.get(3)?,
            from_name: row.get(4)?,
            from_email: row.get(5)?,
            date: row.get(6)?,
            is_read: row.get(7)?,
            is_starred: row.get(8)?,
            has_attachment: row.get(9)?,
            size: row.get(10)?,
            thread_id: row.get(11)?,
            is_deleted: row.get(12)?,
            to_list: row.get(13).unwrap_or_default(),
            cc_list: row.get(14).unwrap_or_default(),
        })
    };
    let messages: Vec<MailMessageSummary> = stmt
        .query_map(rusqlite::params_from_iter(all_params), map_summary)?
        .filter_map(|r| r.ok())
        .collect();

    Ok(messages)
}

/// Count messages matching the same filter as list_messages_multi.
pub fn count_messages_multi(
    pool: &DbPool,
    account_ids: Option<&[i64]>,
    folder_role: Option<&str>,
) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let (where_clause, params_vec): (String, Vec<rusqlite::types::Value>) = match (account_ids, folder_role) {
        (Some(ids), Some(role)) if !ids.is_empty() => {
            let placeholders: Vec<String> = (0..ids.len()).map(|_| "?".to_string()).collect();
            let ph = placeholders.join(",");
            let mut p: Vec<rusqlite::types::Value> = ids.iter().map(|i| rusqlite::types::Value::Integer(*i)).collect();
            p.push(rusqlite::types::Value::Text(role.to_string()));
            (
                format!(
                    "WHERE m.account_id IN ({ph}) AND m.is_deleted = 0
                     AND EXISTS (SELECT 1 FROM mail_message_folders mf
                                  JOIN mail_folders f ON mf.folder_id = f.id
                                  WHERE mf.message_id = m.id AND f.role = ?{n})",
                    ph = ph,
                    n = ids.len() + 1,
                ),
                p,
            )
        }
        (Some(ids), _) if !ids.is_empty() => {
            let placeholders: Vec<String> = (0..ids.len()).map(|_| "?".to_string()).collect();
            let ph = placeholders.join(",");
            let p: Vec<rusqlite::types::Value> = ids.iter().map(|i| rusqlite::types::Value::Integer(*i)).collect();
            (format!("WHERE m.account_id IN ({ph}) AND m.is_deleted = 0", ph = ph), p)
        }
        (Some(_), _) => return Ok(0),
        (None, Some(role)) => (
            "WHERE m.is_deleted = 0
             AND EXISTS (SELECT 1 FROM mail_message_folders mf
                          JOIN mail_folders f ON mf.folder_id = f.id
                          WHERE mf.message_id = m.id AND f.role = ?1)".to_string(),
            vec![rusqlite::types::Value::Text(role.to_string())],
        ),
        (None, None) => ("WHERE m.is_deleted = 0".to_string(), vec![]),
    };
    let sql = format!("SELECT COUNT(*) FROM mail_messages m {where_clause}", where_clause = where_clause);
    let count: i64 = conn.query_row(&sql, rusqlite::params_from_iter(params_vec), |row| row.get(0))?;
    Ok(count)
}

/// Unified full-text search across multiple accounts (FTS5).
/// `account_ids == None` means all accounts.
pub fn search_messages_multi(
    pool: &DbPool,
    account_ids: Option<&[i64]>,
    query: &str,
) -> Result<Vec<MailMessageSummary>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let cleaned = build_fts_query(query);
    if cleaned.is_empty() {
        return Ok(vec![]);
    }

    let (acct_clause, mut params_vec): (String, Vec<rusqlite::types::Value>) = match account_ids {
        Some(ids) if !ids.is_empty() => {
            let placeholders: Vec<String> = (0..ids.len()).map(|_| "?".to_string()).collect();
            let ph = placeholders.join(",");
            let p: Vec<rusqlite::types::Value> = ids.iter().map(|i| rusqlite::types::Value::Integer(*i)).collect();
            (format!("AND m.account_id IN ({ph})", ph = ph), p)
        }
        Some(_) => return Ok(vec![]),
        None => ("".to_string(), vec![]),
    };

    params_vec.insert(0, rusqlite::types::Value::Text(cleaned));
    let sql = format!(
        "SELECT m.id, m.account_id, m.remote_uid, m.subject, m.from_name, m.from_email, m.date,
                m.is_read, m.is_starred, m.has_attachment, m.size, m.thread_id, m.is_deleted,
                m.to_list, m.cc_list
         FROM mail_messages m
         JOIN mail_fts ON m.rowid = mail_fts.rowid
         WHERE mail_fts MATCH ?1
           AND m.is_deleted = 0
           {acct_clause}
         ORDER BY m.date_sort DESC LIMIT 100"
    );

    let mut stmt = conn.prepare(&sql)?;
    let map_summary = |row: &rusqlite::Row| -> rusqlite::Result<MailMessageSummary> {
        Ok(MailMessageSummary {
            id: row.get(0)?,
            account_id: row.get(1)?,
            remote_uid: row.get(2)?,
            subject: row.get(3)?,
            from_name: row.get(4)?,
            from_email: row.get(5)?,
            date: row.get(6)?,
            is_read: row.get(7)?,
            is_starred: row.get(8)?,
            has_attachment: row.get(9)?,
            size: row.get(10)?,
            thread_id: row.get(11)?,
            is_deleted: row.get(12)?,
            to_list: row.get(13).unwrap_or_default(),
            cc_list: row.get(14).unwrap_or_default(),
        })
    };
    let messages: Vec<MailMessageSummary> = stmt
        .query_map(rusqlite::params_from_iter(params_vec), map_summary)?
        .filter_map(|r| r.ok())
        .collect();
    Ok(messages)
}

/// Convert user query into a safe FTS5 MATCH expression.
fn build_fts_query(query: &str) -> String {
    let mut terms: Vec<String> = Vec::new();
    for raw in query.split_whitespace() {
        let cleaned: String = raw.chars().filter(|c| c.is_alphanumeric()).collect();
        if !cleaned.is_empty() {
            terms.push(format!("{}*", cleaned));
        }
    }
    if terms.is_empty() {
        return String::new();
    }
    terms.join(" AND ")
}

/// Total unread count across given accounts (combined inbox badge).
pub fn count_unread_multi(pool: &DbPool, account_ids: Option<&[i64]>) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let (where_clause, params_vec): (String, Vec<rusqlite::types::Value>) = match account_ids {
        Some(ids) if !ids.is_empty() => {
            let placeholders: Vec<String> = (0..ids.len()).map(|_| "?".to_string()).collect();
            let ph = placeholders.join(",");
            let p: Vec<rusqlite::types::Value> = ids.iter().map(|i| rusqlite::types::Value::Integer(*i)).collect();
            (format!("account_id IN ({ph}) AND", ph = ph), p)
        }
        Some(_) => return Ok(0),
        None => ("".to_string(), vec![]),
    };
    let sql = format!(
        "SELECT COUNT(*) FROM mail_messages
         WHERE {where_clause} is_read = 0 AND is_deleted = 0",
        where_clause = where_clause
    );
    let count: i64 = conn.query_row(&sql, rusqlite::params_from_iter(params_vec), |row| row.get(0))?;
    Ok(count)
}

/// Mark all unread messages in a folder (or account inbox if folder_id is None) as read.
/// Returns the number of messages marked.
pub fn mark_folder_read(
    pool: &DbPool,
    account_id: i64,
    folder_id: Option<i64>,
) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let sql = if let Some(_fid) = folder_id {
        "UPDATE mail_messages SET is_read = 1, updated_at = datetime('now')
         WHERE account_id = ?1 AND is_read = 0 AND is_deleted = 0
         AND id IN (SELECT message_id FROM mail_message_folders WHERE folder_id = ?2)"
    } else {
        "UPDATE mail_messages SET is_read = 1, updated_at = datetime('now')
         WHERE account_id = ?1 AND is_read = 0 AND is_deleted = 0"
    };
    let n = if let Some(fid) = folder_id {
        conn.execute(sql, params![account_id, fid])?
    } else {
        conn.execute(sql, params![account_id])?
    };
    Ok(n as i64)
}

/// Get the list of pending draft messages that haven't been pushed to IMAP yet.
pub fn list_local_drafts(pool: &DbPool, account_id: i64) -> Result<Vec<MailMessage>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, account_id, remote_uid, message_id_header, subject, from_name, from_email,
                to_list, cc_list, date, body_text, body_html,
                is_read, is_starred, has_attachment, size, thread_id
         FROM mail_messages
         WHERE account_id = ?1 AND is_deleted = 0
           AND EXISTS (SELECT 1 FROM mail_message_folders mf
                       JOIN mail_folders f ON mf.folder_id = f.id
                       WHERE mf.message_id = mail_messages.id AND f.role = 'drafts')
           AND remote_uid = 0
         ORDER BY date_sort DESC"
    )?;
    let rows = stmt.query_map(params![account_id], |row| {
        Ok(MailMessage {
            id: row.get(0)?,
            account_id: row.get(1)?,
            remote_uid: row.get(2)?,
            message_id_header: row.get(3)?,
            subject: row.get(4)?,
            from_name: row.get(5)?,
            from_email: row.get(6)?,
            to_list: row.get(7)?,
            cc_list: row.get(8)?,
            date: row.get(9)?,
            body_text: row.get(10)?,
            body_html: row.get(11)?,
            is_read: row.get(12)?,
            is_starred: row.get(13)?,
            has_attachment: row.get(14)?,
            size: row.get(15)?,
            thread_id: row.get(16)?,
            folder_ids: vec![],
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn update_message_thread_id(pool: &DbPool, message_id: i64, thread_id: &str) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_messages SET thread_id = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![thread_id, message_id],
    )?;
    Ok(())
}

/// Find messages whose thread_id doesn't match their Message-ID references.
/// Returns (message_id, current_thread_id, message_id_header, in_reply_to) tuples.
pub fn find_mislinked_threads(pool: &DbPool, account_id: i64) -> Result<Vec<(i64, String, String, String)>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, thread_id, message_id_header, subject
         FROM mail_messages
         WHERE account_id = ?1 AND is_deleted = 0
         ORDER BY id DESC LIMIT 200"
    )?;
    let rows = stmt.query_map(params![account_id], |row| {
        let id: i64 = row.get(0)?;
        let thread_id: String = row.get(1)?;
        let msg_id: String = row.get(2)?;
        let subject: String = row.get(3)?;
        Ok((id, thread_id, msg_id, subject))
    })?;
    let mut results = Vec::new();
    for row in rows {
        if let Ok((id, ref thread_id, msg_id, subject)) = row {
            // Check if any other message references this msg_id with different thread_id
            // Note: mail_messages doesn't have in_reply_to column, so we only check message_id_header
            // Thread association is done via thread_id field which is computed during sync
            let mut check = conn.prepare(
                "SELECT id, thread_id FROM mail_messages
                 WHERE account_id = ?1 AND is_deleted = 0
                 AND message_id_header = ?2
                 AND thread_id != ?3
                 LIMIT 1"
            ).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

            let ref_found: Result<Option<(i64, String)>> = check.query_row(
                params![account_id, msg_id, thread_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).map(Some)
             .or_else(|e| if e == rusqlite::Error::QueryReturnedNoRows { Ok(None) } else { Err(e) });

            if let Ok(Some((_ref_id, _ref_thread_id))) = ref_found {
                results.push((id, thread_id.clone(), msg_id, subject));
            }
        }
    }
    Ok(results)
}

/// Get the thread_id of a message by its message_id_header (e.g. "<abc@example.com>").
pub fn get_thread_id_by_message_id(pool: &DbPool, account_id: i64, message_id_header: &str) -> Result<Option<String>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    match conn.query_row(
        "SELECT thread_id FROM mail_messages
         WHERE account_id = ?1 AND (message_id_header = ?2 OR message_id_header LIKE ?3)
         AND is_deleted = 0
         LIMIT 1",
        params![account_id, message_id_header, format!("%<{}%", message_id_header.trim_matches('<'))],
        |row| row.get(0),
    ) {
        Ok(tid) => Ok(Some(tid)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Find a local message id by its RFC 2822 `Message-ID` header.
/// Bug #8 helper: used by `send_mail` to locate the parent message when
/// building the reply chain. Returns `None` for brand-new threads.
pub fn find_message_id_by_header(pool: &DbPool, account_id: i64, message_id_header: &str) -> Result<Option<i64>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    match conn.query_row(
        "SELECT id FROM mail_messages
         WHERE account_id = ?1 AND (message_id_header = ?2 OR message_id_header = ?3)
         AND is_deleted = 0
         LIMIT 1",
        params![account_id, message_id_header, format!("<{}>", message_id_header)],
        |row| row.get(0),
    ) {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
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
        // Bug #3 fix: also filter m.is_deleted = 0 in the folder_id branch.
        // Previously the join-branch only constrained mf.folder_id, so soft-deleted
        // messages would still appear in the folder listing (the all-account branch
        // already had the filter; the folder branch was inconsistent).
        "SELECT m.id, m.account_id, m.remote_uid, m.subject, m.from_name, m.from_email, m.date,
                m.is_read, m.is_starred, m.has_attachment, m.size, m.thread_id, m.is_deleted,
                m.to_list, m.cc_list
         FROM mail_messages m
         JOIN mail_message_folders mf ON m.id = mf.message_id
         WHERE m.account_id = ?1 AND mf.folder_id = ?2 AND m.is_deleted = 0
         ORDER BY m.date_sort DESC LIMIT ?3 OFFSET ?4"
    } else {
        "SELECT id, account_id, remote_uid, subject, from_name, from_email, date,
                is_read, is_starred, has_attachment, size, thread_id, is_deleted,
                to_list, cc_list
         FROM mail_messages WHERE account_id = ?1 AND is_deleted = 0
         ORDER BY date_sort DESC LIMIT ?2 OFFSET ?3"
    };

    // Bug fix: total must mirror the same filter as `query` — otherwise the
    // frontend's `total` (used for pagination) disagrees with the `messages`
    // array (filtered by folder), producing confusing page counts.
    let total: i64 = if let Some(fid) = folder_id {
        conn.query_row(
            "SELECT COUNT(*)
             FROM mail_messages m
             JOIN mail_message_folders mf ON m.id = mf.message_id
             WHERE m.account_id = ?1 AND mf.folder_id = ?2 AND m.is_deleted = 0",
            params![account_id, fid],
            |row| row.get(0),
        ).unwrap_or(0)
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM mail_messages WHERE account_id = ?1 AND is_deleted = 0",
            rusqlite::params![account_id],
            |row| row.get(0),
        ).unwrap_or(0)
    };
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

/// Count total messages for pagination. Supports optional folder filter.
pub fn count_messages(
    pool: &DbPool,
    account_id: i64,
    folder_id: Option<i64>,
) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let total = if let Some(fid) = folder_id {
        conn.query_row(
            "SELECT COUNT(*)
             FROM mail_messages m
             JOIN mail_message_folders mf ON m.id = mf.message_id
             WHERE m.account_id = ?1 AND mf.folder_id = ?2 AND m.is_deleted = 0",
            params![account_id, fid],
            |row| row.get(0),
        )?
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM mail_messages WHERE account_id = ?1 AND is_deleted = 0",
            params![account_id],
            |row| row.get(0),
        )?
    };
    Ok(total)
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
        to_list: row.get(13).unwrap_or_default(),
        cc_list: row.get(14).unwrap_or_default(),
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

/// Get account_id, remote_uid, and primary folder_remote_id for a message
/// (used by pending ops to drive IMAP STORE/COPY+DELETE on the correct folder).
///
/// Bug #4 fix: we now also return the source folder's `remote_id` so the
/// pending op executor can SELECT the right folder before issuing STORE.
/// Previously the executor hard-coded `SELECT INBOX`, which would fail on
/// Gmail / folders where the message lives in `[Gmail]/Sent Mail` or
/// `[Gmail]/All Mail` — the IMAP server returns `NO` and the pending op
/// re-tries forever.
pub fn get_message_remote_info(pool: &DbPool, message_id: i64) -> Result<Option<(i64, i64, String, String)>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let result = conn.query_row(
        "SELECT m.account_id, m.remote_uid, m.subject,
                COALESCE(
                    (SELECT f.remote_id FROM mail_folders f
                     JOIN mail_message_folders mf ON f.id = mf.folder_id
                     WHERE mf.message_id = m.id
                     ORDER BY CASE f.role
                                WHEN 'inbox' THEN 0
                                WHEN 'sent'  THEN 1
                                WHEN 'drafts' THEN 2
                                WHEN 'archive' THEN 3
                                WHEN 'trash' THEN 4
                                WHEN 'junk' THEN 5
                                ELSE 6 END
                     LIMIT 1),
                    'INBOX'
                ) AS folder_remote_id
         FROM mail_messages m
         WHERE m.id = ?1 AND m.is_deleted = 0",
        params![message_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Update the remote_uid of a local message (used after pushing a draft to IMAP).
pub fn set_message_remote_uid(pool: &DbPool, message_id: i64, remote_uid: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_messages SET remote_uid = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![remote_uid, message_id],
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

#[allow(dead_code)]
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
/// Excludes special folders (sent, trash, spam) that should never show unread counts
pub fn folder_unread_counts(pool: &DbPool, account_id: i64) -> Result<Vec<(i64, i64)>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT mf.folder_id, COUNT(*)
         FROM mail_messages m
         JOIN mail_message_folders mf ON m.id = mf.message_id
         JOIN mail_folders f ON mf.folder_id = f.id
         WHERE m.account_id = ?1 AND m.is_read = 0 AND m.is_deleted = 0
         AND f.role NOT IN ('sent', 'trash', 'spam', 'drafts')
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

/// Update the local_path of an attachment (used when a lazy attachment is manually downloaded).
#[allow(dead_code)]
pub fn update_attachment_path(pool: &DbPool, attachment_id: i64, local_path: &str) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_attachments SET local_path = ?1 WHERE id = ?2",
        params![local_path, attachment_id],
    )?;
    Ok(())
}

pub fn list_attachments(pool: &DbPool, message_id: i64) -> Result<Vec<(i64, String, String, i64, String, String)>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, filename, content_type, size, local_path, content_id FROM mail_attachments WHERE message_id = ?1"
    )?;
    let attachments = stmt.query_map(params![message_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5).unwrap_or_default()))
    })?.filter_map(|r| r.ok()).collect();
    Ok(attachments)
}

// ---- App Config ----

pub fn get_config(pool: &DbPool, key: &str) -> Option<String> {
    let conn = pool.get().ok()?;
    conn.query_row(
        "SELECT value FROM app_config WHERE key = ?1",
        params![key],
        |row| row.get(0),
    ).ok()
}

pub fn set_config(pool: &DbPool, key: &str, value: &str) {
    if let Ok(conn) = pool.get() {
        let _ = conn.execute(
            "INSERT OR REPLACE INTO app_config (key, value) VALUES (?1, ?2)",
            params![key, value],
        );
    }
}

pub fn get_unread_message_count(pool: &DbPool, account_id: i64) -> i64 {
    if let Ok(conn) = pool.get() {
        conn.query_row(
            "SELECT COUNT(*) FROM mail_messages WHERE account_id = ?1 AND is_read = 0 AND is_deleted = 0",
            params![account_id],
            |row| row.get(0),
        ).unwrap_or(0)
    } else { 0 }
}

pub fn insert_contact(pool: &DbPool, contact: &MailContact) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO mail_contacts (account_id, name, email, phone, group_id, display_name, notes)
         VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![
            contact.account_id, contact.name, contact.email, contact.phone,
            contact.group_id, contact.display_name, contact.notes
        ],
    )?;
    let id = conn.last_insert_rowid();
    crate::sync::helpers::mark_dirty(&conn, "mail_contacts", id)?;
    Ok(id)
}

pub fn list_contacts(pool: &DbPool, account_id: i64) -> Result<Vec<MailContact>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, account_id, name, email, phone, group_id, display_name, notes
         FROM mail_contacts WHERE account_id = ?1
         ORDER BY name COLLATE NOCASE"
    )?;
    let contacts = stmt.query_map(params![account_id], |row| {
        Ok(MailContact {
            id: Some(row.get(0)?),
            account_id: row.get(1)?,
            name: row.get(2)?,
            email: row.get(3)?,
            phone: row.get(4).unwrap_or_default(),
            group_id: row.get(5)?,
            display_name: row.get(6).unwrap_or_default(),
            notes: row.get(7).unwrap_or_default(),
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(contacts)
}

pub fn delete_contact(pool: &DbPool, id: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    // 软删除：标记为 deleting
    conn.execute(
        "UPDATE mail_contacts SET sync_status = 'deleting', sync_version = sync_version + 1 WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn update_contact(pool: &DbPool, contact: &MailContact) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_contacts SET name=?1, email=?2, phone=?3, group_id=?4, display_name=?5, notes=?6 WHERE id=?7",
        params![
            contact.name, contact.email, contact.phone, contact.group_id,
            contact.display_name, contact.notes, contact.id
        ],
    )?;
    if let Some(id) = contact.id {
        crate::sync::helpers::mark_dirty(&conn, "mail_contacts", id)?;
    }
    Ok(())
}

// ---- v1.1 Contact Groups ----

pub fn list_contact_groups(pool: &DbPool, account_id: i64) -> Result<Vec<MailContactGroup>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, account_id, name, color, sort_order
         FROM mail_contact_groups WHERE account_id = ?1
         ORDER BY sort_order ASC, name COLLATE NOCASE ASC"
    )?;
    let groups = stmt.query_map(params![account_id], |row| {
        Ok(MailContactGroup {
            id: Some(row.get(0)?),
            account_id: row.get(1)?,
            name: row.get(2)?,
            color: row.get(3).unwrap_or_else(|_| "#6366f1".to_string()),
            sort_order: row.get(4).unwrap_or(0),
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(groups)
}

pub fn insert_contact_group(pool: &DbPool, group: &MailContactGroup) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO mail_contact_groups (account_id, name, color, sort_order) VALUES (?1,?2,?3,?4)",
        params![group.account_id, group.name, group.color, group.sort_order],
    )?;
    let id = conn.last_insert_rowid();
    crate::sync::helpers::mark_dirty(&conn, "mail_contact_groups", id)?;
    Ok(id)
}

pub fn update_contact_group(pool: &DbPool, group: &MailContactGroup) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_contact_groups SET name=?1, color=?2, sort_order=?3 WHERE id=?4",
        params![group.name, group.color, group.sort_order, group.id],
    )?;
    Ok(())
}

pub fn delete_contact_group(pool: &DbPool, id: i64) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    // ON DELETE SET NULL 已经把相关联系人 group_id 置空；这里返回受影响行数（联系人变更数）
    let affected = conn.execute(
        "DELETE FROM mail_contact_groups WHERE id = ?1",
        params![id],
    )?;
    Ok(affected as i64)
}

pub fn find_contact_by_email(
    pool: &DbPool,
    email: &str,
    account_id: Option<i64>,
) -> Result<Option<MailContact>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let result = if let Some(aid) = account_id {
        conn.query_row(
            "SELECT id, account_id, name, email, phone, group_id, display_name, notes
             FROM mail_contacts WHERE account_id = ?1 AND email = ?2 COLLATE NOCASE
             LIMIT 1",
            params![aid, email.to_lowercase()],
            |row| Ok(MailContact {
                id: Some(row.get(0)?),
                account_id: row.get(1)?,
                name: row.get(2)?,
                email: row.get(3)?,
                phone: row.get(4).unwrap_or_default(),
                group_id: row.get(5)?,
                display_name: row.get(6).unwrap_or_default(),
                notes: row.get(7).unwrap_or_default(),
            }),
        ).ok()
    } else {
        conn.query_row(
            "SELECT id, account_id, name, email, phone, group_id, display_name, notes
             FROM mail_contacts WHERE email = ?1 COLLATE NOCASE
             ORDER BY account_id ASC LIMIT 1",
            params![email.to_lowercase()],
            |row| Ok(MailContact {
                id: Some(row.get(0)?),
                account_id: row.get(1)?,
                name: row.get(2)?,
                email: row.get(3)?,
                phone: row.get(4).unwrap_or_default(),
                group_id: row.get(5)?,
                display_name: row.get(6).unwrap_or_default(),
                notes: row.get(7).unwrap_or_default(),
            }),
        ).ok()
    };
    Ok(result)
}

pub fn search_messages_by_email(
    pool: &DbPool,
    email: &str,
    account_ids: Option<&[i64]>,
    limit: i64,
) -> Result<ContactMailSummary> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let lower = email.to_lowercase();
    // 用 `from_email` 精确 + `to_list`/`cc_list` LIKE 双向匹配
    // 二次过滤在 Rust 端（LIKE 太宽，recipients list 是 JSON 数组字符串）
    let mut sql = String::from(
        "SELECT id, account_id, remote_uid, subject, from_name, from_email, date,
                is_read, is_starred, has_attachment, size, thread_id, is_deleted,
                to_list, cc_list
         FROM mail_messages
         WHERE is_deleted = 0
           AND (from_email = ?1 COLLATE NOCASE
                OR to_list LIKE ?2 OR cc_list LIKE ?2)"
    );
    if let Some(ids) = account_ids {
        if !ids.is_empty() {
            let placeholders: Vec<String> = ids.iter().enumerate()
                .map(|(i, _)| format!("?{}", i + 3))
                .collect();
            sql.push_str(&format!(" AND account_id IN ({})", placeholders.join(",")));
        }
    }
    sql.push_str(" ORDER BY date_sort DESC LIMIT ?");
    let limit_param_idx = if account_ids.map(|ids| !ids.is_empty()).unwrap_or(false) {
        3 + account_ids.unwrap().len()
    } else {
        3
    };
    sql = sql.replacen("LIMIT ?", &format!("LIMIT ?{}", limit_param_idx), 1);

    let mut params_dyn: Vec<Box<dyn rusqlite::types::ToSql>> = vec![
        Box::new(lower.clone()),
        Box::new(format!("%{}%", lower)),
    ];
    if let Some(ids) = account_ids {
        for id in ids {
            params_dyn.push(Box::new(*id));
        }
    }
    params_dyn.push(Box::new(limit));
    let refs: Vec<&dyn rusqlite::types::ToSql> = params_dyn.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql)?;
    let rows: Vec<MailMessageSummary> = stmt.query_map(refs.as_slice(), |row| {
        Ok(MailMessageSummary {
            id: row.get(0)?,
            account_id: row.get(1)?,
            remote_uid: row.get(2)?,
            subject: row.get(3)?,
            from_name: row.get(4)?,
            from_email: row.get(5)?,
            date: row.get(6)?,
            is_read: row.get(7)?,
            is_starred: row.get(8)?,
            has_attachment: row.get(9)?,
            size: row.get(10)?,
            thread_id: row.get(11)?,
            is_deleted: row.get(12)?,
            to_list: row.get(13).unwrap_or_default(),
            cc_list: row.get(14).unwrap_or_default(),
        })
    })?.filter_map(|r| r.ok()).collect();
    drop(stmt);

    // 二次过滤：to_list / cc_list 是 JSON 数组字符串，需要精确匹配 email
    let filtered: Vec<MailMessageSummary> = rows.into_iter()
        .filter(|m| m.from_email.eq_ignore_ascii_case(&lower)
            || list_contains_email_simple(&m.to_list, &lower)
            || list_contains_email_simple(&m.cc_list, &lower))
        .collect();
    let total = filtered.len() as i64;
    let mut account_ids_out: Vec<i64> = filtered.iter().map(|m| m.account_id).collect();
    account_ids_out.sort();
    account_ids_out.dedup();

    Ok(ContactMailSummary {
        contact_email: lower,
        total,
        account_ids: account_ids_out,
        messages: filtered,
    })
}

/// 极简邮箱数组匹配：to_list/cc_list 在 Rust 端是
/// `serde_json::to_string(&Vec<String>)` 序列化的 JSON 数组。
/// 不解析完整 RFC 8259 — 只覆盖本项目产生的 `["a@x.com","b@x.com"]` 格式。
/// 匹配规则：在数组字符串中查找 `"<email>"` 子串（带引号，避免 `@` 误匹配）。
fn list_contains_email_simple(json_array: &str, email_lower: &str) -> bool {
    if json_array.is_empty() || email_lower.is_empty() {
        return false;
    }
    // serde_json 序列化 Vec<String> 形式为 ["a@x.com","b@x.com"]，
    // 直接做 `"<email>"` 包含判断，N 封邮件场景 < 1ms。
    let needle = format!("\"{}\"", email_lower);
    json_array.to_lowercase().contains(&needle)
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

/// Count how many messages an account already has in the DB.
/// Used to detect first sync vs incremental sync.
pub fn count_account_messages(pool: &DbPool, account_id: i64) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM mail_messages WHERE account_id = ?1",
        params![account_id],
        |row| row.get(0),
    )?;
    Ok(count)
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
            // Bug #5 fix: ORDER BY date_sort DESC for consistent chronological
            // ordering across FTS5 and LIKE paths.
            let sql = format!(
                "SELECT id, account_id, remote_uid, subject, from_name, from_email, date,
                        is_read, is_starred, has_attachment, size, thread_id, is_deleted,
                        to_list, cc_list
                 FROM mail_messages
                 WHERE id IN ({}) AND account_id = ?{} AND is_deleted = 0
                 ORDER BY date_sort DESC LIMIT 100",
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
    // Bug #5 fix: ORDER BY date_sort DESC (the sortable ISO form) instead of
    // `date DESC` (the raw header value). The raw header is RFC 2822 text that
    // sorts lexicographically and produces wrong order — e.g. "Tue, 12 May
    // 2026 10:02:24 +0800" sorts after "Wed, 10 Jun 2026 15:57:48 +0000".
    // `date_sort` is the normalized YYYY-MM-DD HH:MM:SS string computed in
    // `normalize_date` and gives a correct chronological order.
    let search = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, account_id, remote_uid, subject, from_name, from_email, date,
                is_read, is_starred, has_attachment, size, thread_id, is_deleted,
                to_list, cc_list
         FROM mail_messages
         WHERE account_id = ?1 AND is_deleted = 0
           AND (subject LIKE ?2 OR from_name LIKE ?2 OR from_email LIKE ?2 OR body_text LIKE ?2)
         ORDER BY date_sort DESC LIMIT 100"
    )?;
    let messages: Vec<MailMessageSummary> = stmt.query_map(params![account_id, search], map_summary)?
        .filter_map(|r| r.ok()).collect();
    Ok(messages)
}

// =====================================================================
// Tests (v1.1 Slice 1 — contacts data layer)
// =====================================================================

#[cfg(test)]
mod contact_tests {
    use super::*;
    use crate::db::DbPool;
    use r2d2::Pool;
    use r2d2_sqlite::SqliteConnectionManager;

    /// 创建共享的 in-memory DB 池，并跑过迁移。
    /// 用 max_size=1 + block 模式保证单连接复用。
    fn make_test_pool() -> DbPool {
        let manager = SqliteConnectionManager::file(":memory:")
            .with_init(|conn| {
                conn.execute_batch(
                    "PRAGMA foreign_keys = ON;
                     PRAGMA busy_timeout = 5000;"
                ).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
                Ok(())
            });
        let pool = Pool::builder().max_size(1).build(manager).expect("build pool");
        {
            let conn = pool.get().expect("get conn");
            crate::db::schema::create_tables(&conn).expect("create_tables");
        }
        pool
    }

    /// 准备一个 mail_accounts 行（FK 目标），返回 account_id
    fn seed_account(pool: &DbPool) -> i64 {
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO mail_accounts (email, imap_host, imap_port, smtp_host, smtp_port, username)
             VALUES (?1, 'imap.test', 993, 'smtp.test', 465, ?1)",
            params!["test@example.com"],
        ).unwrap();
        conn.last_insert_rowid()
    }

    /// 模拟 v1 schema（用 group_name 字符串列）。返回建表 SQL。
    /// 注意：故意不带 group_id 列。
    const V1_CREATE_MAIL_CONTACTS: &str = "
        CREATE TABLE mail_contacts_v1 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL DEFAULT '',
            group_name TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (account_id) REFERENCES mail_accounts(id) ON DELETE CASCADE
        )";

    /// 用 v1 邮件表替换当前 v2 表，并插入测试数据。
    /// 模拟「老用户从 v1 升级」的状态。
    fn setup_v1_contacts(pool: &DbPool, account_id: i64, rows: &[(String, String, String)]) {
        let conn = pool.get().unwrap();
        conn.execute("DROP TABLE mail_contacts", []).unwrap();
        conn.execute_batch(V1_CREATE_MAIL_CONTACTS).unwrap();
        let mut stmt = conn.prepare(
            "INSERT INTO mail_contacts_v1 (account_id, name, email, group_name) VALUES (?1, ?2, ?3, ?4)"
        ).unwrap();
        for (name, email, group) in rows {
            stmt.execute(params![account_id, name, email, group]).unwrap();
        }
        // 把 v1 表重命名回 mail_contacts，让迁移逻辑可以处理它
        conn.execute("ALTER TABLE mail_contacts_v1 RENAME TO mail_contacts", []).unwrap();
        drop(stmt);
        // 重建一下 account_id 索引（迁移代码也会重建）
    }

    // ---------- 迁移测试 ----------

    #[test]
    fn migration_empty_table_creates_v2_schema() {
        // 全新 DB 跑 create_tables 一次：迁移对空表应该是幂等的。
        let pool = make_test_pool();
        let conn = pool.get().unwrap();
        // v2 schema 应有 group_id 列
        let has_group_id: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('mail_contacts') WHERE name = 'group_id'",
                [],
                |row| row.get(0),
            ).unwrap();
        assert_eq!(has_group_id, 1, "v2 schema should have group_id column");
        // mail_contact_groups 表应存在
        let has_groups_table: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='mail_contact_groups'",
                [],
                |row| row.get(0),
            ).unwrap();
        assert_eq!(has_groups_table, 1, "mail_contact_groups table should exist");
    }

    #[test]
    fn migration_with_group_name_creates_groups() {
        let pool = make_test_pool();
        let account_id = seed_account(&pool);
        setup_v1_contacts(&pool, account_id, &[
            ("Alice".to_string(), "alice@x.com".to_string(), "同事".to_string()),
            ("Bob".to_string(), "bob@x.com".to_string(), "同事".to_string()),
            ("Carol".to_string(), "carol@x.com".to_string(), "家人".to_string()),
        ]);
        // 触发迁移
        {
            let conn = pool.get().unwrap();
            crate::db::schema::create_tables(&conn).expect("re-migrate");
        }
        // 验证：2 个分组被建出来
        let conn = pool.get().unwrap();
        let groups: Vec<(String,)> = conn.prepare(
            "SELECT name FROM mail_contact_groups WHERE account_id = ?1 ORDER BY name"
        ).unwrap()
        .query_map(params![account_id], |row| Ok((row.get(0)?,)))
        .unwrap().filter_map(|r| r.ok()).collect();
        assert_eq!(groups.len(), 2, "should create 2 groups (同事/家人)");
        assert_eq!(groups[0].0, "同事");
        assert_eq!(groups[1].0, "家人");

        // 验证：3 个联系人迁移后 group_id 正确
        let mut stmt = conn.prepare(
            "SELECT name, group_id FROM mail_contacts WHERE account_id = ?1 ORDER BY name"
        ).unwrap();
        let rows: Vec<(String, Option<i64>)> = stmt.query_map(params![account_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
        }).unwrap().filter_map(|r| r.ok()).collect();
        assert_eq!(rows.len(), 3);
        // Alice 和 Bob 都属于 "同事"，应该指向同一个 group_id
        let alice_gid = rows.iter().find(|(n, _)| n == "Alice").unwrap().1;
        let bob_gid = rows.iter().find(|(n, _)| n == "Bob").unwrap().1;
        let carol_gid = rows.iter().find(|(n, _)| n == "Carol").unwrap().1;
        assert_eq!(alice_gid, bob_gid, "Alice and Bob should share group_id");
        assert_ne!(alice_gid, carol_gid, "Alice's group should differ from Carol's");
        assert!(alice_gid.is_some() && carol_gid.is_some());
    }

    #[test]
    fn migration_duplicate_group_name_collapses_to_one() {
        // v1 数据：3 个联系人用相同的 group_name "X"
        // 迁移后应该只创建 1 个分组
        let pool = make_test_pool();
        let account_id = seed_account(&pool);
        setup_v1_contacts(&pool, account_id, &[
            ("A".to_string(), "a@x.com".to_string(), "X".to_string()),
            ("B".to_string(), "b@x.com".to_string(), "X".to_string()),
            ("C".to_string(), "c@x.com".to_string(), "X".to_string()),
        ]);
        {
            let conn = pool.get().unwrap();
            crate::db::schema::create_tables(&conn).expect("re-migrate");
        }
        let conn = pool.get().unwrap();
        let group_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM mail_contact_groups WHERE account_id = ?1",
            params![account_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(group_count, 1, "duplicate group_name should collapse to 1 group");
        // 3 个联系人应共享同一个 group_id
        let distinct_gids: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT group_id) FROM mail_contacts WHERE account_id = ?1",
            params![account_id],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(distinct_gids, 1, "all 3 contacts should share 1 group_id");
    }

    // ---------- insert_contact 唯一性 ----------

    #[test]
    fn insert_contact_duplicate_email_returns_error() {
        let pool = make_test_pool();
        let account_id = seed_account(&pool);
        let c1 = MailContact {
            id: None, account_id, name: "Alice".to_string(),
            email: "dup@x.com".to_string(), phone: "".to_string(),
            group_id: None, display_name: "Alice".to_string(), notes: "".to_string(),
        };
        let id1 = insert_contact(&pool, &c1).expect("first insert");
        assert!(id1 > 0);
        // 第二次插入同 (account_id, email) → UniqueViolation
        let c2 = MailContact {
            id: None, account_id, name: "Alice2".to_string(),
            email: "dup@x.com".to_string(), phone: "".to_string(),
            group_id: None, display_name: "Alice2".to_string(), notes: "".to_string(),
        };
        let err = insert_contact(&pool, &c2).unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("UNIQUE") || msg.contains("UniqueViolation"),
            "expected UNIQUE violation, got: {}", msg
        );
    }

    // ---------- search_messages_by_email ----------

    /// 插入一封邮件 (from + to + cc)
    fn insert_test_message(
        pool: &DbPool,
        account_id: i64,
        from_email: &str,
        to_list: &str,
        cc_list: &str,
    ) -> i64 {
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO mail_messages
                (account_id, remote_uid, subject, from_name, from_email, to_list, cc_list,
                 body_text, date, date_sort, is_read, is_starred, has_attachment, size, is_deleted)
             VALUES (?1, 1, 'test', 'X', ?2, ?3, ?4, '', '2026-06-12 10:00:00', '2026-06-12 10:00:00', 0, 0, 0, 0, 0)",
            params![account_id, from_email, to_list, cc_list],
        ).unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn search_messages_by_email_hit_on_from() {
        let pool = make_test_pool();
        let account_id = seed_account(&pool);
        insert_test_message(&pool, account_id, "alice@x.com", "[]", "[]");
        let result = search_messages_by_email(&pool, "alice@x.com", None, 50).unwrap();
        assert_eq!(result.total, 1);
        assert_eq!(result.messages[0].from_email.to_lowercase(), "alice@x.com");
    }

    #[test]
    fn search_messages_by_email_miss() {
        let pool = make_test_pool();
        let account_id = seed_account(&pool);
        insert_test_message(&pool, account_id, "alice@x.com", "[]", "[]");
        let result = search_messages_by_email(&pool, "nobody@x.com", None, 50).unwrap();
        assert_eq!(result.total, 0);
        assert!(result.messages.is_empty());
    }

    #[test]
    fn search_messages_by_email_hit_on_to_list() {
        let pool = make_test_pool();
        let account_id = seed_account(&pool);
        // alice 在 to_list 中，不在 from_email
        insert_test_message(
            &pool, account_id,
            "bob@x.com",
            r#"["alice@x.com","carol@x.com"]"#,
            "[]",
        );
        let result = search_messages_by_email(&pool, "alice@x.com", None, 50).unwrap();
        assert_eq!(result.total, 1, "should find message via to_list");
    }

    #[test]
    fn search_messages_by_email_hit_on_both_from_and_to() {
        // 同一封邮件 alice 同时在 from 和 to（reply-all 场景）
        // 搜索 alice 应该只返回 1 条
        let pool = make_test_pool();
        let account_id = seed_account(&pool);
        insert_test_message(
            &pool, account_id,
            "alice@x.com",
            r#"["alice@x.com","bob@x.com"]"#,
            "[]",
        );
        let result = search_messages_by_email(&pool, "alice@x.com", None, 50).unwrap();
        assert_eq!(result.total, 1, "from+to duplicate should collapse to 1 message");
    }

    #[test]
    fn search_messages_by_email_hit_on_cc_list() {
        let pool = make_test_pool();
        let account_id = seed_account(&pool);
        insert_test_message(
            &pool, account_id,
            "bob@x.com",
            r#"["carol@x.com"]"#,
            r#"["alice@x.com"]"#,
        );
        let result = search_messages_by_email(&pool, "alice@x.com", None, 50).unwrap();
        assert_eq!(result.total, 1, "should find message via cc_list");
    }
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

#[allow(dead_code)]
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

// ---- Signatures ----

pub fn list_signatures(pool: &DbPool, account_id: i64) -> Result<Vec<MailSignature>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, account_id, name, signature_text, signature_html, is_default
         FROM mail_signatures WHERE account_id = ?1
         ORDER BY is_default DESC, name COLLATE NOCASE ASC"
    )?;
    let signatures = stmt.query_map(params![account_id], |row| {
        Ok(MailSignature {
            id: Some(row.get(0)?),
            account_id: row.get(1)?,
            name: row.get(2)?,
            signature_text: row.get(3)?,
            signature_html: row.get(4)?,
            is_default: row.get::<_, i32>(5)? != 0,
        })
    })?.filter_map(|r| r.ok()).collect();
    Ok(signatures)
}

pub fn insert_signature(pool: &DbPool, signature: &MailSignature) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO mail_signatures (account_id, name, signature_text, signature_html, is_default)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            signature.account_id,
            signature.name,
            signature.signature_text,
            signature.signature_html,
            signature.is_default as i32,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_signature(pool: &DbPool, signature: &MailSignature) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let id = signature.id.ok_or_else(|| {
        rusqlite::Error::InvalidParameterName("id is required for update".into())
    })?;
    conn.execute(
        "UPDATE mail_signatures SET name=?1, signature_text=?2, signature_html=?3, is_default=?4, updated_at=datetime('now') WHERE id=?5",
        params![
            signature.name,
            signature.signature_text,
            signature.signature_html,
            signature.is_default as i32,
            id,
        ],
    )?;
    Ok(())
}

pub fn delete_signature(pool: &DbPool, id: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute("DELETE FROM mail_signatures WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_default_signature(pool: &DbPool, account_id: i64) -> Result<Option<MailSignature>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let result = conn.query_row(
        "SELECT id, account_id, name, signature_text, signature_html, is_default
         FROM mail_signatures WHERE account_id = ?1 AND is_default = 1 LIMIT 1",
        params![account_id],
        |row| {
            Ok(MailSignature {
                id: Some(row.get(0)?),
                account_id: row.get(1)?,
                name: row.get(2)?,
                signature_text: row.get(3)?,
                signature_html: row.get(4)?,
                is_default: row.get::<_, i32>(5)? != 0,
            })
        },
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn set_default_signature(pool: &DbPool, id: i64) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    // Get the account_id of this signature
    let account_id: i64 = conn.query_row(
        "SELECT account_id FROM mail_signatures WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    // Clear all defaults for this account
    conn.execute(
        "UPDATE mail_signatures SET is_default = 0, updated_at = datetime('now') WHERE account_id = ?1",
        params![account_id],
    )?;
    // Set this one as default
    conn.execute(
        "UPDATE mail_signatures SET is_default = 1, updated_at = datetime('now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

// =====================================================================
// Accounting Module - 记账模块数据操作
// =====================================================================

/// 交易记录结构体
#[allow(dead_code)]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: i64,
    #[serde(rename = "type")]
    pub txn_type: String,
    pub amount: f64,
    pub category: String,
    pub subcategory: Option<String>,
    pub note: Option<String>,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 分类结构体
#[allow(dead_code)]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub category_type: String,
    pub icon: String,
    pub color: String,
    pub parent_id: i64,
    pub sort_order: i64,
    pub created_at: String,
}

/// 预算结构体
#[allow(dead_code)]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Budget {
    pub id: i64,
    pub category: String,
    pub amount: f64,
    pub year: i64,
    pub month: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// 统计摘要结构体
#[allow(dead_code)]
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountingSummary {
    pub total_income: f64,
    pub total_expense: f64,
    pub balance: f64,
    pub budget_usage_rate: f64,
}

// ---- Transactions ----

/// 获取交易列表
#[allow(dead_code)]
pub fn list_transactions(
    pool: &DbPool,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> Result<Vec<Transaction>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match (start_date, end_date) {
        (Some(start), Some(end)) => (
            "SELECT id, type, amount, category, subcategory, note, date, created_at, updated_at \
             FROM transactions WHERE date BETWEEN ?1 AND ?2 ORDER BY date DESC".to_string(),
            vec![Box::new(start.to_string()), Box::new(end.to_string())],
        ),
        (Some(start), None) => (
            "SELECT id, type, amount, category, subcategory, note, date, created_at, updated_at \
             FROM transactions WHERE date >= ?1 ORDER BY date DESC".to_string(),
            vec![Box::new(start.to_string())],
        ),
        (None, Some(end)) => (
            "SELECT id, type, amount, category, subcategory, note, date, created_at, updated_at \
             FROM transactions WHERE date <= ?1 ORDER BY date DESC".to_string(),
            vec![Box::new(end.to_string())],
        ),
        (None, None) => (
            "SELECT id, type, amount, category, subcategory, note, date, created_at, updated_at \
             FROM transactions ORDER BY date DESC".to_string(),
            vec![],
        ),
    };

    let refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(refs.as_slice(), |row| {
        Ok(Transaction {
            id: row.get(0)?,
            txn_type: row.get(1)?,
            amount: row.get(2)?,
            category: row.get(3)?,
            subcategory: row.get(4)?,
            note: row.get(5)?,
            date: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

/// 创建交易记录
#[allow(dead_code)]
pub fn insert_transaction(pool: &DbPool, txn: &Transaction) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO transactions (type, amount, category, subcategory, note, date) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            txn.txn_type,
            txn.amount,
            txn.category,
            txn.subcategory,
            txn.note,
            txn.date
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 更新交易记录
#[allow(dead_code)]
pub fn update_transaction(pool: &DbPool, txn: &Transaction) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE transactions SET type=?1, amount=?2, category=?3, subcategory=?4, note=?5, date=?6, \
         updated_at=datetime('now') WHERE id=?7",
        params![
            txn.txn_type,
            txn.amount,
            txn.category,
            txn.subcategory,
            txn.note,
            txn.date,
            txn.id
        ],
    )?;
    Ok(())
}

/// 删除交易记录
#[allow(dead_code)]
pub fn delete_transaction(pool: &DbPool, id: i64) -> Result<bool> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let affected = conn.execute("DELETE FROM transactions WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

// ---- Categories ----

/// 获取分类列表
#[allow(dead_code)]
pub fn list_categories(pool: &DbPool) -> Result<Vec<Category>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, name, type, icon, color, parent_id, sort_order, created_at \
         FROM categories ORDER BY sort_order ASC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            category_type: row.get(2)?,
            icon: row.get(3)?,
            color: row.get(4)?,
            parent_id: row.get(5)?,
            sort_order: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    rows.collect()
}

/// 创建分类
#[allow(dead_code)]
pub fn insert_category(pool: &DbPool, cat: &Category) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO categories (name, type, icon, color, parent_id, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            cat.name,
            cat.category_type,
            cat.icon,
            cat.color,
            cat.parent_id,
            cat.sort_order
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 更新分类
#[allow(dead_code)]
pub fn update_category(pool: &DbPool, cat: &Category) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE categories SET name=?1, type=?2, icon=?3, color=?4, parent_id=?5, sort_order=?6 \
         WHERE id=?7",
        params![
            cat.name,
            cat.category_type,
            cat.icon,
            cat.color,
            cat.parent_id,
            cat.sort_order,
            cat.id
        ],
    )?;
    Ok(())
}

/// 删除分类
#[allow(dead_code)]
pub fn delete_category(pool: &DbPool, id: i64) -> Result<bool> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let affected = conn.execute("DELETE FROM categories WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

// ---- Budgets ----

/// 获取预算列表
#[allow(dead_code)]
pub fn list_budgets(pool: &DbPool, year: i64, month: i64) -> Result<Vec<Budget>> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut stmt = conn.prepare(
        "SELECT id, category, amount, year, month, created_at, updated_at \
         FROM budgets WHERE year = ?1 AND month = ?2 ORDER BY category"
    )?;
    let rows = stmt.query_map(params![year, month], |row| {
        Ok(Budget {
            id: row.get(0)?,
            category: row.get(1)?,
            amount: row.get(2)?,
            year: row.get(3)?,
            month: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

/// 创建预算
#[allow(dead_code)]
pub fn insert_budget(pool: &DbPool, budget: &Budget) -> Result<i64> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "INSERT INTO budgets (category, amount, year, month) VALUES (?1, ?2, ?3, ?4)",
        params![budget.category, budget.amount, budget.year, budget.month],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 更新预算
#[allow(dead_code)]
pub fn update_budget(pool: &DbPool, budget: &Budget) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE budgets SET category=?1, amount=?2, updated_at=datetime('now') WHERE id=?3",
        params![budget.category, budget.amount, budget.id],
    )?;
    Ok(())
}

/// 删除预算
#[allow(dead_code)]
pub fn delete_budget(pool: &DbPool, id: i64) -> Result<bool> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let affected = conn.execute("DELETE FROM budgets WHERE id = ?1", params![id])?;
    Ok(affected > 0)
}

// ---- Statistics ----

/// 获取记账统计摘要
#[allow(dead_code)]
pub fn get_accounting_summary(pool: &DbPool) -> Result<AccountingSummary> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    let summary: (f64, f64) = conn.query_row(
        "SELECT \
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0), \
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) \
         FROM transactions",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    let (total_income, total_expense) = summary;
    let balance = total_income - total_expense;
    let budget_usage_rate = if total_income > 0.0 {
        total_expense / total_income
    } else {
        0.0
    };

    Ok(AccountingSummary {
        total_income,
        total_expense,
        balance,
        budget_usage_rate,
    })
}

