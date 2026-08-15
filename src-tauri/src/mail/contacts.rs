//! 联系人模块：DB CRUD + 分组管理 + VCF(vCard 3.0) 导入导出。
//! 说明：VCF 解析覆盖常见字段（FN/N/EMAIL/TEL/ORG/TITLE/NOTE），支持折行展开与
//! 反斜杠转义；不处理 quoted-printable 编码的属性值（手机导出多为 UTF-8 直写）。
use rusqlite::{Connection, params};
use crate::mail::error::{MailError, MailResult};
use crate::mail::types::*;

fn now() -> String { chrono::Utc::now().to_rfc3339() }

// ---------------------------------------------------------------------------
// DB CRUD
// ---------------------------------------------------------------------------

pub fn list_contacts(conn: &Connection, group_id: Option<&str>, query: Option<&str>) -> MailResult<Vec<Contact>> {
    let mut sql = "SELECT DISTINCT c.* FROM contacts c".to_string();
    let mut conditions: Vec<String> = Vec::new();
    if group_id.is_some() {
        sql.push_str(" JOIN contact_group_members m ON m.contact_id = c.id");
        conditions.push("m.group_id = ?1".to_string());
    }
    if let Some(q) = query {
        let q = q.trim();
        if !q.is_empty() {
            conditions.push("(c.name LIKE ?2 OR c.emails LIKE ?2 OR c.company LIKE ?2)".to_string());
        }
    }
    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }
    sql.push_str(" ORDER BY c.name COLLATE NOCASE");

    let mut stmt = conn.prepare(&sql)?;
    let like = query.map(|q| format!("%{}%", q.trim()));
    let rows = match (group_id, like.as_deref()) {
        (Some(g), Some(q)) => stmt.query_map(params![g, q], map_contact)?,
        (Some(g), None) => stmt.query_map(params![g], map_contact)?,
        (None, Some(q)) => stmt.query_map(params!["" as &str, q], map_contact)?,
        (None, None) => stmt.query_map([], map_contact)?,
    };
    let mut contacts: Vec<Contact> = rows.collect::<Result<Vec<_>, _>>()?;
    for c in &mut contacts {
        c.group_ids = contact_group_ids(conn, &c.id)?;
    }
    Ok(contacts)
}

fn map_contact(row: &rusqlite::Row) -> rusqlite::Result<Contact> {
    let emails_json: String = row.get("emails")?;
    let phones_json: String = row.get("phones")?;
    Ok(Contact {
        id: row.get("id")?,
        name: row.get("name")?,
        emails: serde_json::from_str(&emails_json).unwrap_or_default(),
        phones: serde_json::from_str(&phones_json).unwrap_or_default(),
        company: row.get("company")?,
        title: row.get("title")?,
        notes: row.get("notes")?,
        group_ids: Vec::new(),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn contact_group_ids(conn: &Connection, contact_id: &str) -> MailResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT group_id FROM contact_group_members WHERE contact_id = ?1")?;
    let rows = stmt.query_map(params![contact_id], |row| row.get(0))?;
    Ok(rows.collect::<Result<Vec<String>, _>>()?)
}

pub fn save_contact(conn: &Connection, contact: &Contact) -> MailResult<()> {
    let emails_json = serde_json::to_string(&contact.emails).unwrap_or_else(|_| "[]".into());
    let phones_json = serde_json::to_string(&contact.phones).unwrap_or_else(|_| "[]".into());
    // sync_modified_at 显式写入（列无 DEFAULT，否则新行 NULL 永远被上传查询选中）
    let ts = now();
    conn.execute(
        "INSERT INTO contacts (id, name, emails, phones, company, title, notes, created_at, updated_at, sync_modified_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, emails=excluded.emails, phones=excluded.phones,
         company=excluded.company, title=excluded.title, notes=excluded.notes, updated_at=excluded.updated_at",
        params![contact.id, contact.name, emails_json, phones_json, contact.company, contact.title,
                contact.notes, contact.created_at, contact.updated_at, ts],
    )?;
    // 全量替换分组关系
    conn.execute("DELETE FROM contact_group_members WHERE contact_id = ?1", params![contact.id])?;
    for gid in &contact.group_ids {
        conn.execute("INSERT OR IGNORE INTO contact_group_members (contact_id, group_id, sync_modified_at) VALUES (?1, ?2, ?3)",
            params![contact.id, gid, ts])?;
    }
    Ok(())
}

pub fn delete_contact(conn: &Connection, id: &str) -> MailResult<()> {
    conn.execute("DELETE FROM contact_group_members WHERE contact_id = ?1", params![id])?;
    conn.execute("DELETE FROM contacts WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_groups(conn: &Connection) -> MailResult<Vec<ContactGroup>> {
    let mut stmt = conn.prepare(
        "SELECT g.*, (SELECT COUNT(*) FROM contact_group_members m WHERE m.group_id = g.id) AS member_count
         FROM contact_groups g ORDER BY g.sort_order, g.name"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ContactGroup {
            id: row.get("id")?, name: row.get("name")?, sort_order: row.get("sort_order")?,
            member_count: row.get("member_count")?,
            created_at: row.get("created_at")?, updated_at: row.get("updated_at")?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(MailError::from)
}

pub fn save_group(conn: &Connection, group: &ContactGroup) -> MailResult<()> {
    conn.execute(
        "INSERT INTO contact_groups (id, name, sort_order, created_at, updated_at, sync_modified_at)
         VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, sort_order=excluded.sort_order, updated_at=excluded.updated_at",
        params![group.id, group.name, group.sort_order, group.created_at, group.updated_at, now()],
    )?;
    Ok(())
}

pub fn delete_group(conn: &Connection, id: &str) -> MailResult<()> {
    conn.execute("DELETE FROM contact_group_members WHERE group_id = ?1", params![id])?;
    conn.execute("DELETE FROM contact_groups WHERE id = ?1", params![id])?;
    Ok(())
}

// ---------------------------------------------------------------------------
// VCF 导入导出
// ---------------------------------------------------------------------------

fn vcf_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace(';', "\\;").replace(',', "\\,").replace('\n', "\\n")
}

fn vcf_unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') | Some('N') => out.push('\n'),
                Some(other) => out.push(other),
                None => out.push('\\'),
            }
        } else {
            out.push(c);
        }
    }
    out
}

/// VCF 折行展开：以空格/制表符开头的行是上一行的延续
fn unfold_lines(text: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw in text.lines() {
        if (raw.starts_with(' ') || raw.starts_with('\t')) && !lines.is_empty() {
            let cont = raw[1..].trim_end_matches(['\r', '\n']);
            if let Some(last) = lines.last_mut() {
                last.push_str(cont);
            }
        } else {
            let l = raw.trim_end_matches('\r');
            if !l.trim().is_empty() {
                lines.push(l.to_string());
            }
        }
    }
    lines
}

pub fn export_vcf(conn: &Connection, group_id: Option<&str>) -> MailResult<String> {
    let contacts = list_contacts(conn, group_id, None)?;
    let mut out = String::new();
    for c in contacts {
        out.push_str("BEGIN:VCARD\r\nVERSION:3.0\r\n");
        out.push_str(&format!("FN:{}\r\n", vcf_escape(&c.name)));
        // N: 姓;名;;; —— 无法可靠拆分时整体放名
        let parts: Vec<&str> = c.name.splitn(2, ' ').collect();
        if parts.len() == 2 {
            out.push_str(&format!("N:{};{};;;\r\n", vcf_escape(parts[1]), vcf_escape(parts[0])));
        } else {
            out.push_str(&format!("N:{};;;;\r\n", vcf_escape(&c.name)));
        }
        for e in &c.emails {
            out.push_str(&format!("EMAIL;TYPE=INTERNET:{}\r\n", vcf_escape(e)));
        }
        for p in &c.phones {
            out.push_str(&format!("TEL:{}\r\n", vcf_escape(p)));
        }
        if let Some(org) = &c.company {
            out.push_str(&format!("ORG:{}\r\n", vcf_escape(org)));
        }
        if let Some(t) = &c.title {
            out.push_str(&format!("TITLE:{}\r\n", vcf_escape(t)));
        }
        if let Some(n) = &c.notes {
            out.push_str(&format!("NOTE:{}\r\n", vcf_escape(n)));
        }
        out.push_str("END:VCARD\r\n");
    }
    Ok(out)
}

pub fn import_vcf(conn: &Connection, text: &str) -> MailResult<i64> {
    let lines = unfold_lines(text);
    let mut count = 0i64;
    let mut current: Option<Contact> = None;

    let flush = |conn: &Connection, c: &mut Option<Contact>, count: &mut i64| -> MailResult<()> {
        if let Some(mut contact) = c.take() {
            if contact.name.trim().is_empty() {
                contact.name = contact.emails.first().cloned().unwrap_or_else(|| "未命名".into());
            }
            save_contact(conn, &contact)?;
            *count += 1;
        }
        Ok(())
    };

    for line in &lines {
        if line.eq_ignore_ascii_case("BEGIN:VCARD") {
            let ts = now();
            current = Some(Contact {
                id: uuid::Uuid::new_v4().to_string(), name: String::new(),
                emails: Vec::new(), phones: Vec::new(), company: None, title: None,
                notes: None, group_ids: Vec::new(), created_at: ts.clone(), updated_at: ts,
            });
            continue;
        }
        if line.eq_ignore_ascii_case("END:VCARD") {
            flush(conn, &mut current, &mut count)?;
            continue;
        }
        let Some(contact) = current.as_mut() else { continue };
        // 属性行：NAME;PARAM=xxx:value
        let Some(colon) = line.find(':') else { continue };
        let (head, value) = line.split_at(colon);
        let value = &value[1..];
        let prop = head.split(';').next().unwrap_or("").to_ascii_uppercase();
        match prop.as_str() {
            "FN" => contact.name = vcf_unescape(value).trim().to_string(),
            "N" => {
                if contact.name.is_empty() {
                    // N: 姓;名;中间名;前缀;后缀
                    let parts: Vec<String> = value.split(';').map(vcf_unescape).collect();
                    let family = parts.first().cloned().unwrap_or_default();
                    let given = parts.get(1).cloned().unwrap_or_default();
                    contact.name = format!("{}{}", family, given).trim().to_string();
                }
            }
            "EMAIL" => {
                let v = vcf_unescape(value).trim().to_string();
                if !v.is_empty() && !contact.emails.contains(&v) { contact.emails.push(v); }
            }
            "TEL" => {
                let v = vcf_unescape(value).trim().to_string();
                if !v.is_empty() && !contact.phones.contains(&v) { contact.phones.push(v); }
            }
            "ORG" => {
                let v = vcf_unescape(value).trim().trim_end_matches(';').to_string();
                if !v.is_empty() { contact.company = Some(v); }
            }
            "TITLE" => {
                let v = vcf_unescape(value).trim().to_string();
                if !v.is_empty() { contact.title = Some(v); }
            }
            "NOTE" => {
                let v = vcf_unescape(value).trim().to_string();
                if !v.is_empty() { contact.notes = Some(v); }
            }
            _ => {}
        }
    }
    flush(conn, &mut current, &mut count)?;
    Ok(count)
}
