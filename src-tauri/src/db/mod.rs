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

    let manager = SqliteConnectionManager::file(&db_path);
    let pool = Pool::builder()
        .max_size(8)
        .build(manager)?;

    let conn = pool.get()?;
    schema::create_tables(&conn)?;

    log::info!("Mail database initialized at {:?}", db_path);
    Ok(pool)
}
