use rusqlite::params;
use serde::Serialize;
use tauri::State;

use argon2::Argon2;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};

use crate::commands::AppState;

use super::{new_id, now};

// ---------------------------------------------------------------------------
// 本地认证（local-first，替代 Supabase Auth）
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct AuthUserOut {
    pub id: String,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_data: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_auth_user(row: &rusqlite::Row) -> rusqlite::Result<AuthUserOut> {
    Ok(AuthUserOut {
        id: row.get(0)?,
        email: row.get(1)?,
        display_name: row.get(2)?,
        avatar_data: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

const AUTH_USER_COLS: &str = "id,email,display_name,avatar_data,created_at,updated_at";

/// 注册本地账号（邮箱唯一，argon2 哈希密码）。注册成功即返回用户信息，由前端自动登录。
#[tauri::command]
pub async fn auth_register(
    state: State<'_, AppState>,
    email: String,
    password: String,
    display_name: Option<String>,
) -> Result<AuthUserOut, String> {
    let email = email.trim().to_lowercase();
    if !email.contains('@') {
        return Err("邮箱格式不正确".to_string());
    }
    if password.len() < 6 {
        return Err("密码长度至少 6 位".to_string());
    }
    let salt = argon2::password_hash::SaltString::generate(
        &mut argon2::password_hash::rand_core::OsRng,
    );
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("密码哈希失败: {}", e))?
        .to_string();

    let db = state.db.lock().await;
    let id = new_id();
    let ts = now();
    let result = db.execute(
        "INSERT INTO users (id,email,password_hash,display_name,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)",
        params![id, email, hash, display_name.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()), ts],
    );
    if let Err(e) = result {
        if e.to_string().contains("UNIQUE") {
            return Err("该邮箱已注册".to_string());
        }
        return Err(e.to_string());
    }
    db.query_row(&format!("SELECT {} FROM users WHERE id = ?1", AUTH_USER_COLS), params![id], |r| row_to_auth_user(r))
        .map_err(|e| e.to_string())
}

/// 本地账号密码登录。成功返回用户信息；失败返回中文错误。
#[tauri::command]
pub async fn auth_login(
    state: State<'_, AppState>,
    email: String,
    password: String,
) -> Result<AuthUserOut, String> {
    let email = email.trim().to_lowercase();
    let db = state.db.lock().await;
    let row: Option<(String, String)> = db
        .query_row(
            "SELECT id, password_hash FROM users WHERE email = ?1",
            params![email],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    let Some((id, hash)) = row else {
        return Err("邮箱或密码错误".to_string());
    };
    let parsed = argon2::password_hash::PasswordHash::new(&hash).map_err(|e| e.to_string())?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|_| "邮箱或密码错误".to_string())?;
    db.query_row(&format!("SELECT {} FROM users WHERE id = ?1", AUTH_USER_COLS), params![id], |r| row_to_auth_user(r))
        .map_err(|e| e.to_string())
}

/// 根据 id 获取本地用户（前端启动时恢复会话）。
#[tauri::command]
pub async fn auth_get_user(state: State<'_, AppState>, user_id: String) -> Result<AuthUserOut, String> {
    let db = state.db.lock().await;
    db.query_row(&format!("SELECT {} FROM users WHERE id = ?1", AUTH_USER_COLS), params![user_id], |r| row_to_auth_user(r))
        .map_err(|e| e.to_string())
}

/// 更新本地用户资料（显示名称 / 头像 base64 data URL）。
#[tauri::command]
pub async fn auth_update_profile(
    state: State<'_, AppState>,
    user_id: String,
    display_name: Option<String>,
    avatar_data: Option<String>,
    clear_avatar: Option<bool>,
) -> Result<AuthUserOut, String> {
    let db = state.db.lock().await;
    // 头像有大小上限（约 2MB base64），防库膨胀
    if let Some(av) = &avatar_data {
        if av.len() > 2_800_000 {
            return Err("头像图片过大，请使用小于 2MB 的图片".to_string());
        }
    }
    let avatar_clause = if clear_avatar.unwrap_or(false) {
        "avatar_data = NULL"
    } else {
        "avatar_data = COALESCE(?3, avatar_data)"
    };
    let sql = format!(
        "UPDATE users SET display_name = COALESCE(?2, display_name), {}, updated_at = ?4 WHERE id = ?1",
        avatar_clause
    );
    db.execute(&sql, params![user_id, display_name, avatar_data, now()])
        .map_err(|e| e.to_string())?;
    db.query_row(&format!("SELECT {} FROM users WHERE id = ?1", AUTH_USER_COLS), params![user_id], |r| row_to_auth_user(r))
        .map_err(|e| e.to_string())
}

/// 修改本地账号密码（校验当前密码）。
#[tauri::command]
pub async fn auth_change_password(
    state: State<'_, AppState>,
    user_id: String,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    if new_password.len() < 6 {
        return Err("新密码长度至少 6 位".to_string());
    }
    let db = state.db.lock().await;
    let hash: String = db
        .query_row(
            "SELECT password_hash FROM users WHERE id = ?1",
            params![user_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let parsed = argon2::password_hash::PasswordHash::new(&hash).map_err(|e| e.to_string())?;
    Argon2::default()
        .verify_password(current_password.as_bytes(), &parsed)
        .map_err(|_| "当前密码不正确".to_string())?;
    let salt = argon2::password_hash::SaltString::generate(
        &mut argon2::password_hash::rand_core::OsRng,
    );
    let new_hash = Argon2::default()
        .hash_password(new_password.as_bytes(), &salt)
        .map_err(|e| format!("密码哈希失败: {}", e))?
        .to_string();
    db.execute(
        "UPDATE users SET password_hash = ?2, updated_at = ?3 WHERE id = ?1",
        params![user_id, new_hash, now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// 演示账号（"以演示账号进入"）：确保演示用户存在并返回，前端据此建立本地会话。
// 演示数据本身由前端 seedDemoData 在每次进入/打开时重新生成（日期相对 now），
// 因此本命令只负责"演示用户"这一身份，不触碰业务数据。
// ---------------------------------------------------------------------------

/// 演示账号固定邮箱与密码（前端 seedDemoData 直接登录，无需校验密码）。
const DEMO_EMAIL: &str = "demo@easywork.app";
const DEMO_PASSWORD: &str = "demo123456";

/// 确保演示账号存在（INSERT OR 忽略），返回该用户信息。
/// 供前端 `以演示账号进入` 建立本地会话；业务数据由前端另行播种。
#[tauri::command]
pub async fn demo_enter(state: State<'_, AppState>) -> Result<AuthUserOut, String> {
    let db = state.db.lock().await;
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE email = ?1)",
            params![DEMO_EMAIL],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if !exists {
        let salt = argon2::password_hash::SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
        let hash = Argon2::default()
            .hash_password(DEMO_PASSWORD.as_bytes(), &salt)
            .map_err(|e| format!("演示账号密码哈希失败: {}", e))?
            .to_string();
        let id = new_id();
        let ts = now();
        db.execute(
            "INSERT INTO users (id,email,password_hash,display_name,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?5)",
            params![id, DEMO_EMAIL, hash, "演示用户", ts],
        )
        .map_err(|e| e.to_string())?;
    }
    db.query_row(
        &format!("SELECT {} FROM users WHERE email = ?1", AUTH_USER_COLS),
        params![DEMO_EMAIL],
        |r| row_to_auth_user(r),
    )
    .map_err(|e| e.to_string())
}
