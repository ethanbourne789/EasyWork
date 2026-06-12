pub mod schema;
pub mod ops;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub type DbPool = Pool<SqliteConnectionManager>;

/// Notes/calendar/task 等模块使用的本地连接状态。
/// 内部直接持有一个 `Mutex<Connection>`，由命令函数 `state.0.lock()` 取得锁。
/// 邮件模块使用 `DbPool`（r2d2 池）；此类型与池互不干扰。
pub struct DbState(pub Mutex<Connection>);

impl DbState {
    pub fn new(conn: Connection) -> Self {
        DbState(Mutex::new(conn))
    }
}

pub fn init_db(app_data_dir: &PathBuf) -> Result<DbPool, Box<dyn std::error::Error>> {
    let db_dir = app_data_dir.join("easywork");
    std::fs::create_dir_all(&db_dir)?;
    let db_path = db_dir.join("mail.db");

    log::info!("Initializing database at {}", db_path.display());

    let manager = SqliteConnectionManager::file(&db_path)
        .with_init(|conn| {
            // Set PRAGMAs on every connection from the pool,
            // not just the initial connection used for schema creation.
            conn.execute_batch(
                "PRAGMA foreign_keys = ON;
                 PRAGMA journal_mode = WAL;
                 PRAGMA busy_timeout = 5000;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA cache_size = -8000;"
            ).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
            Ok(())
        });
    let pool = Pool::builder()
        .max_size(8)
        .build(manager)?;

    let conn = pool.get()
        .map_err(|e| {
            log::error!("DB pool get() failed: {}", e);
            e
        })?;

    schema::create_tables(&conn).map_err(|e| {
        log::error!(
            "Schema migration failed at {}: {}. \
             If you are upgrading from an older version, delete {} and restart.",
            db_path.display(), e, db_path.display(),
        );
        e
    })?;

    log::info!("Database ready: {}", db_path.display());
    Ok(pool)
}
