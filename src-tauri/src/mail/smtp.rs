use lettre::message::header::ContentType;
use lettre::message::{MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use crate::mail::error::{MailError, MailResult};

pub struct SmtpParams {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from_email: String,
    pub from_name: Option<String>,
}

pub async fn send_mail(params: &SmtpParams, to: &[String], cc: &[String],
    subject: &str, body_html: &str, body_text: &str) -> MailResult<Vec<u8>> {
    let mut builder = Message::builder();
    let from_addr = match &params.from_name {
        Some(name) => format!("{} <{}>", name, params.from_email).parse()
            .map_err(|e| MailError::new("MIME_ERROR", &format!("发件人解析失败: {}", e)))?,
        None => params.from_email.parse()
            .map_err(|e| MailError::new("MIME_ERROR", &format!("发件人解析失败: {}", e)))?,
    };
    builder = builder.from(from_addr);

    for addr in to {
        builder = builder.to(addr.parse()
            .map_err(|e| MailError::new("MIME_ERROR", &format!("收件人解析失败: {}", e)))?);
    }
    for addr in cc {
        builder = builder.cc(addr.parse()
            .map_err(|e| MailError::new("MIME_ERROR", &format!("抄送解析失败: {}", e)))?);
    }

    let email = builder.subject(subject)
        .multipart(MultiPart::alternative()
            .singlepart(SinglePart::builder()
                .header(ContentType::TEXT_PLAIN)
                .body(body_text.to_string()))
            .singlepart(SinglePart::builder()
                .header(ContentType::TEXT_HTML)
                .body(body_html.to_string())))
        .map_err(|e| MailError::new("MIME_ERROR", &format!("构建MIME失败: {}", e)))?;

    let transport = if params.port == 465 {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&params.host)
            .map_err(|e| MailError::new("SMTP_ERROR", &format!("SMTP配置失败: {}", e)))?
            .port(params.port)
            .credentials(Credentials::new(params.username.clone(), params.password.clone()))
            .build()
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&params.host)
            .map_err(|e| MailError::new("SMTP_ERROR", &format!("SMTP配置失败: {}", e)))?
            .port(params.port)
            .credentials(Credentials::new(params.username.clone(), params.password.clone()))
            .build()
    };

    let formatted = email.formatted();
    transport.send(email).await
        .map_err(|e| MailError::new("SMTP_SEND", &format!("发送失败: {}", e)))?;

    Ok(formatted)
}
