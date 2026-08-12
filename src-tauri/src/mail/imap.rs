use async_imap::Session;
use async_imap::types::NameAttribute;
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;
use rustls_platform_verifier::ConfigVerifierExt;
use crate::mail::error::{MailError, MailResult};
use futures::StreamExt;

type ImapSession = Session<TlsStream<TcpStream>>;

pub struct ImapAdapter {
    session: ImapSession,
}

const WINDOW: u32 = 200;
const HARD_CAP: u32 = 1000;

impl ImapAdapter {
    pub async fn connect(host: &str, port: u16, username: &str, password: &str) -> MailResult<Self> {
        let tcp_stream = TcpStream::connect((host, port)).await
            .map_err(|e| MailError::new("IMAP_CONNECT", &format!("TCP连接失败: {}", e)))?;
        let server_name: rustls::pki_types::ServerName = host.to_string().try_into()
            .map_err(|e| MailError::new("IMAP_CONNECT", &format!("无效主机名: {}", e)))?;
        let config = rustls::ClientConfig::with_platform_verifier();
        let connector = tokio_rustls::TlsConnector::from(std::sync::Arc::new(config));
        let tls_stream = connector.connect(server_name, tcp_stream).await
            .map_err(|e| MailError::new("IMAP_CONNECT", &format!("TLS握手失败: {}", e)))?;
        let client = async_imap::Client::new(tls_stream);
        let session = client.login(username, password).await
            .map_err(|e| MailError::new("IMAP_AUTH", &format!("IMAP认证失败: {:?}", e.0)))?;
        Ok(Self { session })
    }

    pub async fn list_folders(&mut self) -> MailResult<Vec<(String, Vec<String>)>> {
        let mailboxes = self.session.list(None, Some("*")).await
            .map_err(|e| MailError::new("IMAP_LIST", &format!("列出文件夹失败: {}", e)))?;
        tokio::pin!(mailboxes);
        let mut result = Vec::new();
        while let Some(mbox) = mailboxes.next().await {
            if let Ok(m) = mbox {
                // 跳过 Noselect/NonExistent 文件夹
                let skip = m.attributes().iter().any(|a| {
                    matches!(a, NameAttribute::NoSelect)
                        || matches!(a, NameAttribute::Extension(s) if s == "NonExistent")
                });
                if skip { continue; }
                let path = m.name().to_string();
                let flags: Vec<String> = m.attributes().iter().map(|f| format!("{:?}", f)).collect();
                result.push((path, flags));
            }
        }
        Ok(result)
    }

    pub async fn select_folder(&mut self, path: &str) -> MailResult<(u32, u32)> {
        let mailbox = self.session.select(path).await
            .map_err(|e| MailError::new("IMAP_SELECT", &format!("选择文件夹失败: {}", e)))?;
        Ok((mailbox.uid_next.unwrap_or(0), mailbox.uid_validity.unwrap_or(0)))
    }

    pub async fn fetch_range(&mut self, start: u32, end: u32) -> MailResult<Vec<(u32, Vec<u8>, Vec<String>)>> {
        let range = format!("{}:{}", start, end);
        let mut stream = self.session.uid_fetch(range, "(UID FLAGS RFC822)").await
            .map_err(|e| MailError::new("IMAP_FETCH", &format!("拉取邮件失败: {}", e)))?;
        let mut result = Vec::new();
        while let Some(msg) = stream.next().await {
            if let Ok(msg) = msg {
                let uid = msg.uid.unwrap_or(0);
                let flags: Vec<String> = msg.flags().map(|f| format!("{:?}", f)).collect();
                if let Some(body) = msg.body() {
                    result.push((uid, body.to_vec(), flags));
                }
            }
        }
        Ok(result)
    }

    pub async fn search_alive_uids(&mut self, from_uid: u32) -> MailResult<Vec<u32>> {
        let criteria = format!("UID {}:*", from_uid);
        let uids = self.session.uid_search(criteria).await
            .map_err(|e| MailError::new("IMAP_SEARCH", &format!("搜索UID失败: {}", e)))?;
        Ok(uids.into_iter().collect())
    }

    pub async fn store_flag(&mut self, uid: u32, flag: &str, add: bool) -> MailResult<()> {
        let range = format!("{}", uid);
        let op = if add { "+FLAGS" } else { "-FLAGS" };
        let query = format!("{} ({})", op, flag);
        let stream = self.session.uid_store(range, &query).await
            .map_err(|e| MailError::new("IMAP_STORE", &format!("设置标记失败: {}", e)))?;
        tokio::pin!(stream);
        while let Some(result) = stream.next().await {
            result.map_err(|e| MailError::new("IMAP_STORE", &format!("设置标记失败: {}", e)))?;
        }
        Ok(())
    }

    pub async fn append_to_sent(&mut self, raw_mail: &[u8]) -> MailResult<()> {
        self.session.append("Sent", None, None, raw_mail).await
            .map_err(|e| MailError::new("IMAP_APPEND", &format!("追加到已发送失败: {}", e)))?;
        Ok(())
    }

    pub async fn create_mailbox(&mut self, name: &str) -> MailResult<()> {
        self.session.create(name).await
            .map_err(|e| MailError::new("IMAP_CREATE", &format!("创建文件夹失败: {}", e)))?;
        Ok(())
    }

    pub async fn rename_mailbox(&mut self, from: &str, to: &str) -> MailResult<()> {
        self.session.rename(from, to).await
            .map_err(|e| MailError::new("IMAP_RENAME", &format!("重命名文件夹失败: {}", e)))?;
        Ok(())
    }

    pub async fn delete_mailbox(&mut self, name: &str) -> MailResult<()> {
        self.session.delete(name).await
            .map_err(|e| MailError::new("IMAP_DELETE", &format!("删除文件夹失败: {}", e)))?;
        Ok(())
    }
}

pub fn calc_fetch_range(last_uid: Option<u32>, uid_next: u32) -> (u32, u32) {
    match last_uid {
        Some(last) => {
            let start = last + 1;
            let end = uid_next.saturating_sub(1).max(start);
            let capped = (end - start + 1).min(HARD_CAP);
            (start, start + capped - 1)
        }
        None => {
            let end = uid_next.saturating_sub(1);
            let start = end.saturating_sub(WINDOW) + 1;
            (start, end)
        }
    }
}
