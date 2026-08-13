# Edge Functions API 文档

本文档描述 EasyWork 项目的 Supabase Edge Functions 接口规范。

## 通用说明

### 基础信息
- **Base URL**: `https://<project-ref>.supabase.co/functions/v1`
- **认证**: 所有接口需要 Supabase JWT Token（通过 `Authorization: Bearer <token>` 传递）
- **Content-Type**: `application/json`
- **CORS**: 所有接口支持跨域请求

### 通用响应格式

**成功响应**:
```json
{
  "success": true,
  "data": { ... }
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "错误描述"
}
```

---

## 1. send-mail

发送邮件接口。

### 请求

**Endpoint**: `POST /send-mail`

**请求体**:
```typescript
{
  accountId: string;      // 邮箱账号 ID
  to: string;             // 收件人（逗号分隔）
  cc?: string;            // 抄送人（逗号分隔）
  subject: string;        // 邮件主题
  body: string;           // 邮件正文（HTML）
}
```

**示例**:
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/send-mail \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "abc-123",
    "to": "user@example.com",
    "subject": "测试邮件",
    "body": "<p>这是一封测试邮件</p>"
  }'
```

### 响应

**成功** (200):
```json
{
  "success": true,
  "email": {
    "id": "email-id",
    "subject": "测试邮件",
    "folder_id": "sent-folder-id"
  }
}
```

**失败** (400/500):
```json
{
  "success": false,
  "error": "SMTP 连接失败"
}
```

---

## 2. fetch-mail

拉取邮件接口（IMAP 同步）。

### 请求

**Endpoint**: `POST /fetch-mail`

**请求体**:
```typescript
{
  accountId?: string;     // 可选：指定账号，不传则同步所有账号
  scheduled?: boolean;    // 是否为定时任务触发
}
```

**示例**:
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/fetch-mail \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "scheduled": false }'
```

### 响应

**成功** (200):
```json
{
  "success": true,
  "result": {
    "synced": 15,
    "accounts": ["account-1", "account-2"]
  }
}
```

---

## 3. manage-folder

管理邮件文件夹（创建/重命名/删除）。

### 请求

**Endpoint**: `POST /manage-folder`

**请求体**:
```typescript
{
  action: "create" | "rename" | "delete";
  accountId?: string;     // 创建时必填
  folderId?: string;      // 重命名/删除时必填
  name?: string;          // 创建/重命名时必填
}
```

**示例 - 创建文件夹**:
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/manage-folder \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "accountId": "abc-123",
    "name": "工作邮件"
  }'
```

### 响应

**成功** (200):
```json
{
  "success": true,
  "folder": {
    "id": "folder-id",
    "name": "工作邮件",
    "imap_path": "工作邮件"
  }
}
```

---

## 4. sync-calendar

同步日历订阅（CalDAV/ICS）。

### 请求

**Endpoint**: `POST /sync-calendar`

**请求体**:
```typescript
{
  subscriptionId?: string;  // 可选：指定订阅，不传则同步所有订阅
}
```

**示例**:
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/sync-calendar \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 响应

**成功** (200):
```json
{
  "success": true,
  "result": {
    "synced": 3,
    "subscriptions": ["sub-1", "sub-2"]
  }
}
```

---

## 数据库 RPC 函数

### unread_email_counts

计算每个文件夹的未读邮件数。

**调用方式**:
```typescript
const { data } = await supabase.rpc('unread_email_counts');
```

**返回**:
```typescript
Array<{
  folder_id: string;
  unread_count: number;
}>
```

---

## 错误码说明

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权（JWT 无效或过期） |
| 403 | 禁止访问（RLS 拒绝） |
| 500 | 服务器内部错误 |

---

## 速率限制

- 单个用户每分钟最多调用 60 次 Edge Functions
- 邮件发送接口每分钟最多 10 次（防滥用）

---

## 更新日志

- **2026-08-12**: 初始版本
