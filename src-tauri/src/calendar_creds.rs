use keyring::Entry;

const SERVICE_NAME: &str = "easywork-calendar";

fn account(subscription_id: &str) -> String {
    format!("subscription:{}", subscription_id)
}

pub fn save_password(subscription_id: &str, password: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &account(subscription_id))
        .map_err(|e| format!("无法访问密钥库: {}", e))?;
    if password.is_empty() {
        let _ = entry.delete_credential();
    } else {
        entry.set_password(password)
            .map_err(|e| format!("无法保存日历密码: {}", e))?;
    }
    Ok(())
}

pub fn get_password(subscription_id: &str) -> Option<String> {
    let entry = Entry::new(SERVICE_NAME, &account(subscription_id)).ok()?;
    entry.get_password().ok()
}

pub fn delete_password(subscription_id: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &account(subscription_id))
        .map_err(|e| format!("无法访问密钥库: {}", e))?;
    let _ = entry.delete_credential();
    Ok(())
}
