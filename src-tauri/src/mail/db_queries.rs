use rusqlite::{Connection, params};
use crate::mail::error::{MailError, MailResult};
use crate::mail::types::*;

pub fn list_accounts(conn: &Connection) -> MailResult<Vec<EmailAccount>> {
    let mut stmt = conn.prepare("SELECT * FROM email_accounts ORDER BY created_at")?;
    let rows = stmt.query_map([], |row| {
        Ok(EmailAccount {
            id: row.get("id")?, email: row.get("email")?, display_name: row.get("display_name")?,
            username: row.get("username")?, credential_ref: row.get("credential_ref")?,
            imap_host: row.get("imap_host")?, imap_port: row.get("imap_port")?,
            smtp_host: row.get("smtp_host")?, smtp_port: row.get("smtp_port")?,
            use_ssl: row.get::<_, i64>("use_ssl")? != 0, auth_type: row.get("auth_type")?,
            signature_id: row.get("signature_id")?,
            signature_auto_append_new: row.get::<_, i64>("signature_auto_append_new")? != 0,
            signature_auto_append_reply: row.get::<_, i64>("signature_auto_append_reply")? != 0,
            last_synced_at: row.get("last_synced_at")?, sync_enabled: row.get::<_, i64>("sync_enabled")? != 0,
            sync_interval_mins: row.get("sync_interval_mins")?, created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

pub fn get_account(conn: &Connection, id: &str) -> MailResult<EmailAccount> {
    let mut stmt = conn.prepare("SELECT * FROM email_accounts WHERE id = ?1")?;
    let account = stmt.query_row(params![id], |row| {
        Ok(EmailAccount {
            id: row.get("id")?, email: row.get("email")?, display_name: row.get("display_name")?,
            username: row.get("username")?, credential_ref: row.get("credential_ref")?,
            imap_host: row.get("imap_host")?, imap_port: row.get("imap_port")?,
            smtp_host: row.get("smtp_host")?, smtp_port: row.get("smtp_port")?,
            use_ssl: row.get::<_, i64>("use_ssl")? != 0, auth_type: row.get("auth_type")?,
            signature_id: row.get("signature_id")?,
            signature_auto_append_new: row.get::<_, i64>("signature_auto_append_new")? != 0,
            signature_auto_append_reply: row.get::<_, i64>("signature_auto_append_reply")? != 0,
            last_synced_at: row.get("last_synced_at")?, sync_enabled: row.get::<_, i64>("sync_enabled")? != 0,
            sync_interval_mins: row.get("sync_interval_mins")?, created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }).map_err(MailError::from)?;
    Ok(account)
}

pub fn list_folders(conn: &Connection, account_id: Option<&str>) -> MailResult<Vec<EmailFolder>> {
    let mut stmt = if account_id.is_some() {
        conn.prepare("SELECT * FROM email_folders WHERE account_id = ?1 ORDER BY sort_order, name")?
    } else {
        conn.prepare("SELECT * FROM email_folders ORDER BY sort_order, name")?
    };
    let rows = if account_id.is_some() {
        stmt.query_map(params![account_id], map_folder)?
    } else {
        stmt.query_map([], map_folder)?
    };
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

fn map_folder(row: &rusqlite::Row) -> rusqlite::Result<EmailFolder> {
    Ok(EmailFolder {
        id: row.get("id")?, account_id: row.get("account_id")?, name: row.get("name")?,
        imap_path: row.get("imap_path")?, parent_path: row.get("parent_path")?,
        is_system: row.get::<_, i64>("is_system")? != 0, folder_type: row.get("folder_type")?,
        sort_order: row.get("sort_order")?, unread_count: row.get("unread_count")?,
        total_count: row.get("total_count")?, created_at: row.get("created_at")?,
    })
}

pub fn update_account(conn: &Connection, id: &str, email: &str, display_name: Option<&str>,
    username: Option<&str>, imap_host: &str, imap_port: i64, smtp_host: &str, smtp_port: i64,
    use_ssl: bool) -> MailResult<()> {
    conn.execute(
        "UPDATE email_accounts SET email=?1, display_name=?2, username=?3, imap_host=?4,
         imap_port=?5, smtp_host=?6, smtp_port=?7, use_ssl=?8, updated_at=?9 WHERE id=?10",
        params![email, display_name, username, imap_host, imap_port, smtp_host, smtp_port,
                use_ssl as i64, chrono::Utc::now().to_rfc3339(), id],
    )?;
    Ok(())
}

pub fn delete_account_data(conn: &Connection, id: &str) -> MailResult<()> {
    conn.execute("DELETE FROM emails WHERE account_id = ?1", params![id])?;
    conn.execute("DELETE FROM email_folders WHERE account_id = ?1", params![id])?;
    conn.execute("DELETE FROM mail_sync_state WHERE account_id = ?1", params![id])?;
    conn.execute("DELETE FROM email_accounts WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn insert_account(conn: &Connection, account: &EmailAccount) -> MailResult<()> {
    conn.execute(
        "INSERT INTO email_accounts (id, email, display_name, username, credential_ref, imap_host, imap_port,
         smtp_host, smtp_port, use_ssl, auth_type, sync_enabled, sync_interval_mins, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        params![account.id, account.email, account.display_name, account.username,
                account.credential_ref, account.imap_host, account.imap_port,
                account.smtp_host, account.smtp_port, account.use_ssl as i64, account.auth_type,
                account.sync_enabled as i64, account.sync_interval_mins, account.created_at, account.updated_at],
    )?;
    Ok(())
}

pub fn insert_folder(conn: &Connection, folder: &EmailFolder) -> MailResult<()> {
    conn.execute(
        "INSERT INTO email_folders (id, account_id, name, imap_path, parent_path, is_system, folder_type,
         sort_order, unread_count, total_count, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![folder.id, folder.account_id, folder.name, folder.imap_path, folder.parent_path,
                folder.is_system as i64, folder.folder_type, folder.sort_order,
                folder.unread_count, folder.total_count, folder.created_at],
    )?;
    Ok(())
}

pub fn list_messages(conn: &Connection, folder_id: &str, limit: i64, offset: i64) -> MailResult<Vec<Email>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, a.email as account_email, a.display_name as account_name
         FROM emails e LEFT JOIN email_accounts a ON e.account_id = a.id
         WHERE e.folder_id = ?1 ORDER BY e.received_at DESC LIMIT ?2 OFFSET ?3"
    )?;
    let rows = stmt.query_map(params![folder_id, limit, offset], map_email)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

pub fn list_unified_inbox(conn: &Connection, limit: i64, offset: i64) -> MailResult<Vec<Email>> {
    let mut stmt = conn.prepare(
        "SELECT e.*, a.email as account_email, a.display_name as account_name
         FROM emails e
         JOIN email_folders f ON e.folder_id = f.id
         JOIN email_accounts a ON e.account_id = a.id
         WHERE f.folder_type = 'inbox'
         ORDER BY e.received_at DESC LIMIT ?1 OFFSET ?2"
    )?;
    let rows = stmt.query_map(params![limit, offset], map_email)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

pub fn unified_unread_count(conn: &Connection) -> MailResult<i64> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM emails e JOIN email_folders f ON e.folder_id = f.id
         WHERE f.folder_type = 'inbox' AND e.is_read = 0",
        [], |row| row.get(0)
    )?;
    Ok(count)
}

pub fn get_message(conn: &Connection, id: &str) -> MailResult<Email> {
    conn.query_row(
        "SELECT e.*, a.email as account_email, a.display_name as account_name
         FROM emails e LEFT JOIN email_accounts a ON e.account_id = a.id WHERE e.id = ?1",
        params![id], map_email
    ).map_err(MailError::from)
}

fn map_email(row: &rusqlite::Row) -> rusqlite::Result<Email> {
    Ok(Email {
        id: row.get("id")?, account_id: row.get("account_id")?, folder_id: row.get("folder_id")?,
        message_id: row.get("message_id")?, uid: row.get("uid")?,
        from_address: row.get("from_address")?, to_addresses: row.get("to_addresses")?,
        cc_addresses: row.get("cc_addresses")?, subject: row.get("subject")?,
        preview_text: row.get("preview_text")?, body_text: row.get("body_text")?,
        body_html: row.get("body_html")?, has_attachments: row.get::<_, i64>("has_attachments")? != 0,
        is_read: row.get::<_, i64>("is_read")? != 0, is_starred: row.get::<_, i64>("is_starred")? != 0,
        received_at: row.get("received_at")?, created_at: row.get("created_at")?,
        account_email: row.get("account_email")?, account_name: row.get("account_name")?,
    })
}

pub fn upsert_email(conn: &Connection, email: &Email) -> MailResult<()> {
    conn.execute(
        "INSERT INTO emails (id, account_id, folder_id, message_id, uid, from_address, to_addresses,
         cc_addresses, subject, preview_text, body_text, body_html, has_attachments, is_read, is_starred,
         received_at, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
         ON CONFLICT(account_id, message_id) DO UPDATE SET
         folder_id=excluded.folder_id, uid=excluded.uid, from_address=excluded.from_address,
         subject=excluded.subject, preview_text=excluded.preview_text, has_attachments=excluded.has_attachments,
         is_read=excluded.is_read, is_starred=excluded.is_starred, received_at=excluded.received_at",
        params![email.id, email.account_id, email.folder_id, email.message_id, email.uid,
                email.from_address, email.to_addresses, email.cc_addresses, email.subject,
                email.preview_text, email.body_text, email.body_html, email.has_attachments as i64,
                email.is_read as i64, email.is_starred as i64, email.received_at, email.created_at],
    )?;
    Ok(())
}

pub fn mark_read(conn: &Connection, id: &str, is_read: bool) -> MailResult<()> {
    conn.execute("UPDATE emails SET is_read = ?1, sync_state = 1 WHERE id = ?2",
        params![is_read as i64, id])?;
    Ok(())
}

/// 切换标星，返回切换后的状态（供 IMAP 回写方向判断）
pub fn toggle_star(conn: &Connection, id: &str) -> MailResult<bool> {
    let current: i64 = conn.query_row(
        "SELECT is_starred FROM emails WHERE id = ?1", params![id], |row| row.get(0)
    ).map_err(|_| MailError::new("NOT_FOUND", "邮件不存在"))?;
    let next = current == 0;
    conn.execute("UPDATE emails SET is_starred = ?1, sync_state = 1 WHERE id = ?2",
        params![next as i64, id])?;
    Ok(next)
}

pub fn delete_message(conn: &Connection, id: &str) -> MailResult<()> {
    conn.execute("DELETE FROM emails WHERE id = ?1", params![id])?;
    Ok(())
}

/// 文件夹未读数实时从 emails 表计算（email_folders.unread_count 列从不更新，不可信）
pub fn folder_unread_counts(conn: &Connection, account_id: Option<&str>) -> MailResult<Vec<(String, i64)>> {
    let (sql, with_param) = if account_id.is_some() {
        ("SELECT f.id, COUNT(e.id) FROM email_folders f
          JOIN emails e ON e.folder_id = f.id AND e.is_read = 0
          WHERE f.account_id = ?1 GROUP BY f.id", true)
    } else {
        ("SELECT f.id, COUNT(e.id) FROM email_folders f
          JOIN emails e ON e.folder_id = f.id AND e.is_read = 0
          GROUP BY f.id", false)
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = if with_param {
        stmt.query_map(params![account_id], map_folder_count)?
    } else {
        stmt.query_map([], map_folder_count)?
    };
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

fn map_folder_count(row: &rusqlite::Row) -> rusqlite::Result<(String, i64)> {
    Ok((row.get(0)?, row.get(1)?))
}

pub fn list_signatures(conn: &Connection) -> MailResult<Vec<EmailSignature>> {
    let mut stmt = conn.prepare("SELECT * FROM email_signatures ORDER BY is_default DESC, name")?;
    let rows = stmt.query_map([], |row| {
        Ok(EmailSignature {
            id: row.get("id")?, name: row.get("name")?, html: row.get("html")?,
            is_default: row.get::<_, i64>("is_default")? != 0,
            created_at: row.get("created_at")?, updated_at: row.get("updated_at")?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

pub fn save_signature(conn: &Connection, sig: &EmailSignature) -> MailResult<()> {
    conn.execute(
        "INSERT INTO email_signatures (id, name, html, is_default, created_at, updated_at, sync_modified_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, html=excluded.html,
         is_default=excluded.is_default, updated_at=excluded.updated_at",
        params![sig.id, sig.name, sig.html, sig.is_default as i64, sig.created_at, sig.updated_at, sig.updated_at],
    )?;
    if sig.is_default {
        conn.execute("UPDATE email_signatures SET is_default = 0 WHERE id != ?1", params![sig.id])?;
    }
    Ok(())
}

pub fn delete_signature(conn: &Connection, id: &str) -> MailResult<()> {
    conn.execute("DELETE FROM email_signatures WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn set_account_signature(conn: &Connection, account_id: &str, signature_id: Option<&str>,
    auto_new: Option<bool>, auto_reply: Option<bool>) -> MailResult<()> {
    conn.execute(
        "UPDATE email_accounts SET signature_id = ?1,
         signature_auto_append_new = COALESCE(?2, signature_auto_append_new),
         signature_auto_append_reply = COALESCE(?3, signature_auto_append_reply),
         updated_at = ?4 WHERE id = ?5",
        params![signature_id, auto_new.map(|b| b as i64), auto_reply.map(|b| b as i64),
                chrono::Utc::now().to_rfc3339(), account_id],
    )?;
    Ok(())
}

pub fn list_attachments(conn: &Connection, email_id: &str) -> MailResult<Vec<EmailAttachment>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM email_attachments WHERE email_id = ?1 ORDER BY created_at, rowid"
    )?;
    let rows = stmt.query_map(params![email_id], map_attachment)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

/// 某封邮件的附件列表（`list_attachments` 的别名，语义更明确）
pub fn list_attachments_for_email(conn: &Connection, email_id: &str) -> MailResult<Vec<EmailAttachment>> {
    list_attachments(conn, email_id)
}

fn map_attachment(row: &rusqlite::Row) -> rusqlite::Result<EmailAttachment> {
    Ok(EmailAttachment {
        id: row.get("id")?, email_id: row.get("email_id")?,
        filename: row.get("filename")?, mime_type: row.get("mime_type")?,
        size: row.get("size")?, file_path: row.get("file_path")?,
        is_inline: row.get::<_, i64>("is_inline")? != 0,
        content_id: row.get("content_id")?, part_id: row.get("part_id")?,
        pending_download: row.get::<_, i64>("pending_download")? != 0,
        created_at: row.get("created_at")?,
    })
}

pub fn insert_attachment(conn: &Connection, att: &EmailAttachment) -> MailResult<()> {
    conn.execute(
        "INSERT INTO email_attachments (id, email_id, filename, mime_type, size, file_path, is_inline, content_id, part_id, pending_download, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![att.id, att.email_id, att.filename, att.mime_type, att.size, att.file_path,
                att.is_inline as i64, att.content_id, att.part_id, att.pending_download as i64,
                att.created_at],
    )?;
    Ok(())
}

/// 按需下载完成后回写本地路径、实际大小并清除待下载标记
pub fn mark_attachment_downloaded(conn: &Connection, id: &str, file_path: &str, size: i64) -> MailResult<()> {
    conn.execute(
        "UPDATE email_attachments SET file_path = ?1, size = ?2, pending_download = 0 WHERE id = ?3",
        params![file_path, size, id],
    )?;
    Ok(())
}

/// 删除某封邮件的附件记录（磁盘文件由调用方清理），返回旧记录
pub fn delete_attachments_for_email(conn: &Connection, email_id: &str) -> MailResult<Vec<EmailAttachment>> {
    let old = list_attachments(conn, email_id)?;
    conn.execute("DELETE FROM email_attachments WHERE email_id = ?1", params![email_id])?;
    Ok(old)
}

pub fn get_attachment(conn: &Connection, id: &str) -> MailResult<EmailAttachment> {
    conn.query_row("SELECT * FROM email_attachments WHERE id = ?1", params![id], map_attachment)
        .map_err(|_| MailError::new("NOT_FOUND", "附件不存在"))
}

pub fn list_templates(conn: &Connection) -> MailResult<Vec<EmailTemplate>> {
    let mut stmt = conn.prepare("SELECT * FROM email_templates ORDER BY name")?;
    let rows = stmt.query_map([], |row| {
        Ok(EmailTemplate {
            id: row.get("id")?, name: row.get("name")?, subject: row.get("subject")?,
            body: row.get("body")?, created_at: row.get("created_at")?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

pub fn save_template(conn: &Connection, tpl: &EmailTemplate) -> MailResult<()> {
    // updated_at 用于云端 LWW 比较（EXCLUDED.updated_at > 本地），必须写入
    let updated = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO email_templates (id, name, subject, body, created_at, updated_at, sync_modified_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, subject=excluded.subject, body=excluded.body, updated_at=excluded.updated_at",
        params![tpl.id, tpl.name, tpl.subject, tpl.body, tpl.created_at, updated.clone(), updated],
    )?;
    Ok(())
}

pub fn delete_template(conn: &Connection, id: &str) -> MailResult<()> {
    conn.execute("DELETE FROM email_templates WHERE id = ?1", params![id])?;
    Ok(())
}

/// 邮件同步回写所需信息：account_id、folder_id、uid（可能缺失）
pub fn get_email_sync_info(conn: &Connection, id: &str) -> MailResult<(String, Option<String>, Option<i64>)> {
    conn.query_row(
        "SELECT account_id, folder_id, uid FROM emails WHERE id = ?1",
        params![id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| MailError::new("NOT_FOUND", "邮件不存在"))
}

/// FTS5 全文搜索：用户输入拆词后逐词双引号包裹再 AND 拼接，避免 MATCH 语法错误
pub fn search_messages(conn: &Connection, query: &str, limit: i64) -> MailResult<Vec<Email>> {
    let safe_query = query.split_whitespace()
        .filter(|w| !w.is_empty())
        .map(|w| format!("\"{}\"", w.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" AND ");
    if safe_query.is_empty() {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare(
        "SELECT e.*, a.email as account_email, a.display_name as account_name
         FROM emails_fts f
         JOIN emails e ON e.rowid = f.rowid
         LEFT JOIN email_accounts a ON e.account_id = a.id
         WHERE emails_fts MATCH ?1
         ORDER BY e.received_at DESC LIMIT ?2"
    )?;
    let rows = stmt.query_map(params![safe_query, limit], map_email)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}
