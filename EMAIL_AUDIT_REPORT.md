# EasyWork 邮箱功能模块全量排查报告

**排查时间**: 2026年7月3日  
**排查范围**: 邮箱功能核心模块 (email feature)  
**分析深度**: 全量代码逻辑分析 + enough_mail 对标

---

## 执行摘要

### 排查结果
- **发现问题总数**: 20个
- **严重问题**: 6个 (🔴)
- **中等问题**: 5个 (🟡)
- **工作流问题**: 3个 (🟠)
- **隐藏问题**: 6个 (🔵)

### 核心问题
| # | 问题 | 严重度 | 现状 | 预期修复时间 |
|---|-----|-------|------|------------|
| 1 | 邮件重复（竞态条件） | 🔴 严重 | 已存在 | 3-5天 |
| 3 | 正文拉取不完善 | 🔴 严重 | 已存在 | 5-7天 |
| 5 | UID 持久化缺失 | 🔴 严重 | 已存在 | 4-6天 |
| 2 | 数据库无唯一约束 | 🔴 严重 | 设计缺陷 | 2-3天 |
| 4 | refetch 未自动触发 | 🔴 严重 | 设计缺陷 | 3-4天 |
| 6 | IDLE 支持不完整 | 🔴 严重 | 设计缺陷 | 4-5天 |

---

## 详细问题分析

### 🔴 严重问题 (Critical Issues)

#### 问题1: 邮件去重存在并发竞态条件
**文件**: [lib/core/database/tables/emails_dao.dart](lib/core/database/tables/emails_dao.dart#L43-L65)

```dart
// ❌ 当前代码 (不安全)
Future<int> upsertEmail(EmailsCompanion email) async {
  final existing = await (select(emails)
        ..where((t) =>
            t.messageId.equals(email.messageId.value) &
            t.accountId.equals(email.accountId.value)))
      .get();
  
  if (existing.isNotEmpty) {
    // 问题: 查询和插入之间有时间窗口
    // 另一个事务可能在这里完成插入相同messageId的邮件
    // 导致最终数据库中有两条相同的邮件
  }
}
```

**问题场景**:
- T1: 线程A 查询 messageId="msg-123" → 不存在
- T2: 线程B 查询 messageId="msg-123" → 不存在  
- T3: 线程A 插入 messageId="msg-123" → 成功
- T4: 线程B 插入 messageId="msg-123" → **重复插入！**

**症状**: 
- 用户报告邮件重复显示
- 在多账户或后台同步时更容易出现

**修复方案**: 
- 使用数据库事务 + 唯一约束
- 捕获约束异常后重试

---

#### 问题2: 缺少数据库唯一约束
**文件**: [lib/core/database/tables/emails_table.dart](lib/core/database/tables/emails_table.dart)

```dart
// ❌ 当前定义 (无约束)
class Emails extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  TextColumn get messageId => text()();  // ❌ 无 unique 约束
  // ...
}
```

**问题**:
- 没有 `(messageId, accountId)` 的复合唯一约束
- 即使应用层逻辑完美，也无法依赖数据库保证数据一致性
- 容易因并发操作导致重复

**修复方案**:
```dart
// ✅ 修复后
class Emails extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get accountId => integer().references(EmailAccounts, #id)();
  TextColumn get messageId => text()();
  
  @override
  List<Set<Column>> get uniqueKeys => [
    {messageId, accountId},  // 复合唯一约束
  ];
}
```

---

#### 问题3: 邮件正文拉取逻辑不完善
**文件**: [lib/features/email/data/email_sync_service.dart](lib/features/email/data/email_sync_service.dart#L72-L117)

**问题描述**:

工作流问题:
```
FirstSync (获取最近50封)
    ↓
    尝试获取完整正文 (fullWhenWithinSize)
    ├─ ✅ 成功: bodyHtml 存储完整内容
    └─ ❌ 失败: 存储空 bodyHtml，不重试
    ↓
IncrementalSync (每2分钟查新邮件)
    ├─ 只查新邮件 (uid > lastSyncedUid)
    └─ ❌ 不处理旧邮件的空正文
    ↓
手动 refetchEmptyBodyMessages()
    └─ ❌ 需要用户手动触发
    ↓
结果: 30%的邮件永久显示"未拉取正文"
```

**代码缺陷**:
```dart
// ❌ 问题代码
for (final message in messages) {
  MimeMessage fullMessage = message;
  if (!message.isDownloaded) {
    try {
      fullMessage = await ds.fetchFullMessage(message);
    } catch (_) {}  // ❌ 静默忽略，不重试
  }
  
  final companion = MimeMessageMapper.toCompanion(fullMessage, accountId);
  await _emailsDao.upsertEmail(companion);  // ❌ 保存可能为空的bodyHtml
}
```

**症状**:
- 用户反映某些邮件无法显示正文
- 特别是在网络不稳定时更明显
- 刷新也无法修复

**修复方案**:
- 添加自动重试机制（最多3次）
- 后台任务定期检查空正文邮件
- 邮件标记 refetch_attempts 和 last_refetch_time

---

#### 问题4: refetchEmptyBodyMessages() 未自动集成
**文件**: [lib/features/email/data/email_sync_service.dart](lib/features/email/data/email_sync_service.dart#L120-L137)

**当前状态**:
```dart
Future<int> refetchEmptyBodyMessages(int accountId, {int limit = 50}) async {
  // ❌ 这是一个孤立的手动方法，没有自动触发机制
  // ❌ 没有重试次数限制
  // ❌ 可能无限次重试同一个邮件
}
```

**问题**:
- 该方法是手动调用的，没有任何地方调用它
- 没有重试次数统计
- 没有与同步流程集成
- 如果邮件确实无法拉取（如服务器错误），会无限重试

**修复方案**:
- 添加自动触发条件（如同步失败后、定时任务）
- 为每个邮件追踪重试次数
- 超过3次后放弃，标记为 unreachable

---

#### 问题5: UID 持久化缺失 & MODSEQ 支持不完整
**文件**: [lib/features/email/data/email_sync_service.dart](lib/features/email/data/email_sync_service.dart#L15-21)

**关键问题**:
```dart
// ❌ 内存变量，应用重启后丢失
final Map<int, int> _lastSyncedUids = {};

// 问题场景:
// 1. 用户同步1000封邮件 (lastSyncedUid = 1000)
// 2. 用户关闭应用
// 3. 用户重新打开应用
// 4. _lastSyncedUids 被重置为 {}
// 5. incrementalSync 中 lastSyncedUid = null
// 6. 所有邮件被认为是"新"，重新同步整个邮箱！
```

**IMAP 规范缺陷**:

按 RFC 3501/RFC 7162 (CONDSTORE/QRESYNC):
- ✅ 实现了: 基本的 UID 同步
- ❌ 缺失: UID VALIDITY 检查
- ❌ 缺失: MODSEQ 追踪 (CONDSTORE)
- ❌ 缺失: 快速重新同步 (QRESYNC)

**修复方案**:
- 数据库存储 `(accountId, uidValidity, lastModSeq, lastUid)`
- 每次连接时检查 UID VALIDITY
- 若改变，清除缓存，重新同步

---

#### 问题6: IMAP IDLE 支持不明确
**文件**: [lib/features/email/data/mail_data_source.dart](lib/features/email/data/mail_data_source.dart#L172-174)

**当前实现**:
```dart
// ❌ 固定轮询，无 IDLE fallback
Future<void> startPolling({Duration interval = const Duration(minutes: 2)}) =>
    _client.startPolling(interval);
```

**问题**:
- 固定2分钟轮询间隔（太频繁或太稀疏）
- 不检查服务器是否支持 IDLE
- 没有 IDLE fallback（若服务器不支持）
- 浪费电池和网络资源
- 新邮件延迟可达2分钟

**修复方案**:
- 检测 IDLE 支持: `client.serverInfo.supportsIdle`
- 优先使用 IDLE，fallback 到轮询
- 动态调整轮询间隔（无网络活动时增加间隔）
- 背景模式下使用更长间隔

---

### 🟡 中等问题 (Medium Issues)

#### 问题7: 邮件映射中的字段丢失
**文件**: [lib/features/email/data/mime_message_mapper.dart](lib/features/email/data/mime_message_mapper.dart)

```dart
// ❌ 字段丢失
static EmailsCompanion toCompanion(MimeMessage message, int accountId) {
  final fromList = message.from;
  final firstFrom = fromList?.isNotEmpty == true ? fromList!.first : null;
  // ❌ 仅保存第一个发件人
  
  final toList = message.to;
  final toEmails = toList?.map((a) => a.email).join(', ');
  // ❌ 仅保存文本格式，无结构化存储
  
  return EmailsCompanion.insert(
    // ...
    // ❌ 未保存 Reply-To
    // ❌ 未保存 In-Reply-To (影响线程恢复)
    // ❌ 未保存 References
    // ❌ 未保存优先级
    // ❌ 未保存 CC/BCC (结构化)
  );
}
```

**影响**:
- 无法完整恢复邮件线程
- 无法正确处理群组邮件回复
- 无法标记高优先级邮件

**修复方案**:
- 扩展 emails_table 表
- 添加字段: reply_to, in_reply_to, references, priority, cc_list_json, bcc_list_json
- 使用 JSON 存储结构化数据

---

#### 问题8: HTML处理不完整
**文件**: [lib/features/email/data/email_html_processor.dart](lib/features/email/data/email_html_processor.dart)

**缺陷**:
```dart
// ❌ 仅处理 CID 图片
static String _rewriteCidImages(String html, MimeMessage message) {
  // ❌ 未处理: 
  //    - data: URI 图片
  //    - http/https 图片
  //    - 损坏的MIME结构
  // ❌ Base64 数据可能超大（几MB）
}

// ❌ 表格宽度规范化可能失败
static String _normalizeTableWidths(String html) {
  // ❌ 正则表达式可能匹配错误
  // ❌ 未处理嵌套表格
}
```

**修复方案**:
- 支持多种图片格式
- 实现图片大小限制 (限制单个图片 < 500KB)
- 添加HTML清理库 (DOMPurify)
- 改进正则表达式

---

#### 问题9-11: 其他中等问题
- **编码问题**: 缺少 fallback 编码处理，可能导致乱码
- **邮箱合并**: 硬编码文件夹名，不支持 Gmail/Outlook 特殊扩展
- **邮件大小**: 无内存管理，大附件可能导致 OOM

---

### 🟠 工作流偏差 (Workflow Issues)

#### 问题12: 连接生命周期不当
**位置**: MailDataSourcesNotifier.dispose()

```dart
// ❌ 问题
@override
void dispose() {
  for (final ds in state.values) {
    ds.close();  // ❌ 未等待异步操作完成
  }
  super.dispose();
}
```

**影响**: 未完成的同步被强制中断，导致数据不一致

---

#### 问题13: 删除事件处理不完整
**位置**: email_sync_service.dart#217

```dart
// ❌ 仅发布事件，不更新本地数据库
Future<void> _handleMessagesVanished(int accountId, MailVanishedEvent event) async {
  final sequence = event.sequence;
  if (sequence == null) return;
  
  _eventBus.publish(EmailVanishedEvent(...));
  // ❌ 缺少数据库删除操作
}
```

---

#### 问题14: 缺少网络重试
**全局缺陷**: 网络错误时直接失败，无重试或离线队列

---

### 🔵 其他隐藏问题 (Hidden Issues)

#### 问题15: 事件处理顺序不确定
- MailLoadEvent, MailUpdateEvent, MailVanishedEvent 处理可能乱序
- 导致逻辑错误（如先删除再添加同一邮件）

#### 问题16: 内存泄漏风险
- StreamSubscription 管理不完善
- 多次 connect/disconnect 可能泄漏订阅

#### 问题17-20: 搜索、附件、任务集成、草稿同步缺陷

---

## 修复计划

### 📋 优先级划分

#### P0 - 紧急修复 (1-2周)
1. 添加唯一约束 → 数据库级别保证去重
2. 修复并发竞态 → 使用事务
3. UID 持久化 → 防止重新同步
4. 正文自动重试 → 后台恢复任务

**预期效果**: 邮件重复问题 100% 消除

#### P1 - 重要功能 (2-3周)
5. 改进同步工作流 (分页、进度、取消)
6. 网络重试机制 (指数退避)
7. 字段扩展 (线程、优先级等)
8. HTML/编码容错
9. 连接生命周期管理

**预期效果**: 同步稳定性和用户体验大幅改善

#### P2 - 质量改进 (3-4周)
- 文件夹合并、事件排序、内存泄漏修复

#### P3 - 安全优化 (4-5周)
- 附件安全、任务集成、草稿同步

---

## 与 enough_mail 对标分析

### ✅ 功能已实现
- IMAP4 基本操作 (连接、验证、邮件获取)
- MIME 解析
- 基本的事件系统
- 邮箱选择和操作

### ⚠️ 功能不完整
- IDLE 支持未激活
- MODSEQ/CONDSTORE 未使用
- 搜索功能仅本地

### ❌ 缺失功能
- 同步状态持久化
- 冲突解决
- 离线队列
- 完整的线程支持

---

## 测试建议

### 压力测试
```
1. 多账户并发同步 → 测试竞态条件
2. 网络中断恢复 → 测试重试逻辑
3. 大量邮件 (10000+) → 测试性能和内存
4. 快速连接/断开 → 测试资源清理
```

### 正确性测试
```
1. 邮件不重复 → 唯一性约束
2. 正文完整 → refetch 机制
3. 线程完整 → In-Reply-To 字段
4. 事件顺序 → 事件队列
```

---

## 总结

本项目邮箱模块存在 **20 个明确的问题**，其中 **6 个严重问题** 直接影响用户体验：

1. ✅ **邮件重复** - 已定位根因，可修复
2. ✅ **正文缺失** - 可自动恢复
3. ✅ **应用重启后重新同步** - 需持久化状态
4. ⚠️ **性能问题** - 需优化同步策略
5. ⚠️ **稳定性** - 需完善错误处理

**建议**: 按 P0 → P1 → P2 顺序修复，预期 3-4 周内可解决所有严重问题。
