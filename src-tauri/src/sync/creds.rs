use keyring::Entry;

const SERVICE_NAME: &str = "easywork-sync";
const ACCOUNT: &str = "default";

pub fn save_connection_string(connection_string: &str) -> Result<(), String> {
    if connection_string.is_empty() {
        delete_connection_string()?;
        return Ok(());
    }
    let entry = Entry::new(SERVICE_NAME, ACCOUNT)
        .map_err(|e| format!("无法访问密钥库: {}", e))?;
    entry.set_password(connection_string)
        .map_err(|e| format!("无法保存同步连接串: {}", e))?;
    Ok(())
}

pub fn get_connection_string() -> Option<String> {
    let entry = Entry::new(SERVICE_NAME, ACCOUNT).ok()?;
    entry.get_password().ok()
}

pub fn delete_connection_string() -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, ACCOUNT)
        .map_err(|e| format!("无法访问密钥库: {}", e))?;
    let _ = entry.delete_credential();
    Ok(())
}
