use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct MailError {
    pub code: String,
    pub message: String,
}

impl MailError {
    pub fn new(code: &str, message: &str) -> Self {
        Self { code: code.to_string(), message: message.to_string() }
    }
}

impl From<rusqlite::Error> for MailError {
    fn from(e: rusqlite::Error) -> Self {
        MailError::new("DB_ERROR", &format!("数据库错误: {}", e))
    }
}

impl From<std::io::Error> for MailError {
    fn from(e: std::io::Error) -> Self {
        MailError::new("IO_ERROR", &format!("IO错误: {}", e))
    }
}

impl From<lettre::transport::smtp::Error> for MailError {
    fn from(e: lettre::transport::smtp::Error) -> Self {
        MailError::new("SMTP_ERROR", &format!("SMTP错误: {}", e))
    }
}

impl From<Box<dyn std::error::Error>> for MailError {
    fn from(e: Box<dyn std::error::Error>) -> Self {
        MailError::new("UNKNOWN", &format!("{}", e))
    }
}

pub type MailResult<T> = Result<T, MailError>;
