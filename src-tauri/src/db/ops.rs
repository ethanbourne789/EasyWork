use rusqlite::{params, Result};
use crate::db::DbPool;
use crate::mail::{self, MailAccount, MailFolder, MailMessage, MailMessageSummary, PendingOp, MailContact};

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
        "INSERT INTO mail_accounts (email, provider, imap_host, imap_port, smtp_host, smtp_port, username, encrypted_password, use_tls, sync_interval_secs, sync_period_days)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            account.email, account.provider, account.imap_host,
            account.imap_port, account.smtp_host, account.smtp_port,
            account.username, encrypted_pw,
            account.use_tls as i32, account.sync_interval_secs, account.sync_period_days
        ],
    )?;
    let id = tx.last_insert_rowid();
    tx.commit()?;

    log::debug!("insert_account committed: id={} email={}", id, account.email);
    Ok(id)
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
    let existing: Option<i64> = conn.query_row(
        "SELECT id FROM mail_messages WHERE account_id = ?1 AND remote_uid = ?2",
        params![msg.account_id, msg.remote_uid],
        |row| row.get(0),
    ).ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE mail_messages SET subject=?1, from_name=?2, from_email=?3, to_list=?4, cc_list=?5,
             body_text=?6, body_html=?7, is_read=?8, is_starred=?9, has_attachment=?10, size=?11,
             date=?12, date_sort=?13, updated_at=datetime('now') WHERE id=?14",
            params![
                msg.subject, msg.from_name, msg.from_email, msg.to_list, msg.cc_list,
                msg.body_text, msg.body_html, msg.is_read as i32, msg.is_starred as i32,
                msg.has_attachment as i32, msg.size, msg.date, date_sort, id
            ],
        )?;
        log::debug!("Dedup by UID: updated existing message id={} (account={}, uid={})", id, msg.account_id, msg.remote_uid);
        return Ok(id);
    }

    // ── Dedup Layer 2: By Message-ID ──
    // Catches IMAP server UID reassignment (e.g. QQ Mail re-indexing)
    if !msg.message_id_header.is_empty() {
        let existing_by_msgid: Option<i64> = conn.query_row(
            "SELECT id FROM mail_messages WHERE account_id = ?1 AND message_id_header = ?2",
            params![msg.account_id, msg.message_id_header],
            |row| row.get(0),
        ).ok();

        if let Some(id) = existing_by_msgid {
            // Same Message-ID, different UID → server re-assigned UID, update and reuse
            conn.execute(
                "UPDATE mail_messages SET remote_uid=?1, subject=?2, from_name=?3, from_email=?4,
                 to_list=?5, cc_list=?6, date=?7, date_sort=?8, body_text=?9, body_html=?10,
                 is_read=?11, is_starred=?12, has_attachment=?13, size=?14, thread_id=?15,
                 updated_at=datetime('now')
                 WHERE id=?16",
                params![
                    msg.remote_uid, msg.subject, msg.from_name, msg.from_email,
                    msg.to_list, msg.cc_list, msg.date, date_sort, msg.body_text, msg.body_html,
                    msg.is_read as i32, msg.is_starred as i32,
                    msg.has_attachment as i32, msg.size, msg.thread_id, id
                ],
            )?;
            log::info!(
                "Dedup by Message-ID: updated UID {}→{} for existing message id={} (account={})",
                msg.remote_uid, msg.remote_uid, id, msg.account_id
            );
            return Ok(id);
        }
    }

    // ── Dedup Layer 3: By content hash (subject + from + date) ──
    // Last-resort catch for emails with missing/invalid Message-ID
    {
        let hash = compute_content_hash(&msg.subject, &msg.from_email, &msg.date);
        let existing_by_hash: Option<i64> = conn.query_row(
            "SELECT m.id FROM mail_messages m
             WHERE m.account_id = ?1 AND m.content_hash = ?2
             LIMIT 1",
            params![msg.account_id, hash],
            |row| row.get(0),
        ).ok();

        if let Some(id) = existing_by_hash {
            conn.execute(
                "UPDATE mail_messages SET remote_uid=?1, thread_id=?2, date_sort=?3, updated_at=datetime('now')
                 WHERE id=?4",
                params![msg.remote_uid, msg.thread_id, date_sort, id],
            )?;
            log::info!("Dedup by content hash: updated UID for existing message id={} (account={})", id, msg.account_id);
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
            let mut check = conn.prepare(
                "SELECT id, thread_id FROM mail_messages
                 WHERE account_id = ?1 AND is_deleted = 0
                 AND (in_reply_to = ?2 OR message_id_header = ?2)
                 AND thread_id != ?3
                 LIMIT 1"
            ).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

            let ref_found: Result<Option<(i64, String)>> = check.query_row(
                params![account_id, msg_id, thread_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).map(Some)
             .or_else(|e| if e == rusqlite::Error::QueryReturnedNoRows { Ok(None) } else { Err(e) });

            if let Ok(Some((_ref_id, ref_thread_id))) = ref_found {
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
                m.is_read, m.is_starred, m.has_attachment, m.size, m.thread_id, m.is_deleted
         FROM mail_messages m
         JOIN mail_message_folders mf ON m.id = mf.message_id
         WHERE m.account_id = ?1 AND mf.folder_id = ?2 AND m.is_deleted = 0
         ORDER BY m.date_sort DESC LIMIT ?3 OFFSET ?4"
    } else {
        "SELECT id, account_id, remote_uid, subject, from_name, from_email, date,
                is_read, is_starred, has_attachment, size, thread_id, is_deleted
         FROM mail_messages WHERE account_id = ?1 AND is_deleted = 0
         ORDER BY date_sort DESC LIMIT ?2 OFFSET ?3"
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

/// Update the local_path of an attachment (used when a lazy attachment is manually downloaded).
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

pub fn update_contact(pool: &DbPool, contact: &MailContact) -> Result<()> {
    let conn = pool.get().map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE mail_contacts SET name=?1, email=?2, phone=?3, group_name=?4, notes=?5 WHERE id=?6",
        params![contact.name, contact.email, contact.phone, contact.group_name, contact.notes, contact.id],
    )?;
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
                        is_read, is_starred, has_attachment, size, thread_id, is_deleted
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
                is_read, is_starred, has_attachment, size, thread_id, is_deleted
         FROM mail_messages
         WHERE account_id = ?1 AND is_deleted = 0
           AND (subject LIKE ?2 OR from_name LIKE ?2 OR from_email LIKE ?2 OR body_text LIKE ?2)
         ORDER BY date_sort DESC LIMIT 100"
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
