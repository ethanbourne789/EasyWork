# 联系人模块去账户化 — 对比方案文档

- 日期：2026-06-12
- 模块：app-mail（邮箱）
- 状态：**对比文档，待用户最终确认**。未触动任何代码。
- 目的：在动手前，明确把联系人从「按账户隔离」改为「全局共享」的所有接触点、迁移方案与潜在后果。

---

## 1. 设计变更概述

### 1.1 旧逻辑（现状）

- `mail_contacts.account_id` 强外键到 `mail_accounts(id)`，`ON DELETE CASCADE`。
- `mail_contact_groups.account_id` 同上。
- 唯一约束：`(account_id, email)`。
- 删除一个邮箱账户 → 该账户下联系人、分组、邮件一锅端（见 [ops.rs:164](file:///e:/Dev/EasyWork/src-tauri/src/db/ops.rs#L164)）。
- 联系人 = 某个账户的"私人通讯录"。

### 1.2 新逻辑（拟改）

- 联系人 = **全局共享**，与具体邮箱账户脱钩。
- `account_id` 字段在两表中保留为**可空**（`NULL` 表示"通用联系人"），不作为外键约束。
- 删除账户时，联系人 / 分组**不受影响**。
- 唯一约束改为 `UNIQUE(email COLLATE NOCASE)`（按 email 全局唯一）。
- 仍可在 `app-mail` 模块入口访问；不抽离为独立微应用。

### 1.3 一句话结论

> 联系人不再"属于"某个邮箱账户；账户只是"知道这个 email、与之有邮件往来"的渠道之一。联系人本身是独立实体。

---

## 2. 数据模型对比

### 2.1 `mail_contacts` 表

| 字段 | 旧 | 新 | 说明 |
| --- | --- | --- | --- |
| `id` | `INTEGER PK` | 同 | 不变 |
| `account_id` | `INTEGER NOT NULL` 外键 CASCADE | `INTEGER`（可空，无外键） | 不再约束；保留列以兼容历史数据 |
| `name` | `TEXT NOT NULL` | 同 | |
| `email` | `TEXT NOT NULL` | 同 | |
| `phone` | `TEXT` | 同 | |
| `group_id` | `INTEGER` → `mail_contact_groups(id) ON DELETE SET NULL` | 同 | |
| `display_name` | `TEXT` | 同 | |
| `notes` | `TEXT` | 同 | |
| 唯一约束 | `(account_id, email)` | `email` (COLLATE NOCASE) | 全局唯一 |
| 索引 | `idx_mail_contacts_account_id` `idx_mail_contacts_group_id` `idx_mail_contacts_email` | 删除 `account_id` 索引 | |

### 2.2 `mail_contact_groups` 表

| 字段 | 旧 | 新 | 说明 |
| --- | --- | --- | --- |
| `id` | `INTEGER PK` | 同 | |
| `account_id` | `INTEGER NOT NULL` 外键 CASCADE | `INTEGER`（可空，无外键） | |
| `name` | `TEXT NOT NULL` | 同 | |
| `color` | `TEXT` | 同 | |
| `sort_order` | `INTEGER` | 同 | |
| 唯一约束 | `(account_id, name)` | `name` (COLLATE NOCASE) | |
| 索引 | `idx_mail_contact_groups_account_id` | 删除 | |

### 2.3 Rust 类型

```rust
// MailContact（[models.rs:113-128](file:///e:/Dev/EasyWork/src-tauri/src/mail/models.rs#L113-L128)）
pub struct MailContact {
    pub id: Option<i64>,
    pub account_id: Option<i64>,   // ← i64 → Option<i64>，语义变弱
    pub name: String,
    pub email: String,
    pub phone: String,
    pub group_id: Option<i64>,
    pub display_name: String,
    pub notes: String,
}

// MailContactGroup（[models.rs:131-139](file:///e:/Dev/EasyWork/src-tauri/src/mail/models.rs#L131-L139)）
pub struct MailContactGroup {
    pub id: Option<i64>,
    pub account_id: Option<i64>,   // ← i64 → Option<i64>
    pub name: String,
    pub color: String,
    pub sort_order: i32,
}
```

---

## 3. 迁移策略（用户已选：全表合并 + 全局去重 email）

> **实施时机**：放在 `src-tauri/src/db/migrations/V5__contacts_global.sql`（新建），由 `schema.rs` 的 `migrate_contacts_to_global()` 函数负责调度，参照现有的 v3 / v4 写法。

### 3.1 联系人合并

```sql
-- 1. 收集重复 email，保留 id 最小的那条
-- 2. 把重复行的 group_id / display_name / phone / notes "合并" 到主行（取非空值）
-- 3. 把 to_list / cc_list / from_email 历史邮件关联转移到主行（实际上 mail_messages 不存 contact_id，所以无需改）
-- 4. 删除非主行的重复联系人
```

合并规则：

| 字段 | 合并策略 |
| --- | --- |
| `id` | 保留最小 id |
| `name` | 取最长非空值（优先中文 / 英文，按字符长度） |
| `phone` | 任一非空则保留，多个则用 `;` 拼接 |
| `group_id` | 任一非空则保留 |
| `display_name` | 同 `name` |
| `notes` | `;` 拼接去重 |
| `account_id` | 置 `NULL`（不再属于任何账户） |
| `created_at` | 保留最早 |

### 3.2 分组合并

按 `LOWER(name)` 全局唯一；重复 name 合并到一个分组，被合并分组的联系人 `group_id` 重映射到主分组，最后删除重复分组。

### 3.3 V5 迁移流程

```text
事务 BEGIN
├─ 检查 schema 版本（PRAGMA user_version = 4？或新建 config 表）
├─ 备份 mail_contacts / mail_contact_groups 到 mail_contacts_bak_v5
├─ 联系人合并（见 3.1）
├─ 分组合并（见 3.2）
├─ 删除 idx_mail_contacts_account_id / idx_mail_contact_groups_account_id
├─ 删除唯一索引 idx_mail_contacts_account_email
├─ 新建唯一索引 idx_mail_contacts_email_unique ON mail_contacts(email COLLATE NOCASE)
├─ 新建唯一索引 idx_mail_contact_groups_name_unique ON mail_contact_groups(name COLLATE NOCASE)
├─ 改 account_id 为可空（SQLite 限制：不能直接 ALTER COLUMN；用表重建）
│   └─ CREATE TABLE mail_contacts_new (... account_id INTEGER);
│       INSERT INTO mail_contacts_new SELECT ... FROM mail_contacts;
│       DROP TABLE mail_contacts;
│       ALTER TABLE mail_contacts_new RENAME TO mail_contacts;
│       （mail_contact_groups 同理）
├─ PRAGMA foreign_keys = OFF（迁移期间，避免 CASCADE 误触发）
└─ COMMIT
```

> ⚠️ **SQLite 陷阱**：SQLite 的 `ALTER TABLE` 不支持改列类型/可空性。必须"建新表 → 复制 → 删旧 → 改名"四步走。重构期间务必关闭 `PRAGMA foreign_keys` 以免级联误删。

### 3.4 数据丢失风险

| 风险 | 概率 | 缓解 |
| --- | --- | --- |
| 同 email 不同账户下有不同的 `name`，合并时按"最长非空"启发式 | 中 | 备份表 `mail_contacts_bak_v5`；若用户回滚可恢复 |
| 历史 `account_id` 信息丢失（无法看到"这个联系人来自哪个账户"） | 高 | 写新表时把"曾经出现过的 account_id 列表"序列化到 `notes` 字段尾部，例如 ` [历史账户:1,2,3]` |
| 唯一索引重建过程中若中途失败 → DB 不一致 | 低 | 事务包裹；失败自动 rollback；备份表兜底 |

---

## 4. Rust 命令签名变更

> 见 [commands/mail.rs:828-927](file:///e:/Dev/EasyWork/src-tauri/src/commands/mail.rs#L828-L927) 与 [db/ops.rs:1285-1429](file:///e:/Dev/EasyWork/src-tauri/src/db/ops.rs#L1285-L1429)。

| 命令 | 旧签名 | 新签名 | 改动原因 |
| --- | --- | --- | --- |
| `add_contact(contact)` | 必传 `account_id: i64` | `account_id: Option<i64>`（可空） | 允许无账户 |
| `list_contacts()` | `account_id: i64`（必传） | `account_id: Option<i64>`（过滤可选） | 全局列表需要；为兼容保留可选 |
| `update_contact(contact)` | 同上 | 同上 | |
| `find_contact_by_email(email, account_id: Option<i64>)` | account_id 限定范围 | 移除 account_id 参数 | 全局查 |
| `list_contact_groups()` | `account_id: i64` | `account_id: Option<i64>` | |
| `add/update_contact_group(group)` | `account_id: i64` | `account_id: Option<i64>` | |

`delete_account()`（[ops.rs:142](file:///e:/Dev/EasyWork/src-tauri/src/db/ops.rs#L142)）改动：

```rust
// 旧：tx.execute("DELETE FROM mail_contacts WHERE account_id = ?1", ...);
// 新：注释说明"联系人已全局化，不在此处删除"
//     （保留 no-op 以避免破坏事务结构）
```

---

## 5. 前端改动清单

### 5.1 类型与 IPC

| 文件 | 改动 |
| --- | --- |
| [src/stores/mail-store.ts](file:///e:/Dev/EasyWork/src/stores/mail-store.ts) `MailContact` | `account_id: number` → `account_id: number \| null` |
| `MailContactGroup` | 同上 |
| [src/lib/mail-ipc.ts](file:///e:/Dev/EasyWork/src/lib/mail-ipc.ts) | `listContacts(accountId)` 改 `listContacts(accountId?)`；`findContactByEmail(email, accountId?)` 移除第二个参数；其它命令调整 |

### 5.2 UI 组件

| 文件 | 改动 |
| --- | --- |
| [src/components/ContactImportDialog.tsx](file:///e:/Dev/EasyWork/src/components/ContactImportDialog.tsx) | `accountId` prop 改为可选；不再做"按账户去重"而是"全局去重"；按钮在 `accountId === null` 时也启用（统一性更好） |
| [src/components/ContactPickerPanel.tsx](file:///e:/Dev/EasyWork/src/components/ContactPickerPanel.tsx) | 调用 `listContacts()` 不传账户；展示分组下拉改为全局分组 |
| [src/routes/email.tsx](file:///e:/Dev/EasyWork/src/routes/email.tsx) `ContactsModal` | `useEffect` 拉取逻辑改为无账户；VCF 导出按钮在无账户时仍可导出已有联系人 |

### 5.3 i18n

`contacts.importDialog.*` 不变。`account` 节点可能需要新增"全局通讯录"提示文本（视实际体验决定是否需要）。

---

## 6. 测试用例补充

### 6.1 Rust 单元测试（`db::ops`）

```rust
#[test]
fn test_v5_merges_duplicate_emails_across_accounts() {
    // 给定：account 1 有 alice@a.com，account 2 有 Alice <alice@a.com>
    // 期望：迁移后只剩一条，name = "Alice"（最长）
}

#[test]
fn test_v5_preserves_orphan_contacts_when_account_deleted() {
    // 给定：account 1 有 alice@a.com
    // 操作：调用 delete_account(1)
    // 期望：mail_contacts 中 alice@a.com 仍存在
}

#[test]
fn test_find_contact_by_email_returns_global_match() {
    // 给定：全局 alice@a.com
    // 操作：find_contact_by_email("alice@a.com")
    // 期望：Some(alice)，不再依赖 account_id
}
```

### 6.2 前端 Vitest

- `parseVcf` / `serializeVcf` 现有 40 个断言不变。
- 新增：`addContact(null)` 不抛错（账户可空时仍能插入）。
- 新增：`ContactImportDialog` 中重复检测对全局 email 生效。

---

## 7. 潜在后果与权衡

### 7.1 好处

- 跨账户使用同一联系人（如从个人邮箱写给客户，客户的 email + 名字 + 分组无需重新录入）。
- 删账户更安全，联系人数据不会"误删"。
- 联系人能服务于其他模块（sports 队员 / accounting 客户）的可能性被打开。

### 7.2 代价

- 同一 email 在不同账户下原本可能维护了不同 display_name / phone，合并后只保留一条 → 视觉上"信息合并"。
- `account_id` 信息不再可查（已合并到 notes，但非结构化）。
- 唯一约束变严格：以前"account 1 里有 alice@a.com，account 2 里也能有" → 现在只允许一条。
- 删除账户后，那些曾属于该账户的联系人**不会随账户消失**，需要在 UI 上提示用户"这些联系人已转入全局通讯录"。

### 7.3 风险点

- **SQLite 表重建**：涉及 mail_contacts / mail_contact_groups 全表复制，10k+ 联系人时迁移时间在 ms 级，可接受。
- **PRAGMA foreign_keys**：迁移期间必须 OFF，否则重建表时旧外键引用会触发 CASCADE。需在 `schema.rs` 加明确注释。
- **FTS5 / 触发器**：当前 `mail_fts` 与 `mail_messages` 联动，不涉及联系人表，无影响。

---

## 8. 实施任务拆分（预览，**尚未执行**）

> 完整 TDD 步骤将落在执行阶段的 `docs/superpowers/plans/2026-06-12-contacts-global-module.md`。

```
Task 1: 编写 V5 迁移 SQL 草案（草稿本文档第 3.3 节）
Task 2: 写失败测试：test_v5_merges_duplicate_emails_across_accounts
Task 3: 写失败测试：test_v5_preserves_orphan_contacts_when_account_deleted
Task 4: 实现 migrate_contacts_to_global() in schema.rs
Task 5: 改 MailContact / MailContactGroup 类型为 Option<i64>
Task 6: 改 11 个 Tauri 命令签名
Task 7: 改前端 MailContact 类型 + mail-ipc 签名
Task 8: 改 ContactImportDialog / ContactPickerPanel / ContactsModal
Task 9: tsc --noEmit + cargo check + cargo test + vitest 全绿
Task 10: 手动回归：VCF 导入导出 / 联系人 CRUD / 删账户
```

---

## 9. 待确认事项

- [ ] 联系人合并时 name 取"最长非空"，是否符合预期？还是优先取"中文" / "英文" / "display_name 非空优先"？
- [ ] 是否需要在 `notes` 字段保留历史 `account_id` 列表（"这个联系人曾被 N 个账户关联"）？还是彻底丢弃？
- [ ] `account_id` 字段保留可空 + 兼容列，是否有意义？还是直接 DROP COLUMN（更彻底，但需要更大改）？
- [ ] UI 是否需要新增"全局通讯录 vs 账户通讯录"两个视图（v1 暂时不做，但 v2 可能需要）？

---

## 10. 当前状态

- ✅ 切片 1：Rust schema 迁移 + 11 个 Tauri 命令 — 已完成
- ✅ 切片 2：VCF 工具 + 导入导出 UI — 已完成
- ⏸ 联系人去账户化：本文档（对比方案）— 待用户拍板
- ⏸ 后续：V5 迁移 + 类型调整 + 前端改动

**未触动任何代码**。等用户在第 9 节中确认决策后，再写执行计划并进入实施。
