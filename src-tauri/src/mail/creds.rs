use keyring::Entry;
use crate::mail::error::{MailError, MailResult};

const SERVICE_NAME: &str = "easywork-mail";

pub struct CredentialStore;

impl CredentialStore {
    pub fn save_password(account_id: &str, password: &str) -> MailResult<()> {
        let entry = Entry::new(SERVICE_NAME, account_id)
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法访问密钥库: {}", e)))?;
        entry.set_password(password)
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法保存密码: {}", e)))?;
        Ok(())
    }

    pub fn get_password(account_id: &str) -> MailResult<String> {
        let entry = Entry::new(SERVICE_NAME, account_id)
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法访问密钥库: {}", e)))?;
        entry.get_password()
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法读取密码: {}", e)))
    }

    pub fn delete_password(account_id: &str) -> MailResult<()> {
        let entry = Entry::new(SERVICE_NAME, account_id)
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法访问密钥库: {}", e)))?;
        entry.delete_credential()
            .map_err(|e| MailError::new("KEYRING_ERROR", &format!("无法删除密码: {}", e)))?;
        Ok(())
    }

    pub fn credential_ref(account_id: &str) -> String {
        format!("{}:{}", SERVICE_NAME, account_id)
    }
}
