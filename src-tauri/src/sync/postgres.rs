use tokio_postgres::{Client, NoTls};
use super::ConnectionTestResult;

/// PostgreSQL 连接封装结构体。
pub struct PgConnection {
    pub client: Client,
}

/// 建立 PostgreSQL 连接，使用系统 TLS 证书验证（rustls-platform-verifier）。
/// 如果连接字符串为空或无效，则返回错误信息。
pub async fn connect(connection_string: &str) -> Result<PgConnection, String> {
    // 构建使用系统 TLS 的连接器
    let tls = rustls_platform_verifier::builder()
        .unwrap_or_else(|e| {
            tracing::warn!("构建系统 TLS 失败: {}，降级使用 NoTls", e);
        })
        .map(|builder| builder.build())
        .ok();

    let (client, connection) = match tls {
        Some(tls_connector) => {
            tokio_postgres::connect(connection_string, tls_connector)
                .await
                .map_err(|e| format!("连接 PostgreSQL 失败（TLS）: {}", e))?
        }
        None => {
            tracing::warn!("TLS 不可用，使用无加密连接");
            tokio_postgres::connect(connection_string, NoTls)
                .await
                .map_err(|e| format!("连接 PostgreSQL 失败（无 TLS）: {}", e))?
        }
    };

    // 在后台任务中保持连接活跃
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            tracing::error!("PostgreSQL 连接后台错误: {}", e);
        }
    });

    Ok(PgConnection { client })
}

/// 测试 PostgreSQL 连接是否可用，带有 10 秒超时限制。
/// 返回 ConnectionTestResult，包含测试结果和消息。
pub async fn test_connection(connection_string: &str) -> ConnectionTestResult {
    match tokio::time::timeout(
        std::time::Duration::from_secs(10),
        connect(connection_string),
    ).await {
        Ok(Ok(pg_conn)) => {
            // 连接成功，尝试执行 SELECT 1 验证连接可用性
            match pg_conn.client.query_one("SELECT 1", &[]).await {
                Ok(_) => ConnectionTestResult {
                    success: true,
                    message: "连接成功".to_string(),
                },
                Err(e) => ConnectionTestResult {
                    success: false,
                    message: format!("连接测试失败: {}", e),
                },
            }
        }
        Ok(Err(e)) => ConnectionTestResult {
            success: false,
            message: format!("连接失败: {}", e),
        },
        Err(_) => ConnectionTestResult {
            success: false,
            message: "连接超时（10秒），请检查网络连接和数据库地址".to_string(),
        },
    }
}

/// 确保云端数据库 Schema 已初始化。如果表不存在，则调用 schema::init_cloud_schema 创建。
pub async fn ensure_schema(client: &Client) -> Result<(), String> {
    super::schema::init_cloud_schema(client).await
}
