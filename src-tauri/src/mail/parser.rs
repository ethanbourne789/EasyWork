use mailparse::{parse_mail, ParsedMail};

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

pub fn parse_raw_message(
    raw: &[u8],
) -> Result<ParsedMessage, Box<dyn std::error::Error + Send + Sync>> {
    let parsed = parse_mail(raw)?;
    let headers = &parsed.headers;

    let subject = header_value(headers, "subject");
    let from = header_value(headers, "from");
    let (from_name, from_email) = parse_addr(&from);
    let date = header_value(headers, "date");
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
