use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use argon2::Argon2;
use base64::Engine as _;
use rand::RngCore;
use serde_json;
use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;

// ---------------------------------------------------------------------------
// 本地数据备份：全量导出 / 全量导入（Settings 页「导出数据 / 导入数据」）
// ---------------------------------------------------------------------------

/// 加密备份包装版本号。加密时写入，解密时校验；未加密备份不带该字段。
const BACKUP_WRAPPER_VERSION: i64 = 1;
/// Argon2 KDF 盐长度（字节）。至少 8 字节，取 16 字节。
const BACKUP_SALT_LEN: usize = 16;
/// AES-256-GCM nonce 长度（字节）。
const BACKUP_NONCE_LEN: usize = 12;
/// AES-256-GCM 派生密钥长度（字节）。
const BACKUP_KEY_LEN: usize = 32;

/// 参与备份的业务表（不含邮件库——邮件数据在独立 mail.db，见 mail 模块）。
const BACKUP_TABLES: &[&str] = &[
    "tasks", "subtasks", "tags", "task_tags",
    "accounts", "categories", "transactions", "budgets",
    "notes", "note_folders", "note_tag_master", "note_note_tags",
    "calendar_events", "calendar_subscriptions",
];

/// 清空业务表的顺序：**子表（引用他表的）必须先于父表删除**，
/// 否则在外键约束（无 ON DELETE CASCADE）下 DELETE 父表会报
/// `FOREIGN KEY constraint failed`。
/// 自引用列（categories.parent_id、note_folders.parent_id）需在删除前置 NULL。
const CLEAR_ORDER: &[&str] = &[
    "subtasks", "task_tags", "note_note_tags",
    "transactions", "budgets", "notes", "calendar_events",
    "tasks", "tags", "accounts", "categories",
    "note_folders", "note_tag_master", "calendar_subscriptions",
];

/// 导出全部业务表为 { table: rows[] }。含 sync 元数据列，便于完整恢复。
/// 传 password 时对导出内容做 AES-256-GCM 加密（包装为加密 JSON）；
/// 不传（或空串）时行为与旧版完全一致（返回明文 { table: rows[] }）。
#[tauri::command]
pub async fn data_export_all(
    state: State<'_, AppState>,
    password: Option<String>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock().await;
    let mut out = serde_json::Map::new();
    for table in BACKUP_TABLES {
        let sql = format!("SELECT * FROM \"{}\"", table);
        let mut stmt = db.prepare(&sql).map_err(|e| format!("导出 {} 失败: {}", table, e))?;
        let col_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
        let rows = stmt
            .query_map([], |row| {
                let mut m = serde_json::Map::new();
                for (i, c) in col_names.iter().enumerate() {
                    let v = match row.get_ref(i) {
                        Ok(rusqlite::types::ValueRef::Null) => serde_json::Value::Null,
                        Ok(rusqlite::types::ValueRef::Integer(n)) => serde_json::json!(n),
                        Ok(rusqlite::types::ValueRef::Real(f)) => serde_json::json!(f),
                        Ok(rusqlite::types::ValueRef::Text(t)) => {
                            serde_json::json!(String::from_utf8_lossy(t).into_owned())
                        }
                        Ok(rusqlite::types::ValueRef::Blob(_)) => serde_json::Value::Null,
                        Err(_) => serde_json::Value::Null,
                    };
                    m.insert(c.clone(), v);
                }
                Ok(serde_json::Value::Object(m))
            })
            .map_err(|e| format!("导出 {} 失败: {}", table, e))?
            .filter_map(|r| r.ok())
            .collect::<Vec<_>>();
        out.insert(table.to_string(), serde_json::Value::Array(rows));
    }
    let value = serde_json::Value::Object(out);
    match password {
        // 密码仅用于内存中的密钥派生，绝不落盘/入日志
        Some(p) if !p.is_empty() => {
            let payload = serde_json::to_vec(&value).map_err(|e| format!("导出序列化失败: {}", e))?;
            encrypt_backup(&payload, &p)
        }
        // 未提供密码：原样返回，保持与旧版导出格式字节级一致
        _ => Ok(value),
    }
}

/// 导入全量备份：事务内逐表「清空 + 插入」（INSERT OR REPLACE）。
/// 仅接受白名单表；行内列名按 JSON key 动态映射，跳过 user_id（本地无用户隔离）。
/// 若备份为加密包装（"encrypted": true），必须提供 password 才能解密导入；
/// 若备份未加密则忽略 password，行为与旧版一致。
#[tauri::command]
pub async fn data_import_all(
    state: State<'_, AppState>,
    data: serde_json::Value,
    password: Option<String>,
) -> Result<i32, String> {
    let data = unwrap_backup(data, password.as_deref())?;
    let obj = data.as_object().ok_or_else(|| "备份数据格式错误".to_string())?;
    let db = state.db.lock().await;
    // 备份是导出时的快照，可能含悬空外键（如子任务引用已删除的任务）。
    // 导入期间关闭外键检查，忠实还原备份内容；否则单行失败会回滚整个事务。
    // 另外 serde_json 的 Object 是 BTreeMap（字母序），遍历 obj 会按字母序插入，
    // 导致 budgets（引用 categories）先于 categories 被插入——所以必须显式按
    // BACKUP_TABLES 顺序导入。
    db.pragma_update(None, "foreign_keys", "OFF")
        .map_err(|e| format!("关闭外键检查失败: {}", e))?;
    let result = (|| {
        let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
        // 先按子表优先顺序清空（含断开自引用），避免逐表 DELETE 顺序不当触发外键失败
        tx.execute("UPDATE categories SET parent_id = NULL", [])
            .map_err(|e| format!("断开 categories 自引用失败: {}", e))?;
        tx.execute("UPDATE note_folders SET parent_id = NULL", [])
            .map_err(|e| format!("断开 note_folders 自引用失败: {}", e))?;
        for table in CLEAR_ORDER {
            tx.execute(&format!("DELETE FROM \"{}\"", table), [])
                .map_err(|e| format!("清空 {} 失败: {}", table, e))?;
        }
        let mut total = 0i32;
        // 显式按 BACKUP_TABLES 顺序（父表在子表前），不依赖 JSON key 顺序
        for table in BACKUP_TABLES {
            let Some(rows) = obj.get(*table).and_then(|v| v.as_array()) else { continue };
            let safe_table = sanitize_ident(table);
            for row in rows {
                let o = row.as_object().ok_or_else(|| format!("{} 行数据格式错误", table))?;
                // 列名 = JSON key（排除 user_id），并做标识符净化
                let cols: Vec<String> = o
                    .keys()
                    .filter(|c| *c != "user_id")
                    .map(|c| sanitize_ident(c))
                    .collect();
                if cols.is_empty() {
                    continue;
                }
                let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("?{}", i)).collect();
                let col_list = cols.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(", ");
                let sql = format!(
                    "INSERT OR REPLACE INTO \"{}\" ({}) VALUES ({})",
                    safe_table,
                    col_list,
                    placeholders.join(", ")
                );
                let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
                for c in &cols {
                    let v = o.get(c).unwrap_or(&serde_json::Value::Null);
                    match v {
                        serde_json::Value::Null => params.push(Box::new(None::<String>)),
                        serde_json::Value::String(s) => params.push(Box::new(s.clone())),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() {
                                params.push(Box::new(i));
                            } else if let Some(f) = n.as_f64() {
                                params.push(Box::new(f));
                            } else {
                                params.push(Box::new(n.to_string()));
                            }
                        }
                        serde_json::Value::Bool(b) => params.push(Box::new(*b as i64)),
                        // JSON 对象/数组列（notes.content、tasks.recurrence_rule 等）序列化存储
                        serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                            params.push(Box::new(v.to_string()));
                        }
                    }
                }
                tx.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))
                    .map_err(|e| format!("导入 {} 行失败: {}", table, e))?;
                total += 1;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(total)
    })();
    // 无论成败都恢复外键检查
    let _ = db.pragma_update(None, "foreign_keys", "ON");
    result
}

/// 解开备份负载：若为加密包装（"encrypted": true）则用密码解密出内层 JSON；
/// 否则原样返回并忽略 password（保持旧版行为）。
fn unwrap_backup(data: serde_json::Value, password: Option<&str>) -> Result<serde_json::Value, String> {
    let is_encrypted = data
        .get("encrypted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !is_encrypted {
        return Ok(data);
    }
    let obj = data
        .as_object()
        .ok_or_else(|| "备份格式错误".to_string())?;
    let pwd = password
        .filter(|p| !p.is_empty())
        .ok_or_else(|| "该备份已加密，请提供密码后重试".to_string())?;
    decrypt_backup(obj, pwd)
}

/// 加密备份负载：随机盐 + Argon2id 派生 32 字节密钥，AES-256-GCM 加密，
/// 返回包装 JSON { version, encrypted, kdf, salt, nonce, data }。
/// data 为 base64 的「密文 + 16 字节认证标签」。
fn encrypt_backup(payload: &[u8], password: &str) -> Result<serde_json::Value, String> {
    // 盐与 nonce 均为每次导出随机生成，保证同一密码每次密文不同
    let mut salt = [0u8; BACKUP_SALT_LEN];
    rand::rng().fill_bytes(&mut salt);
    let mut nonce_bytes = [0u8; BACKUP_NONCE_LEN];
    rand::rng().fill_bytes(&mut nonce_bytes);

    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let nonce = Nonce::from_slice(&nonce_bytes);
    // encrypt 输出 = 密文 + 16 字节 GCM 认证标签（由 aes-gcm 自动追加）
    let ciphertext = cipher
        .encrypt(nonce, payload)
        .map_err(|_| "备份加密失败".to_string())?;

    let b64 = base64::engine::general_purpose::STANDARD;
    Ok(serde_json::json!({
        "version": BACKUP_WRAPPER_VERSION,
        "encrypted": true,
        "kdf": "argon2id",
        "salt": b64.encode(salt),
        "nonce": b64.encode(nonce_bytes),
        "data": b64.encode(ciphertext),
    }))
}

/// 解密加密备份包装 JSON，返回内层明文 JSON。
/// 认证标签校验失败（密码错误或文件损坏）会在此统一报错。
fn decrypt_backup(
    obj: &serde_json::Map<String, serde_json::Value>,
    password: &str,
) -> Result<serde_json::Value, String> {
    let version = obj
        .get("version")
        .and_then(|v| v.as_i64())
        .ok_or_else(|| "备份格式不受支持".to_string())?;
    if version != BACKUP_WRAPPER_VERSION {
        return Err(format!("不支持的备份版本: {}", version));
    }
    let b64 = base64::engine::general_purpose::STANDARD;
    let salt = obj
        .get("salt")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "备份缺少 salt".to_string())
        .and_then(|s| b64.decode(s).map_err(|e| format!("salt 解码失败: {}", e)))?;
    let nonce = obj
        .get("nonce")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "备份缺少 nonce".to_string())
        .and_then(|s| b64.decode(s).map_err(|e| format!("nonce 解码失败: {}", e)))?;
    if nonce.len() != BACKUP_NONCE_LEN {
        return Err("备份格式不受支持".to_string());
    }
    let ciphertext = obj
        .get("data")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "备份缺少加密数据".to_string())
        .and_then(|s| b64.decode(s).map_err(|e| format!("加密数据解码失败: {}", e)))?;

    let key = derive_key(password, &salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "解密失败：密码错误或备份已损坏".to_string())?;

    serde_json::from_slice(&plaintext).map_err(|e| format!("备份 JSON 解析失败: {}", e))
}

/// 用 Argon2id 从密码派生 32 字节加密密钥（仅存在于内存，使用后随栈帧丢弃）。
fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; BACKUP_KEY_LEN], String> {
    let mut key = [0u8; BACKUP_KEY_LEN];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("密钥派生失败: {}", e))?;
    Ok(key)
}

/// 标识符净化：移除引号与语句分隔符，防注入。
fn sanitize_ident(name: &str) -> String {
    name.replace('"', "").replace('\'', "").replace(";", "").replace("--", "")
}

/// 清空全部业务表（Settings「清除所有数据」）。
/// 删除顺序子表优先，并先断开自引用，避免外键约束失败。
#[tauri::command]
pub async fn data_clear_all(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().await;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    // 自引用列先断开（无 ON DELETE CASCADE，父行未删时子行引用会违反外键）
    tx.execute("UPDATE categories SET parent_id = NULL", [])
        .map_err(|e| format!("断开 categories 自引用失败: {}", e))?;
    tx.execute("UPDATE note_folders SET parent_id = NULL", [])
        .map_err(|e| format!("断开 note_folders 自引用失败: {}", e))?;
    for table in CLEAR_ORDER {
        tx.execute(&format!("DELETE FROM \"{}\"", table), [])
            .map_err(|e| format!("清空 {} 失败: {}", table, e))?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 收据本地存储（记账模块 receipt-photos 本地化）
// ---------------------------------------------------------------------------

/// 保存收据图片到应用数据目录 receipts/，返回净化后的文件名（存于 receipt_url 字段）。
#[tauri::command]
pub async fn receipt_save(
    app: AppHandle,
    data_base64: String,
    filename: String,
) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.trim())
        .map_err(|e| format!("图片数据解码失败: {}", e))?;
    let safe_name = sanitize_ident(&filename);
    if safe_name.is_empty() || !safe_name.contains('.') {
        return Err("文件名不合法".to_string());
    }
    let dir = app
        .state::<crate::DataRoot>()
        .0
        .join("receipts");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建收据目录失败: {}", e))?;
    let path = dir.join(&safe_name);
    std::fs::write(&path, bytes).map_err(|e| format!("保存收据失败: {}", e))?;
    Ok(safe_name)
}

/// 用系统默认程序打开本地收据文件。
#[tauri::command]
pub async fn receipt_open(app: AppHandle, filename: String) -> Result<(), String> {
    let safe_name = sanitize_ident(&filename);
    let path = app
        .state::<crate::DataRoot>()
        .0
        .join("receipts")
        .join(&safe_name);
    if !path.exists() {
        return Err("收据文件不存在".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("打开收据失败: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开收据失败: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开收据失败: {}", e))?;
    }
    Ok(())
}
