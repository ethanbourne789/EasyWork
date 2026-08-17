use std::collections::HashMap;
use mail_parser::{MessageParser, MessagePart, MimeHeaders, PartType};
use crate::mail::error::{MailError, MailResult};
use crate::mail::imap::FetchedPart;

/// 附件实体（含内联图片）：由 do_sync 落盘到 attachments_dir 并写入 email_attachments 表
pub struct ParsedAttachment {
    pub filename: Option<String>,
    pub mime_type: Option<String>,
    pub size: usize,
    pub is_inline: bool,
    pub content_id: Option<String>,
    pub data: Vec<u8>,
    /// 超过大小阈值、未保留原始字节；用户打开邮件时需按需从 IMAP 拉取
    pub needs_download: bool,
    /// MIME part 编号（如 "1.2"），用于 IMAP BODY.PEEK[{part_id}] 按需拉取；
    /// 无法确定时为 None（调用方回退整封拉取）
    pub part_id: Option<String>,
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
    /// MIME 树中 text/html part 的 IMAP part 编号（如 "2.1"），供按需拉取 HTML 正文使用
    pub html_part_id: Option<String>,
}

pub fn parse_message(raw: &[u8]) -> MailResult<ParsedMail> {
    parse_message_inner(raw, None)
}

/// 懒解析：附件超过 max_attach_bytes 时仅保留元数据，data 置空并标记 needs_download。
/// 小附件行为与 parse_message 完全一致。
pub fn parse_message_lazy(raw: &[u8], max_attach_bytes: usize) -> MailResult<ParsedMail> {
    parse_message_inner(raw, Some(max_attach_bytes))
}

/// 完全懒解析：仅基于 IMAP 拉取的 HEADER 字节与 BODY.PEEK[TEXT] 构建邮件数据。
/// 不拉取任何附件字节（包括小附件），所有附件均标记 needs_download=true。
/// body_html 在此模式下为空（调用方需通过 fetch_html_body 按需拉取）。
pub fn parse_message_lazy_from_sections(header: &[u8], body_text: Option<Vec<u8>>) -> MailResult<ParsedMail> {
    let parsed = MessageParser::default()
        .parse(header)
        .ok_or_else(|| MailError::new("PARSE_ERROR", "无法解析邮件头"))?;

    let from_address = parsed
        .from()
        .and_then(|a| a.first())
        .and_then(|addr| addr.address())
        .map(|s| s.to_string());

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

    let bt = body_text
        .as_ref()
        .and_then(|b| String::from_utf8(b.clone()).ok())
        .or_else(|| parsed.body_text(0).map(|s| s.to_string()));

    let preview_text = bt
        .as_ref()
        .map(|t| t.chars().take(200).collect());

    let part_paths = compute_part_paths(&parsed.parts);
    let html_part_id = find_html_part_in_tree(&parsed.parts, &part_paths);
    let mut attachments: Vec<ParsedAttachment> = Vec::new();
    for &att_id in &parsed.attachments {
        let Some(part) = parsed.part(att_id) else { continue };
        let is_inline = part.content_disposition().map(|d| d.is_inline()).unwrap_or(false);
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
            size: 0,
            is_inline,
            content_id,
            part_id: part_paths.get(&att_id).cloned(),
            needs_download: true,
            data: Vec::new(),
        });
    }

    Ok(ParsedMail {
        subject: parsed.subject().map(|s| s.to_string()),
        from_address,
        to_addresses,
        cc_addresses,
        body_text: bt,
        body_html: None,
        preview_text,
        message_id: parsed.message_id().map(|s| s.to_string()),
        has_attachments: !attachments.is_empty(),
        attachments,
        date: parsed.date().map(|d| d.to_rfc3339()),
        html_part_id,
    })
}

/// 从已解析的 ParsedMail 中获取 HTML part 编号（即 html_part_id 字段）。
pub fn find_html_part_id(parsed: &ParsedMail) -> Option<String> {
    parsed.html_part_id.clone()
}

/// 在 mail-parser 的 parts 树中查找 text/html part 的 IMAP section 编号。
fn find_html_part_in_tree(parts: &[MessagePart], part_paths: &HashMap<u32, String>) -> Option<String> {
    for (att_id, path) in part_paths {
        let Some(part) = parts.get(*att_id as usize) else { continue };
        if let Some(ct) = part.content_type() {
            if ct.ctype().eq_ignore_ascii_case("text")
                && ct.subtype().map_or(false, |st| st.eq_ignore_ascii_case("html"))
            {
                return Some(path.clone());
            }
        }
    }
    None
}

fn parse_message_inner(raw: &[u8], max_attach_bytes: Option<usize>) -> MailResult<ParsedMail> {
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
    // 这里直接遍历 message.attachments（扁平 parts 索引），以便同时拿到
    // 各附件在扁平 parts 中的序号，用于查 MIME part 路径表。
    let part_paths = compute_part_paths(&parsed.parts);
    let html_part_id = find_html_part_in_tree(&parsed.parts, &part_paths);
    let mut attachments: Vec<ParsedAttachment> = Vec::new();
    for &att_id in &parsed.attachments {
        let Some(part) = parsed.part(att_id) else { continue };
        let data = part.contents();
        if data.is_empty() {
            continue;
        }
        let size = data.len();
        let lazy = max_attach_bytes.is_some_and(|max| size > max);
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
            size,
            is_inline,
            content_id,
            part_id: part_paths.get(&att_id).cloned(),
            needs_download: lazy,
            data: if lazy { Vec::new() } else { data.to_vec() },
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
        html_part_id,
    })
}

/// 计算每封邮件扁平 parts 的 MIME part 路径（扁平索引 -> IMAP section path，如 "1.2"）。
/// mail-parser 的 parts 是扁平数组，multipart 容器的 body 携带其直接子部件索引，
/// 依此递归即可还原树形编号，供 IMAP BODY.PEEK[{part_id}] 按需拉取附件。
fn compute_part_paths(parts: &[MessagePart]) -> HashMap<u32, String> {
    let mut out = HashMap::new();
    if let Some(root) = parts.first() {
        match &root.body {
            PartType::Multipart(children) => assign_part_paths(parts, children, "", &mut out),
            // 非 multipart 的邮件整体就是第 1 个 part（不产生附件，仅兜底）
            _ => {
                out.insert(0, "1".to_string());
            }
        }
    }
    out
}

fn assign_part_paths(
    parts: &[MessagePart],
    children: &[u32],
    prefix: &str,
    out: &mut HashMap<u32, String>,
) {
    for (i, &child_id) in children.iter().enumerate() {
        let path = if prefix.is_empty() {
            (i + 1).to_string()
        } else {
            format!("{}.{}", prefix, i + 1)
        };
        out.insert(child_id, path.clone());
        if let Some(child) = parts.get(child_id as usize) {
            if let PartType::Multipart(grandchildren) = &child.body {
                assign_part_paths(parts, grandchildren, &path, out);
            }
        }
    }
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

/// 解析单个 MIME part 的头部 + body，并正确解码 Content-Transfer-Encoding（QP/Base64）与字符集。
/// 将 IMAP 拉取的 part MIME headers + body 拼接为一个 mini MIME 消息，交给 mail-parser 解析。
pub fn decode_mime_part(part: &FetchedPart) -> Option<String> {
    // IMAP 返回的 BODY.PEEK[{part_id}.MIME] 已包含完整的头部与分隔空行（以 \r\n\r\n 结尾）。
    // 若头部末尾缺少空行分隔，则手动补一个，确保 mail-parser 能正确解析。
    let headers = if part.mime_headers.ends_with(b"\r\n\r\n") || part.mime_headers.ends_with(b"\n\n") {
        part.mime_headers.clone()
    } else {
        let mut h = part.mime_headers.clone();
        // 头部可能以 \r\n 结尾也可能不以，统一保证以 \r\n\r\n 结尾
        if h.ends_with(b"\r\n") {
            h.extend_from_slice(b"\r\n");
        } else if h.ends_with(b"\n") {
            h.extend_from_slice(b"\n");
        } else {
            h.extend_from_slice(b"\r\n\r\n");
        }
        h
    };
    let raw: Vec<u8> = headers.into_iter()
        .chain(part.body.iter().cloned())
        .collect();
    let parsed = MessageParser::default()
        .with_mime_headers()
        .parse(&raw)?;
    let text_part = parsed.parts.first()?;
    text_part.text_contents().map(|s| s.to_string())
}

pub fn infer_folder_type(imap_path: &str, flags: &[String]) -> &'static str {
    let path_upper = imap_path.to_uppercase();
    if flags.iter().any(|f| f.to_uppercase().contains("INBOX")) || path_upper == "INBOX" {
        return "inbox";
    }
    // 按路径分隔符拆分，检查最后一个组件与完整路径
    let last_component = path_upper.split('/').last().unwrap_or(&path_upper);
    match last_component {
        "SENT" | "SENT ITEMS" | "SENT MESSAGES" | "已发送" => "sent",
        "DRAFTS" | "DRAFT" | "草稿" | "草稿箱" => "drafts",
        "TRASH" | "DELETED" | "DELETED ITEMS" | "已删除" | "垃圾箱" | "DELETED MESSAGES" => "trash",
        "JUNK" | "SPAM" | "JUNK EMAIL" | "垃圾邮件" => "spam",
        _ => {
            // 兜底：检查完整路径是否包含常见关键词（处理 "QQ/Deleted Messages" 等嵌套路径）
            if path_upper.contains("DELETED") || path_upper.contains("TRASH") {
                return "trash";
            }
            if path_upper.contains("JUNK") || path_upper.contains("SPAM") {
                return "spam";
            }
            if path_upper.contains("SENT") {
                return "sent";
            }
            if path_upper.contains("DRAFT") {
                return "drafts";
            }
            "other"
        }
    }
}

pub fn folder_display_name(imap_path: &str, folder_type: &str) -> String {
    // 按路径分隔符拆分，取最后一个组件作为匹配依据
    let last_component = imap_path.split('/').last().unwrap_or(imap_path);
    let last_upper = last_component.to_uppercase();

    // 精确匹配常见 IMAP 文件夹名称
    let mapping: &[(&str, &str)] = &[
        ("INBOX", "收件箱"),
        ("SENT", "已发送"),
        ("SENT ITEMS", "已发送"),
        ("SENT MESSAGES", "已发送"),
        ("DRAFTS", "草稿箱"),
        ("DRAFT", "草稿箱"),
        ("TRASH", "已删除"),
        ("DELETED", "已删除"),
        ("DELETED MESSAGES", "已删除"),
        ("DELETED ITEMS", "已删除"),
        ("JUNK", "垃圾邮件"),
        ("SPAM", "垃圾邮件"),
        ("JUNK EMAIL", "垃圾邮件"),
    ];
    for (key, name) in mapping {
        if last_upper == *key {
            return name.to_string();
        }
    }
    // 兜底：通过 folder_type 推断
    match folder_type {
        "inbox" => return "收件箱".to_string(),
        "sent" => return "已发送".to_string(),
        "drafts" => return "草稿箱".to_string(),
        "trash" => return "已删除".to_string(),
        "spam" => return "垃圾邮件".to_string(),
        _ => {}
    }
    // 完全匹配不上时，使用最后一个路径组件（去除前缀账号标识）
    // 检查原始组件是否已经是中文
    if last_component.chars().any(|c| c.is_ascii_alphabetic()) {
        // 英文文件夹名，尝试通过关键词匹配翻译
        if last_upper.contains("DELETED") || last_upper.contains("TRASH") {
            return "已删除".to_string();
        }
        if last_upper.contains("JUNK") || last_upper.contains("SPAM") {
            return "垃圾邮件".to_string();
        }
        if last_upper.contains("SENT") {
            return "已发送".to_string();
        }
        if last_upper.contains("DRAFT") {
            return "草稿箱".to_string();
        }
        if last_upper.contains("INBOX") {
            return "收件箱".to_string();
        }
    }
    last_component.to_string()
}
