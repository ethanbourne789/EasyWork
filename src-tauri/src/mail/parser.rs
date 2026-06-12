use mailparse::{parse_mail, ParsedMail};
use chrono::{DateTime, FixedOffset, NaiveDateTime};

#[derive(Debug, Clone)]
pub struct ParsedMessage {
    pub subject: String,
    pub from_name: String,
    pub from_email: String,
    pub to_list: Vec<(String, String)>,
    pub cc_list: Vec<(String, String)>,
    pub date: String,
    pub body_text: String,
    pub body_html: String,
    pub message_id: String,
    pub attachments: Vec<ParsedAttachment>,
    pub in_reply_to: String,
    pub references: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ParsedAttachment {
    pub filename: String,
    pub content_type: String,
    pub size: usize,
    pub content: Vec<u8>,
}

fn find_header<'a>(
    headers: &'a [mailparse::MailHeader<'a>],
    key: &str,
) -> Option<&'a mailparse::MailHeader<'a>> {
    headers
        .iter()
        .find(|h| h.get_key().eq_ignore_ascii_case(key))
}

fn header_value(headers: &[mailparse::MailHeader<'_>], key: &str) -> String {
    find_header(headers, key)
        .map(|h| h.get_value())
        .unwrap_or_default()
}

/// Normalize an RFC 2822 date header into a clean `YYYY-MM-DD HH:MM:SS` string.
///
/// Email senders are inconsistent — examples we see in the wild:
///   - `Wed, 10 Jun 2026 15:57:48 +0000`
///   - `Wed, 10 Jun 2026 15:57:48 +0000 (UTC)`        ← Trading 212
///   - `Tue, 12 May 2026 10:02:24 +0800 (CST)`        ← Chinese senders
///   - `Tue, 12 May 2026 05:47:52 -0400 (EDT)`        ← US senders
///   - `Wed, 13 May 2026 06:06:16 GMT`                ← obsolete zone name
///
/// We strip the trailing parenthesised zone name first, then use chrono's
/// RFC 2822 parser which handles numeric offsets. Falls back to a trimmed
/// prefix if the date is unparseable, and to an empty string if completely
/// empty (the frontend `formatMailDate` then returns the raw value).
pub fn normalize_rfc2822_date(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() {
        return String::new();
    }
    // Strip trailing `(UTC)`, `(CST)`, `(EDT)` etc. — these break chrono parsing.
    let stripped = if let Some(stripped) = strip_trailing_zone_name(s) {
        stripped
    } else {
        s.to_string()
    };
    // Try parsing as RFC 2822 with offset first.
    if let Ok(dt) = DateTime::parse_from_rfc2822(&stripped) {
        return dt.format("%Y-%m-%d %H:%M:%S").to_string();
    }
    // Try `Wdy, DD Mon YYYY HH:MM:SS ±HHMM` form (common variant).
    if let Ok(dt) = DateTime::parse_from_str(
        &stripped,
        "%a, %d %b %Y %H:%M:%S %z",
    ) {
        return dt.format("%Y-%m-%d %H:%M:%S").to_string();
    }
    // Try `Wdy, DD Mon YYYY HH:MM:SS Zone` (obsolete, e.g. `GMT`/`UT`) — assume UTC.
    for fmt in &[
        "%a, %d %b %Y %H:%M:%S GMT",
        "%a, %d %b %Y %H:%M:%S UT",
        "%d %b %Y %H:%M:%S %Z",
    ] {
        if let Ok(naive) = NaiveDateTime::parse_from_str(&stripped, fmt) {
            if let Some(offset) = FixedOffset::east_opt(0) {
                let dt: DateTime<FixedOffset> = DateTime::from_naive_utc_and_offset(naive, offset);
                return dt.format("%Y-%m-%d %H:%M:%S").to_string();
            }
        }
    }
    // Last-resort: keep the original trimmed form so the frontend can still
    // attempt to display it (and so the user can see what was stored).
    s.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_utc_suffix() {
        assert_eq!(
            normalize_rfc2822_date("Wed, 10 Jun 2026 15:57:48 +0000 (UTC)"),
            "2026-06-10 15:57:48"
        );
    }

    #[test]
    fn strips_cst_suffix() {
        assert_eq!(
            normalize_rfc2822_date("Tue, 12 May 2026 10:02:24 +0800 (CST)"),
            "2026-05-12 10:02:24"
        );
    }

    #[test]
    fn strips_edt_suffix() {
        assert_eq!(
            normalize_rfc2822_date("Tue, 12 May 2026 05:47:52 -0400 (EDT)"),
            "2026-05-12 05:47:52"
        );
    }

    #[test]
    fn handles_gmt_zone_name() {
        assert_eq!(
            normalize_rfc2822_date("Wed, 13 May 2026 06:06:16 GMT"),
            "2026-05-13 06:06:16"
        );
    }

    #[test]
    fn handles_plain_offset() {
        assert_eq!(
            normalize_rfc2822_date("Mon, 11 May 2026 20:30:05 +0000"),
            "2026-05-11 20:30:05"
        );
    }

    #[test]
    fn empty_input() {
        assert_eq!(normalize_rfc2822_date(""), "");
    }

    #[test]
    fn garbage_passes_through() {
        let out = normalize_rfc2822_date("not a date");
        assert!(!out.is_empty());
    }
}

/// Strip a trailing `(...)` zone abbreviation from an RFC 2822 date string.
/// Returns None if no such suffix is present.
fn strip_trailing_zone_name(s: &str) -> Option<String> {
    let close = s.rfind(')')?; // no closing paren at all
    let open = s.rfind('(')?;
    if open >= close || open < s.len() - 6 || open == 0 {
        return None;
    }
    // Require the character just before '(' to be whitespace.
    let prefix = &s[..open];
    if !prefix.ends_with(char::is_whitespace) {
        return None;
    }
    Some(prefix.trim_end().to_string())
}

pub fn parse_raw_message(
    raw: &[u8],
) -> Result<ParsedMessage, Box<dyn std::error::Error + Send + Sync>> {
    let parsed = parse_mail(raw)?;
    let headers = &parsed.headers;

    let subject = header_value(headers, "subject");
    let from = header_value(headers, "from");
    let (from_name, from_email) = parse_addr(&from);
    let date = normalize_rfc2822_date(&header_value(headers, "date"));
    let message_id = header_value(headers, "message-id");
    let in_reply_to = header_value(headers, "in-reply-to");
    let references: Vec<String> = header_value(headers, "references")
        .split_whitespace()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let to_raw = header_value(headers, "to");
    let cc_raw = header_value(headers, "cc");
    let to_list = parse_addr_list(&to_raw);
    let cc_list = parse_addr_list(&cc_raw);

    let (body_text, body_html, attachments) = extract_body(&parsed);

    Ok(ParsedMessage {
        // Header values from mailparse::get_value() are already RFC 2047 decoded
        subject,
        from_name,
        from_email,
        to_list,
        cc_list,
        date,
        body_text,
        body_html,
        message_id,
        attachments,
        in_reply_to,
        references,
    })
}

/// Parse only email headers — no body text, no HTML, no attachments.
///
/// Use this for first sync or bulk operations where only metadata is needed.
/// The returned `ParsedMessage` will have empty `body_text`, `body_html`,
/// and `attachments` fields, which is significantly faster than full parsing.
pub fn parse_header_only(
    raw: &[u8],
) -> Result<ParsedMessage, Box<dyn std::error::Error + Send + Sync>> {
    use mailparse::parse_mail;

    // Parse headers only — we use a lightweight approach: parse_mail still
    // does a full MIME parse, but we simply discard body/attachment data.
    let parsed = parse_mail(raw)?;
    let headers = &parsed.headers;

    let subject = header_value(headers, "subject");
    let from = header_value(headers, "from");
    let (from_name, from_email) = parse_addr(&from);
    let date = normalize_rfc2822_date(&header_value(headers, "date"));
    let message_id = header_value(headers, "message-id");
    let in_reply_to = header_value(headers, "in-reply-to");
    let references: Vec<String> = header_value(headers, "references")
        .split_whitespace()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let to_raw = header_value(headers, "to");
    let cc_raw = header_value(headers, "cc");
    let to_list = parse_addr_list(&to_raw);
    let cc_list = parse_addr_list(&cc_raw);

    log::debug!(
        "parse_header_only: subj='{}' from='{}' date='{}' {:?}→{:?}",
        subject.chars().take(40).collect::<String>(),
        from_email,
        date,
        to_list,
        cc_list,
    );

    Ok(ParsedMessage {
        subject,
        from_name,
        from_email,
        to_list,
        cc_list,
        date,
        body_text: String::new(),    // skipped
        body_html: String::new(),    // skipped
        message_id,
        attachments: Vec::new(),     // skipped
        in_reply_to,
        references,
    })
}

fn parse_addr(addr: &str) -> (String, String) {
    if let Some(start) = addr.find('<') {
        if let Some(end) = addr.find('>') {
            let name = addr[..start].trim().trim_matches('"').to_string();
            let email = addr[start + 1..end].to_string();
            return (name, email);
        }
    }
    (String::new(), addr.to_string())
}

fn parse_addr_list(addr: &str) -> Vec<(String, String)> {
    addr.split(',')
        .map(|a| parse_addr(a.trim()))
        .filter(|(_, e)| !e.is_empty())
        .collect()
}

fn get_content_disposition_filename(parsed: &ParsedMail) -> Option<String> {
    find_header(&parsed.headers, "content-disposition").and_then(|h| {
        let val = h.get_value();
        if val.contains("filename=") {
            val.split("filename=")
                .nth(1)
                .map(|s| s.trim_matches(|c: char| c == '"' || c == '\'').to_string())
        } else {
            None
        }
    })
}

fn extract_body(parsed: &ParsedMail) -> (String, String, Vec<ParsedAttachment>) {
    let mut text = String::new();
    let mut html = String::new();
    let mut attachments = Vec::new();

    if parsed.subparts.is_empty() {
        match parsed.ctype.mimetype.as_str() {
            "text/plain" => {
                text = parsed.get_body().unwrap_or_default();
            }
            "text/html" => {
                html = parsed.get_body().unwrap_or_default();
            }
            _ => {
                let filename = get_content_disposition_filename(parsed)
                    .or_else(|| parsed.ctype.params.get("name").cloned())
                    .unwrap_or_else(|| "attachment".to_string());

                let ct = if parsed.ctype.mimetype.contains('/') {
                    parsed.ctype.mimetype.clone()
                } else {
                    "application/octet-stream".to_string()
                };

                attachments.push(ParsedAttachment {
                    filename,
                    content_type: ct,
                    size: parsed.get_body_raw().map(|b| b.len()).unwrap_or(0),
                    content: parsed.get_body_raw().unwrap_or_default(),
                });
            }
        }
    } else {
        for part in &parsed.subparts {
            let (p_text, p_html, mut p_attachments) = extract_body(part);
            if !p_text.is_empty() && text.is_empty() {
                text = p_text;
            }
            if !p_html.is_empty() {
                html = p_html;
            }
            attachments.append(&mut p_attachments);
        }
    }

    (text, html, attachments)
}

/// Extract a specific attachment by filename from raw MIME message bytes.
/// Returns the raw binary content of the matching attachment.
pub fn extract_attachment_by_name(
    raw: &[u8],
    target_filename: &str,
) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    let parsed = parse_mail(raw)?;
    let (_, _, attachments) = extract_body(&parsed);

    let normalized_target = target_filename.trim().to_lowercase();
    for att in &attachments {
        if att.filename.trim().to_lowercase() == normalized_target {
            log::info!(
                "extract_attachment_by_name: found '{}' ({} bytes)",
                att.filename, att.size,
            );
            return Ok(att.content.clone());
        }
    }

    // Fallback: try matching by sanitized filenames
    for att in &attachments {
        let safe = sanitize_filename::sanitize(&att.filename);
        if safe.trim().to_lowercase() == normalized_target {
            log::info!(
                "extract_attachment_by_name: matched via sanitize '{}' ({} bytes)",
                att.filename, att.size,
            );
            return Ok(att.content.clone());
        }
    }

    Err(format!("附件 '{}' 在邮件中未找到", target_filename).into())
}
