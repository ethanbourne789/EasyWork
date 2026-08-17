use rusqlite::Connection;
use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::Mutex;
use tauri::AppHandle;
use crate::mail::creds::CredentialStore;
use crate::mail::db_queries;
use crate::mail::events::emit_progress;
use crate::mail::imap::{ImapAdapter, calc_fetch_range};
use crate::mail::mime::{parse_message_lazy_from_sections, find_html_part_id, infer_folder_type, folder_display_name, sanitize_html};
use crate::mail::types::*;
use crate::mail::error::{MailError, MailResult};

/// 比较 IMAP flag 是否与目标语义匹配（忽略大小写与标准反斜杠前缀）。
fn imap_flag_eq(flag: &str, target: &str) -> bool {
    flag.trim_start_matches('\\').eq_ignore_ascii_case(target)
}

pub struct MailService {
    pub db: Arc<Mutex<Connection>>,
    pub attachments_dir: Box<Path>,
    /// 每账号同步互斥锁（std Mutex：临界区极短，且可在 Drop 中安全复位）
    pub locks: Arc<StdMutex<HashSet<String>>>,
}

/// RAII 同步锁守卫：无论正常结束还是 panic，Drop 时都会释放锁，
/// 避免旧实现中 do_sync panic 导致锁永久卡死的问题。
struct SyncGuard {
    locks: Arc<StdMutex<HashSet<String>>>,
    key: String,
}

impl Drop for SyncGuard {
    fn drop(&mut self) {
        if let Ok(mut set) = self.locks.lock() {
            set.remove(&self.key);
        }
    }
}

impl MailService {
    pub async fn sync_account(&self, app: &AppHandle, account_id: &str) -> MailResult<SyncResult> {
        let lock_key = account_id.to_string();
        {
            let mut set = self.locks.lock().map_err(|_| MailError::new("LOCK", "同步锁状态异常"))?;
            if !set.insert(lock_key.clone()) {
                return Ok(SyncResult { fetched: 0, inserted: 0, folders: 0, error: Some("该账号同步进行中，请稍后再试".into()) });
            }
        }
        let _guard = SyncGuard { locks: self.locks.clone(), key: lock_key };

        let result = self.do_sync(app, account_id).await;
        if let Err(e) = &result {
            emit_progress(app, SyncProgress::Error { account_id: account_id.into(), message: e.message.clone() });
        }
        result
    }

    async fn do_sync(&self, app: &AppHandle, account_id: &str) -> MailResult<SyncResult> {
        emit_progress(app, SyncProgress::Connecting { account_id: account_id.into() });

        let account = {
            let db = self.db.lock().await;
            db_queries::get_account(&db, account_id)?
        };
        let password = CredentialStore::get_password(account_id)?;
        let username = account.username.as_deref().unwrap_or(&account.email);

        let mut imap = ImapAdapter::connect(&account.imap_host, account.imap_port as u16, username, &password).await?;

        let folders = imap.list_folders().await?;
        tracing::debug!("[do_sync] account={} folders={:?}", account.email, folders.iter().map(|(p,_)| p).collect::<Vec<_>>());
        let mut fetched = 0i64;
        let mut inserted = 0i64;
        // 聚合各文件夹的非致命错误（select/fetch 失败），最终透传给前端，
        // 避免"拉到 0 封但 error=null"的假象
        let mut folder_errors: Vec<String> = Vec::new();

        for (path, flags) in &folders {
            let folder_type = infer_folder_type(path, flags);
            let display_name = folder_display_name(path, folder_type);

            let folder_id = {
                let db = self.db.lock().await;
                ensure_folder(&db, account_id, path, &display_name, folder_type)?
            };

            match imap.select_folder(path).await {
                Ok((uid_next, uid_validity)) => {
                    let last_uid = {
                        let db = self.db.lock().await;
                        get_folder_last_uid(&db, &folder_id)?
                    };
                    let (start, end) = calc_fetch_range(last_uid, uid_next);
                    tracing::debug!("[do_sync] folder={} last_uid={:?} range={}..{}", path, last_uid, start, end);

                    if start <= end {
                        let messages = match imap.fetch_range_lazy(start, end).await {
                            Ok(m) => m,
                            Err(e) => {
                                folder_errors.push(format!("{}: {}", display_name, e.message));
                                continue;
                            }
                        };
                        let total = messages.len() as i64;

                        // 阶段一：在 async 锁外完成解析，避免同步 IO 阻塞其他邮件命令。
                        // 懒同步：仅拉取 HEADER + BODY.PEEK[TEXT]，不拉取任何附件字节。
                        // 所有附件均标记 pending_download=1，用户点击附件时再从 IMAP 按需拉取
                        //（见 commands::email_attachment_download）。
                        // 随后按需补充拉取 HTML 正文（text/html part），不拉取附件 body。
                        let _ = std::fs::create_dir_all(&*self.attachments_dir);
                        let mut parsed_batch: Vec<(crate::mail::mime::ParsedMail, u32, Vec<String>, Option<String>)> = Vec::with_capacity(messages.len());
                        let mut html_fetches: Vec<(u32, String, usize)> = Vec::new();
                        for (uid, header, body_text, msg_flags) in messages {
                            let parsed = match parse_message_lazy_from_sections(&header, body_text) {
                                Ok(p) => p,
                                Err(e) => {
                                    tracing::warn!("[do_sync] 跳过无法解析的邮件 folder={} uid={} err={}", path, uid, e.message);
                                    continue;
                                }
                            };
                            // 从 MIME 树中查找 text/html part，标记为待拉取
                            let html_part_id = find_html_part_id(&parsed);
                            if let Some(ref pid) = html_part_id {
                                html_fetches.push((uid, pid.clone(), parsed_batch.len()));
                            }
                            parsed_batch.push((parsed, uid, msg_flags, html_part_id));
                        }
                        // 阶段一补：按需拉取 HTML 正文（仅 text/html part，不拉附件 body）
                        let mut html_cache: Vec<Option<String>> = vec![None; parsed_batch.len()];
                        for (uid, pid, slot) in html_fetches {
                            match imap.fetch_html_body(uid, &pid).await {
                                Ok(Some(raw)) => {
                                    let decoded = match String::from_utf8(raw) {
                                        Ok(s) => s,
                                        Err(_) => continue,
                                    };
                                    html_cache[slot] = Some(sanitize_html(&decoded));
                                }
                                Ok(None) => {}
                                Err(e) => {
                                    tracing::debug!("[do_sync] HTML 拉取跳过 folder={} uid={} err={}", path, uid, e.message);
                                }
                            }
                        }
                        // 阶段一末：组装 Email 与 Attachment 记录
                        let mut prepared: Vec<(Email, Vec<EmailAttachment>)> = Vec::with_capacity(parsed_batch.len());
                        for (original_idx, (parsed, uid, msg_flags, _html_part_id)) in parsed_batch.into_iter().enumerate() {
                            // IMAP 标准 flag 形如 \Seen、\Flagged；做大小写不敏感、忽略反斜杠前缀的精确匹配
                            let is_read = msg_flags.iter().any(|f| imap_flag_eq(f, "Seen"));
                            let is_starred = msg_flags.iter().any(|f| imap_flag_eq(f, "Flagged"));

                            let email = Email {
                                id: uuid::Uuid::new_v4().to_string(),
                                account_id: account_id.into(),
                                folder_id: Some(folder_id.clone()),
                                message_id: parsed.message_id.clone(),
                                uid: Some(uid as i64),
                                from_address: parsed.from_address.clone(),
                                to_addresses: Some(serde_json::to_string(&parsed.to_addresses).unwrap_or_default()),
                                cc_addresses: Some(serde_json::to_string(&parsed.cc_addresses).unwrap_or_default()),
                                subject: parsed.subject.clone(),
                                preview_text: parsed.preview_text.clone(),
                                body_text: parsed.body_text.clone(),
                                body_html: html_cache[original_idx].clone(),
                                has_attachments: parsed.has_attachments,
                                is_read, is_starred,
                                // 使用邮件 Date 头作为接收时间，缺失才回退到同步时刻
                                received_at: parsed.date.clone().or_else(|| Some(chrono::Utc::now().to_rfc3339())),
                                created_at: chrono::Utc::now().to_rfc3339(),
                                account_email: Some(account.email.clone()),
                                account_name: account.display_name.clone(),
                            };

                            let mut atts = Vec::new();
                            for (att_idx, att) in parsed.attachments.into_iter().enumerate() {
                                let _ = att_idx;
                                atts.push(EmailAttachment {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    email_id: email.id.clone(),
                                    filename: att.filename,
                                    mime_type: att.mime_type,
                                    size: Some(att.size as i64),
                                    file_path: String::new(),
                                    is_inline: att.is_inline,
                                    content_id: att.content_id,
                                    part_id: att.part_id,
                                    pending_download: true,
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                });
                            }
                            prepared.push((email, atts));
                        }

                        // 阶段二：单事务批量写入 SQLite，把每封邮件的多次持锁压缩为一次。
                        let mut old_attachments: Vec<EmailAttachment> = Vec::new();
                        {
                            let db = self.db.lock().await;
                            let tx = db.unchecked_transaction()?;
                            for (email, atts) in &prepared {
                                db_queries::upsert_email(&tx, email)?;
                                let old = db_queries::delete_attachments_for_email(&tx, &email.id)?;
                                old_attachments.extend(old);
                                for att in atts {
                                    db_queries::insert_attachment(&tx, att)?;
                                }
                            }
                            update_folder_cursor(&tx, account_id, &folder_id, end, uid_validity)?;
                            tx.commit()?;
                        }
                        // 锁外清理旧附件文件，避免 IO 阻塞其他邮件命令。
                        for old in old_attachments {
                            let _ = std::fs::remove_file(&old.file_path);
                        }

                        let done = prepared.len() as i64;
                        inserted += done;
                        fetched += total;
                        emit_progress(app, SyncProgress::Folder {
                            account_id: account_id.into(), path: path.clone(), done, total
                        });
                    }
                }
                Err(e) => {
                    tracing::warn!("[do_sync] select 失败 folder={} err={}", path, e.message);
                    folder_errors.push(format!("{}: {}", display_name, e.message));
                }
            }
        }

        emit_progress(app, SyncProgress::Done {
            account_id: account_id.into(), fetched, inserted
        });

        Ok(SyncResult {
            fetched,
            inserted,
            folders: folders.len() as i64,
            error: if folder_errors.is_empty() { None } else { Some(folder_errors.join("；")) },
        })
    }

    pub async fn create_folder(&self, account_id: &str, name: &str) -> MailResult<EmailFolder> {
        let account = {
            let db = self.db.lock().await;
            db_queries::get_account(&db, account_id)?
        };
        let password = CredentialStore::get_password(account_id)?;
        let username = account.username.as_deref().unwrap_or(&account.email);
        let mut imap = ImapAdapter::connect(&account.imap_host, account.imap_port as u16, username, &password).await?;

        imap.create_mailbox(name).await?;

        let folder = EmailFolder {
            id: uuid::Uuid::new_v4().to_string(),
            account_id: account_id.into(),
            name: name.into(),
            imap_path: name.into(),
            parent_path: None,
            is_system: false,
            folder_type: "other".into(),
            sort_order: 0,
            unread_count: 0,
            total_count: 0,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let db = self.db.lock().await;
        db_queries::insert_folder(&db, &folder)?;
        Ok(folder)
    }

    pub async fn rename_folder(&self, folder_id: &str, new_name: &str) -> MailResult<EmailFolder> {
        let folder = {
            let db = self.db.lock().await;
            let f: Option<EmailFolder> = db.query_row(
                "SELECT * FROM email_folders WHERE id = ?1",
                rusqlite::params![folder_id], |row| {
                    Ok(EmailFolder {
                        id: row.get("id")?, account_id: row.get("account_id")?, name: row.get("name")?,
                        imap_path: row.get("imap_path")?, parent_path: row.get("parent_path")?,
                        is_system: row.get::<_, i64>("is_system")? != 0, folder_type: row.get("folder_type")?,
                        sort_order: row.get("sort_order")?, unread_count: row.get("unread_count")?,
                        total_count: row.get("total_count")?, created_at: row.get("created_at")?,
                    })
                }
            ).ok();
            f
        };
        let folder = folder.ok_or_else(|| MailError::new("NOT_FOUND", "文件夹不存在"))?;
        if folder.is_system {
            return Err(MailError::new("FORBIDDEN", "系统文件夹不可重命名"));
        }

        let account = {
            let db = self.db.lock().await;
            db_queries::get_account(&db, &folder.account_id)?
        };
        let password = CredentialStore::get_password(&folder.account_id)?;
        let username = account.username.as_deref().unwrap_or(&account.email);
        let mut imap = ImapAdapter::connect(&account.imap_host, account.imap_port as u16, username, &password).await?;

        imap.rename_mailbox(&folder.imap_path, new_name).await?;

        let db = self.db.lock().await;
        db.execute("UPDATE email_folders SET name = ?1, imap_path = ?2 WHERE id = ?3",
            rusqlite::params![new_name, new_name, folder_id])?;

        let mut updated = folder;
        updated.name = new_name.into();
        updated.imap_path = new_name.into();
        Ok(updated)
    }

    pub async fn delete_folder(&self, folder_id: &str) -> MailResult<()> {
        let folder = {
            let db = self.db.lock().await;
            let f: Option<EmailFolder> = db.query_row(
                "SELECT * FROM email_folders WHERE id = ?1",
                rusqlite::params![folder_id], |row| {
                    Ok(EmailFolder {
                        id: row.get("id")?, account_id: row.get("account_id")?, name: row.get("name")?,
                        imap_path: row.get("imap_path")?, parent_path: row.get("parent_path")?,
                        is_system: row.get::<_, i64>("is_system")? != 0, folder_type: row.get("folder_type")?,
                        sort_order: row.get("sort_order")?, unread_count: row.get("unread_count")?,
                        total_count: row.get("total_count")?, created_at: row.get("created_at")?,
                    })
                }
            ).ok();
            f
        };
        let folder = folder.ok_or_else(|| MailError::new("NOT_FOUND", "文件夹不存在"))?;
        if folder.is_system {
            return Err(MailError::new("FORBIDDEN", "系统文件夹不可删除"));
        }

        let db = self.db.lock().await;
        db.execute("DELETE FROM emails WHERE folder_id = ?1", rusqlite::params![folder_id])?;
        db.execute("DELETE FROM email_folders WHERE id = ?1", rusqlite::params![folder_id])?;
        let account = db_queries::get_account(&db, &folder.account_id)?;
        drop(db);

        let password = CredentialStore::get_password(&folder.account_id)?;
        let username = account.username.as_deref().unwrap_or(&account.email);
        let mut imap = ImapAdapter::connect(&account.imap_host, account.imap_port as u16, username, &password).await?;
        let _ = imap.delete_mailbox(&folder.imap_path).await; // 失败仅告警
        Ok(())
    }
}

fn ensure_folder(conn: &Connection, account_id: &str, imap_path: &str, name: &str, folder_type: &str) -> MailResult<String> {
    let existing: Option<String> = conn.query_row(
        "SELECT id FROM email_folders WHERE account_id = ?1 AND imap_path = ?2",
        rusqlite::params![account_id, imap_path],
        |row| row.get(0)
    ).ok();
    if let Some(id) = existing { return Ok(id); }
    let id = uuid::Uuid::new_v4().to_string();
    let is_system = matches!(folder_type, "inbox" | "sent" | "drafts" | "trash" | "spam");
    db_queries::insert_folder(conn, &EmailFolder {
        id: id.clone(), account_id: account_id.into(), name: name.into(),
        imap_path: imap_path.into(), parent_path: None, is_system,
        folder_type: folder_type.into(), sort_order: 0, unread_count: 0, total_count: 0,
        created_at: chrono::Utc::now().to_rfc3339(),
    })?;
    Ok(id)
}

fn get_folder_last_uid(conn: &Connection, folder_id: &str) -> MailResult<Option<u32>> {
    let uid: Option<i64> = conn.query_row(
        "SELECT last_uid FROM mail_sync_state WHERE folder_id = ?1",
        rusqlite::params![folder_id], |row| row.get(0)
    ).ok();
    Ok(uid.map(|u| u as u32))
}

fn update_folder_cursor(conn: &Connection, account_id: &str, folder_id: &str, last_uid: u32, uid_validity: u32) -> MailResult<()> {
    conn.execute(
        "INSERT INTO mail_sync_state (account_id, folder_id, last_uid, uid_validity, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(account_id, folder_id) DO UPDATE SET last_uid=excluded.last_uid, uid_validity=excluded.uid_validity, updated_at=excluded.updated_at",
        rusqlite::params![account_id, folder_id, last_uid as i64, uid_validity as i64, chrono::Utc::now().to_rfc3339()],
    )?;
    Ok(())
}
