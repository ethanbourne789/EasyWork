use lettre::message::{Mailbox, Message, MultiPart, SinglePart};
use lettre::{AsyncSmtpTransport, AsyncTransport, Tokio1Executor};
use lettre::transport::smtp::authentication::Credentials;

/// Send an email via SMTP.
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
    to: &str,
    to_name: Option<&str>,
    subject: &str,
    body_text: &str,
    body_html: Option<&str>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let from_mailbox = match from_name {
        Some(name) => format!("{} <{}>", name, from).parse::<Mailbox>()?,
        None => from.parse::<Mailbox>()?,
    };

    let to_mailbox = match to_name {
        Some(name) => format!("{} <{}>", name, to).parse::<Mailbox>()?,
        None => to.parse::<Mailbox>()?,
    };

    // Build text part
    let text_part = SinglePart::plain(body_text.to_string());

    // Build the email
    let email = if let Some(html) = body_html {
        let html_part = SinglePart::html(html.to_string());
        let alternative = MultiPart::alternative()
            .singlepart(text_part)
            .singlepart(html_part);
        Message::builder()
            .from(from_mailbox)
            .to(to_mailbox)
            .subject(subject)
            .multipart(alternative.into())?
    } else {
        Message::builder()
            .from(from_mailbox)
            .to(to_mailbox)
            .subject(subject)
            .singlepart(text_part)?
    };

    let creds = Credentials::new(username.to_string(), password.to_string());

    let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(smtp_host)?
        .port(smtp_port)
        .credentials(creds)
        .build();

    mailer.send(email).await?;

    Ok(())
}
