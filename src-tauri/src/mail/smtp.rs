use lettre::message::{
    header::ContentType, Mailbox, Message, MessageBuilder, MultiPart, SinglePart,
};
use lettre::{AsyncSmtpTransport, AsyncTransport, Tokio1Executor};
use lettre::transport::smtp::authentication::Credentials;

/// Attachment data for sending.
pub struct MailAttachment {
    pub filename: String,
    pub content_type: String,
    pub data: Vec<u8>,
}

/// Parse a "Name <email>" or just "email" string into a Mailbox.
fn parse_mailbox(input: &str) -> Result<Mailbox, Box<dyn std::error::Error + Send + Sync>> {
    if let Some(start) = input.find('<') {
        if let Some(end) = input.find('>') {
            let name = input[..start].trim().trim_matches('"').to_string();
            let addr = &input[start + 1..end];
            if name.is_empty() {
                return addr.parse::<Mailbox>().map_err(|e| e.into());
            }
            return format!("{} <{}>", name, addr).parse::<Mailbox>().map_err(|e| e.into());
        }
    }
    input.parse::<Mailbox>().map_err(|e| e.into())
}

/// Parse a semicolon-separated list of recipients into Mailbox vec.
fn parse_recipients(input: &str) -> Vec<Result<Mailbox, Box<dyn std::error::Error + Send + Sync>>> {
    if input.is_empty() {
        return Vec::new();
    }
    input.split(';')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(parse_mailbox)
        .collect()
}

/// Send an email via SMTP with CC/BCC and optional attachments.
///
/// Returns `Ok(())` on success.
#[allow(clippy::too_many_arguments)]
pub async fn send_mail(
    smtp_host: &str,
    smtp_port: u16,
    username: &str,
    password: &str,
    from: &str,
    from_name: Option<&str>,
    to_list: &[String],
    cc_list: &[String],
    bcc_list: &[String],
    subject: &str,
    body_text: &str,
    body_html: Option<&str>,
    attachments: &[MailAttachment],
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let from_mailbox = match from_name {
        Some(name) => format!("{} <{}>", name, from).parse::<Mailbox>()?,
        None => from.parse::<Mailbox>()?,
    };

    // Build the base message
    let mut builder = Message::builder()
        .from(from_mailbox);

    // Add To recipients
    for to in to_list {
        let mb = parse_mailbox(to)?;
        builder = builder.to(mb);
    }

    // Add CC recipients
    for cc in cc_list {
        let mb = parse_mailbox(cc)?;
        builder = builder.cc(mb);
    }

    // Add BCC recipients
    for bcc in bcc_list {
        let mb = parse_mailbox(bcc)?;
        builder = builder.bcc(mb);
    }

    builder = builder.subject(subject);

    // Build multipart body
    let email = if attachments.is_empty() {
        // No attachments: multipart/alternative (text + html) or single part
        let text_part = SinglePart::plain(body_text.to_string());
        if let Some(html) = body_html {
            let html_part = SinglePart::html(html.to_string());
            let alternative = MultiPart::alternative()
                .singlepart(text_part)
                .singlepart(html_part);
            builder.multipart(alternative.into())?
        } else {
            builder.singlepart(text_part)?
        }
    } else {
        // With attachments: multipart/mixed containing multipart/alternative + attachments
        let text_part = SinglePart::plain(body_text.to_string());
        let mut alternative = MultiPart::alternative()
            .singlepart(text_part);

        if let Some(html) = body_html {
            let html_part = SinglePart::html(html.to_string());
            alternative = alternative.singlepart(html_part);
        }

        let mut mixed = MultiPart::mixed()
            .multipart(alternative);

        for att in attachments {
            let content_type: ContentType = att.content_type.parse().unwrap_or_else(|_| {
                ContentType::parse("application/octet-stream").unwrap()
            });
            let attachment = SinglePart::builder()
                .header(content_type)
                .header(lettre::message::header::ContentDisposition::attachment(
                    att.filename.as_str(),
                ))
                .body(att.data.clone());
            mixed = mixed.singlepart(attachment);
        }

        builder.multipart(mixed.into())?
    };

    let creds = Credentials::new(username.to_string(), password.to_string());

    let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(smtp_host)?
        .port(smtp_port)
        .credentials(creds)
        .build();

    mailer.send(email).await?;

    Ok(())
}
