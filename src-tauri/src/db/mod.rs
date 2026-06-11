pub mod schema;
pub mod ops;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use std::path::PathBuf;

pub type DbPool = Pool<SqliteConnectionManager>;

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
