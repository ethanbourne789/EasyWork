use async_imap::Session;
use async_imap::types::NameAttribute;
use async_imap::imap_proto::types::{MessageSection, SectionPath};
use tokio::net::TcpStream;
use tokio_rustls::client::TlsStream;
use rustls_platform_verifier::ConfigVerifierExt;
use crate::mail::error::{MailError, MailResult};
use futures::StreamExt;

type ImapSession = Session<TlsStream<TcpStream>>;

/// 按需拉取的单个 MIME part：.MIME 头部（含 Content-Transfer-Encoding）与编码后的 body 字节
pub struct FetchedPart {
    pub mime_headers: Vec<u8>,
    pub body: Vec<u8>,
}

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
        let mut raw = 0usize;
        let mut skipped = 0usize;
        while let Some(mbox) = mailboxes.next().await {
            raw += 1;
            if let Ok(m) = mbox {
                let skip = m.attributes().iter().any(|a| {
                    matches!(a, NameAttribute::NoSelect)
                        || matches!(a, NameAttribute::Extension(s) if s == "NonExistent")
                });
                if skip { skipped += 1; continue; }
                let path = m.name().to_string();
                let flags: Vec<String> = m.attributes().iter().map(|f| format!("{:?}", f)).collect();
                result.push((path, flags));
            }
        }
        tracing::debug!("[list_folders] raw={} skipped={} kept={}", raw, skipped, result.len());
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
        let mut stream_errors = 0usize;
        let mut last_err: Option<String> = None;
        while let Some(msg) = stream.next().await {
            match msg {
                Ok(msg) => {
                    let uid = msg.uid.unwrap_or(0);
                    let flags: Vec<String> = msg.flags().map(|f| format!("{:?}", f)).collect();
                    if let Some(body) = msg.body() {
                        result.push((uid, body.to_vec(), flags));
                    }
                }
                Err(e) => {
                    stream_errors += 1;
                    last_err = Some(format!("{}", e));
                }
            }
        }
        // 全部失败时把底层错误透传出去，避免"拉到 0 封但无错误"的假象
        if result.is_empty() && stream_errors > 0 {
            return Err(MailError::new("IMAP_FETCH", &format!("拉取邮件失败: {}", last_err.unwrap_or_default())));
        }
        Ok(result)
    }

    /// 懒同步：仅拉取元数据与正文，**不拉取任何附件字节**。
    /// 返回 (UID, 消息头字节, BODY.PEEK[TEXT], FLAGS)。
    /// 调用方通过解析 HEADER 获取信封字段与正文，通过 BODY.PEEK[TEXT] 获取纯文本正文。
    pub async fn fetch_range_lazy(&mut self, start: u32, end: u32) -> MailResult<Vec<(u32, Vec<u8>, Option<Vec<u8>>, Vec<String>)>> {
        let range = format!("{}:{}", start, end);
        let mut stream = self.session.uid_fetch(range, "(UID FLAGS BODY.PEEK[HEADER] BODY.PEEK[TEXT])").await
            .map_err(|e| MailError::new("IMAP_FETCH", &format!("拉取邮件失败: {}", e)))?;
        let mut result = Vec::new();
        let mut stream_errors = 0usize;
        let mut last_err: Option<String> = None;
        let header_path = SectionPath::Full(MessageSection::Header);
        let text_path = SectionPath::Part(Vec::new(), Some(MessageSection::Text));
        while let Some(msg) = stream.next().await {
            match msg {
                Ok(msg) => {
                    let uid = msg.uid.unwrap_or(0);
                    let flags: Vec<String> = msg.flags().map(|f| format!("{:?}", f)).collect();
                    let header = msg.section(&header_path).map(|b| b.to_vec());
                    let body_text = msg.section(&text_path).map(|b| b.to_vec());
                    result.push((uid, header.unwrap_or_default(), body_text, flags));
                }
                Err(e) => {
                    stream_errors += 1;
                    last_err = Some(format!("{}", e));
                }
            }
        }
        if result.is_empty() && stream_errors > 0 {
            return Err(MailError::new("IMAP_FETCH", &format!("拉取邮件失败: {}", last_err.unwrap_or_default())));
        }
        Ok(result)
    }

    /// 按需拉取单个 UID 的 HTML 正文（给定 part_id），同时拉取 MIME 头部以便正确解码 CTE。
    /// 用于懒同步后补充 HTML 正文：先解析 HEADER 获取 text/html part 编号，再调用此方法拉取。
    pub async fn fetch_html_body(&mut self, uid: u32, part_id: &str) -> MailResult<Option<FetchedPart>> {
        let path: Vec<u32> = part_id.split('.').filter_map(|s| s.trim().parse::<u32>().ok()).collect();
        if path.is_empty() {
            return Ok(None);
        }
        let query = format!("(BODY.PEEK[{}.MIME] BODY.PEEK[{}])", part_id, part_id);
        let mut stream = self.session.uid_fetch(uid.to_string(), &query).await
            .map_err(|e| MailError::new("IMAP_FETCH_HTML", &format!("拉取 HTML 正文失败: {}", e)))?;
        let mime_path = SectionPath::Part(path.clone(), Some(MessageSection::Mime));
        let body_path = SectionPath::Part(path, None);
        let mut mime_headers: Option<Vec<u8>> = None;
        let mut body: Option<Vec<u8>> = None;
        while let Some(msg) = stream.next().await {
            let msg = msg.map_err(|e| MailError::new("IMAP_FETCH_HTML", &format!("拉取 HTML 正文失败: {}", e)))?;
            if mime_headers.is_none() {
                if let Some(h) = msg.section(&mime_path) {
                    mime_headers = Some(h.to_vec());
                }
            }
            if body.is_none() {
                if let Some(b) = msg.section(&body_path) {
                    body = Some(b.to_vec());
                }
            }
            // 两者都获取到即可提前退出
            if mime_headers.is_some() && body.is_some() {
                break;
            }
        }
        let body = body.ok_or_else(|| MailError::new("IMAP_FETCH_HTML", "未获取到 HTML 正文"))?;
        Ok(Some(FetchedPart {
            mime_headers: mime_headers.unwrap_or_default(),
            body,
        }))
    }

    /// 按需拉取单个 MIME part：重选文件夹后一次 UID FETCH 同时取
    /// `BODY.PEEK[{part_id}.MIME]`（part 的 MIME 头部）与 `BODY.PEEK[{part_id}]`（编码后的 body 字节）。
    pub async fn fetch_attachment(&mut self, folder: &str, uid: u32, part_id: &str) -> MailResult<FetchedPart> {
        self.select_folder(folder).await?;
        // part_id 形如 "1.2"，解析为 BODY[1.2] 的数值路径
        let path: Vec<u32> = part_id
            .split('.')
            .filter_map(|s| s.trim().parse::<u32>().ok())
            .collect();
        if path.is_empty() {
            return Err(MailError::new("IMAP_FETCH", "无效的附件 part 编号"));
        }
        let query = format!("(BODY.PEEK[{}.MIME] BODY.PEEK[{}])", part_id, part_id);
        let mut stream = self.session.uid_fetch(uid.to_string(), query).await
            .map_err(|e| MailError::new("IMAP_FETCH", &format!("拉取附件失败: {}", e)))?;
        let mime_path = SectionPath::Part(path.clone(), Some(MessageSection::Mime));
        let body_path = SectionPath::Part(path, None);
        let mut mime_headers: Option<Vec<u8>> = None;
        let mut body: Option<Vec<u8>> = None;
        while let Some(msg) = stream.next().await {
            let msg = msg.map_err(|e| MailError::new("IMAP_FETCH", &format!("拉取附件失败: {}", e)))?;
            if mime_headers.is_none() {
                if let Some(h) = msg.section(&mime_path) {
                    mime_headers = Some(h.to_vec());
                }
            }
            if body.is_none() {
                if let Some(b) = msg.section(&body_path) {
                    body = Some(b.to_vec());
                }
            }
        }
        let body = body.ok_or_else(|| MailError::new("IMAP_FETCH", "未获取到附件数据"))?;
        Ok(FetchedPart {
            mime_headers: mime_headers.unwrap_or_default(),
            body,
        })
    }

    /// 整封拉取原始邮件（RFC822），用于 part_id 缺失或按 part 拉取失败时的兜底。
    pub async fn fetch_full(&mut self, folder: &str, uid: u32) -> MailResult<Vec<u8>> {
        self.select_folder(folder).await?;
        let mut stream = self.session.uid_fetch(uid.to_string(), "(RFC822)").await
            .map_err(|e| MailError::new("IMAP_FETCH", &format!("拉取邮件失败: {}", e)))?;
        while let Some(msg) = stream.next().await {
            let msg = msg.map_err(|e| MailError::new("IMAP_FETCH", &format!("拉取邮件失败: {}", e)))?;
            if let Some(raw) = msg.body() {
                return Ok(raw.to_vec());
            }
        }
        Err(MailError::new("IMAP_FETCH", "未获取到邮件数据"))
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

    /// 把原始 MIME 追加到指定 IMAP 文件夹（如已发送/草稿）
    pub async fn append_to_mailbox(&mut self, mailbox: &str, raw_mail: &[u8]) -> MailResult<()> {
        self.session.append(mailbox, None, None, raw_mail).await
            .map_err(|e| MailError::new("IMAP_APPEND", &format!("追加到 {} 失败: {}", mailbox, e)))?;
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
