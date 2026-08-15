use mail_parser::{MessageParser, MimeHeaders};
use crate::mail::error::{MailError, MailResult};

/// 附件实体（含内联图片）：由 do_sync 落盘到 attachments_dir 并写入 email_attachments 表
pub struct ParsedAttachment {
    pub filename: Option<String>,
    pub mime_type: Option<String>,
    pub size: usize,
    pub is_inline: bool,
    pub content_id: Option<String>,
    pub data: Vec<u8>,
}

pub struct ParsedMail {
    pub subject: Option<String>,
    pub from_address: Option<String>,
    pub to_addresses: Vec<String>,
    pub cc_addresses: Vec<String>,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub preview_text: Option<String>,
    pub message_id: Option<String>,
    pub has_attachments: bool,
    pub attachments: Vec<ParsedAttachment>,
    /// 邮件 Date 头（RFC3339），缺失时为 None，调用方回退到当前时间
    pub date: Option<String>,
}

pub fn parse_message(raw: &[u8]) -> MailResult<ParsedMail> {
    let parsed = MessageParser::default()
        .parse(raw)
        .ok_or_else(|| MailError::new("PARSE_ERROR", "无法解析邮件"))?;

    // mail-parser 0.11: from()/to()/cc() return Option<&Address>, Address.first() returns Option<&Addr>
    let from_address = parsed
        .from()
        .and_then(|a| a.first())
        .and_then(|addr| addr.address())
        .map(|s| s.to_string());

    // Address.iter() yields &Addr, Addr.address() returns Option<&str>
    let to_addresses: Vec<String> = parsed
        .to()
        .map(|a| {
            a.iter()
                .filter_map(|addr| addr.address().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let cc_addresses: Vec<String> = parsed
        .cc()
        .map(|a| {
            a.iter()
                .filter_map(|addr| addr.address().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let body_text = parsed.body_text(0).map(|s| s.to_string());
    let body_html = parsed.body_html(0).map(|s| s.to_string());

    let preview_text = body_text
        .as_ref()
        .map(|t| t.chars().take(200).collect())
        .or_else(|| body_html.as_ref().map(|h| html_to_text(h).chars().take(200).collect()));

    // 提取附件实体（含内联图片）。attachment 迭代器覆盖非 text/html 的 part。
    let mut attachments: Vec<ParsedAttachment> = Vec::new();
    for part in parsed.attachments() {
        let data = part.contents();
        if data.is_empty() {
            continue;
        }
        let is_inline = part.content_disposition().map(|d| d.is_inline()).unwrap_or(false);
        // 文件名优先级：Content-Disposition filename > Content-Type name
        let filename = part
            .content_disposition()
            .and_then(|d| d.attribute("filename"))
            .or_else(|| part.content_type().and_then(|t| t.attribute("name")))
            .map(|s| s.to_string())
            .filter(|s| !s.trim().is_empty());
        let mime_type = part.content_type().map(|t| {
            format!("{}/{}", t.ctype(), t.subtype().unwrap_or("octet-stream"))
        });
        let content_id = part.content_id().map(|s| s.to_string());
        attachments.push(ParsedAttachment {
            filename,
            mime_type,
            size: data.len(),
            is_inline,
            content_id,
            data: data.to_vec(),
        });
    }

    Ok(ParsedMail {
        subject: parsed.subject().map(|s| s.to_string()),
        from_address,
        to_addresses,
        cc_addresses,
        body_text,
        body_html,
        preview_text,
        message_id: parsed.message_id().map(|s| s.to_string()),
        has_attachments: !attachments.is_empty(),
        attachments,
        date: parsed.date().map(|d| d.to_rfc3339()),
    })
}

/// 去 HTML 标签 + 压缩空白：body_text 缺失时用于生成预览文本
fn html_to_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn sanitize_html(html: &str) -> String {
    // 后端不再用 ammonia 做 HTML 清理：ammonia 4 对某些正常 HTML（实测 QQ 邮件 3KB）
    // 会卡死/死循环，导致 do_sync 卡在第一封邮件、同步锁永不释放。
    // 前端 MailReader 渲染时已用 DOMPurify 做 sanitize，这里仅做长度上限防存储膨胀。
    const MAX_HTML: usize = 512 * 1024;
    if html.len() > MAX_HTML {
        return String::new(); // 超限丢弃 HTML，仅保留纯文本
    }
    html.to_string()
}

pub fn infer_folder_type(imap_path: &str, flags: &[String]) -> &'static str {
    let path_upper = imap_path.to_uppercase();
    if flags.iter().any(|f| f.to_uppercase().contains("INBOX")) || path_upper == "INBOX" {
        return "inbox";
    }
    match path_upper.as_str() {
        "SENT" | "SENT ITEMS" | "SENT MESSAGES" | "已发送" => "sent",
        "DRAFTS" | "DRAFT" | "草稿" | "草稿箱" => "drafts",
        "TRASH" | "DELETED" | "DELETED ITEMS" | "已删除" | "垃圾箱" => "trash",
        "JUNK" | "SPAM" | "JUNK EMAIL" | "垃圾邮件" => "spam",
        _ => "other",
    }
}

pub fn folder_display_name(imap_path: &str, folder_type: &str) -> String {
    let mapping: &[(&str, &str)] = &[
        ("INBOX", "收件箱"),
        ("SENT", "已发送"),
        ("SENT ITEMS", "已发送"),
        ("SENT MESSAGES", "已发送"),
        ("DRAFTS", "草稿箱"),
        ("DRAFT", "草稿箱"),
        ("TRASH", "已删除"),
        ("DELETED", "已删除"),
        ("JUNK", "垃圾邮件"),
        ("SPAM", "垃圾邮件"),
    ];
    let path_upper = imap_path.to_uppercase();
    for (key, name) in mapping {
        if path_upper == *key {
            return name.to_string();
        }
    }
    if folder_type == "inbox" {
        return "收件箱".to_string();
    }
    imap_path.to_string()
}
