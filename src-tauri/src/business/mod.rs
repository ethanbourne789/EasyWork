//! 本地优先（local-first）业务数据命令层。
//!
//! 任务/笔记/记账/日历全部 CRUD 直接读写本地 SQLite（`AppState.db`），
//! 不再依赖 Supabase。输出结构与前端 `src/types/index.ts` 保持字段一致
//! （金额以「元」浮点数、布尔以 bool、JSON 字段以 serde_json::Value 返回）。
//! 本地无用户隔离概念，`user_id` 统一返回空字符串以兼容前端类型。

pub mod auth;
pub mod backup;
pub mod calendar;
pub mod finance;
pub mod notes;
pub mod tasks;

pub use auth::*;
pub use backup::*;
pub use calendar::*;
pub use finance::*;
pub use notes::*;
pub use tasks::*;

// ---------------------------------------------------------------------------
// 共享辅助
// ---------------------------------------------------------------------------

pub(super) fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub(super) fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub(super) fn cents_to_yuan(cents: i64) -> f64 {
    cents as f64 / 100.0
}

pub(super) fn int_to_bool(v: i64) -> bool {
    v != 0
}

pub(super) fn parse_json_or(s: &str) -> serde_json::Value {
    serde_json::from_str(s).unwrap_or(serde_json::Value::Null)
}
