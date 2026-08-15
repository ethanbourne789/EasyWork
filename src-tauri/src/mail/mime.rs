use mail_parser::MessageParser;
use crate::mail::error::{MailError, MailResult};

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
        .or_else(|| body_html.as_ref().map(|h| h.chars().take(200).collect()));

    // attachments() returns an iterator over MessagePart; non-empty means attachments exist
    let has_attachments = parsed.attachments().next().is_some();

    Ok(ParsedMail {
        subject: parsed.subject().map(|s| s.to_string()),
        from_address,
        to_addresses,
        cc_addresses,
        body_text,
        body_html,
        preview_text,
        message_id: parsed.message_id().map(|s| s.to_string()),
        has_attachments,
    })
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
