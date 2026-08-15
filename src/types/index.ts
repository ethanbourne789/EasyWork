export interface TiptapJSON {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapJSON[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

// 任务管理类型
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date?: string;
  recurrence_rule?: RecurrenceRule;
  recurrence_next?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  end_date?: string;
}

export interface Subtask {
  id: string;
  task_id: string;
  user_id: string;
  title: string;
  done: boolean;
  sort_order: number;
  created_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color?: string;
  created_at: string;
}

export interface TaskTag {
  id: string;
  task_id: string;
  tag_id: string;
}

// 日历类型
/** local=本地创建可编辑；ics/dingtalk=订阅同步而来，前端只读 */
export type CalendarEventSource = 'local' | 'ics' | 'dingtalk';
/** ics=通用订阅链接；dingtalk_caldav=钉钉日历；caldav=其他 CalDAV 服务 */
export type CalendarProvider = 'ics' | 'dingtalk_caldav' | 'caldav';

export interface CalendarEvent {
  id: string;
  user_id: string;
  subscription_id?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  /** ISO 时间戳（timestamptz） */
  start_at: string;
  end_at: string;
  all_day: boolean;
  color?: string | null;
  source: CalendarEventSource;
  external_uid?: string | null;
  organizer?: string | null;
  reminder_minutes?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarSubscription {
  id: string;
  user_id: string;
  name: string;
  provider: CalendarProvider;
  /** ICS 订阅地址，或 CalDAV 服务器地址（钉钉为 https://calendar.dingtalk.com） */
  url: string;
  username?: string | null;
  password?: string | null;
  color: string;
  enabled: boolean;
  last_synced_at?: string | null;
  last_error?: string | null;
  event_count: number;
  created_at: string;
  updated_at: string;
}

// 记账类型
export type AccountType = 'cash' | 'bank' | 'credit';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type CategoryType = 'income' | 'expense';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  initial_balance: number;
  currency: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: CategoryType;
  icon?: string;
  parent_id?: string | null;
  sort_order: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  account_id: string;
  to_account_id?: string;
  category_id?: string;
  date: string;
  note?: string;
  receipt_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  amount: number;
  year_month: number;
  scope: 'category' | 'overall';
  carry_over: number;
  created_at: string;
  updated_at: string;
}

// 笔记类型
export interface NoteFolder {
  id: string;
  user_id: string;
  name: string;
  parent_id?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  folder_id?: string;
  title: string;
  content: any; // Tiptap JSON
  content_text?: string;
  is_pinned: boolean;
  cover_url?: string;
  created_at: string;
  updated_at: string;
}

export interface NoteTag {
  id: string;
  user_id: string;
  name: string;
  color?: string;
  created_at: string;
}

export interface NoteNoteTag {
  id: string;
  note_id: string;
  tag_id: string;
}

// 邮箱类型
// 注意：字段名与 Rust 后端 types.rs 保持一致（snake_case），由 Tauri IPC 直接反序列化。
// 移除了 user_id（Tauri 本地模式无用户隔离）、password（凭证存 keyring，不暴露给前端）、
// last_synced_uid（后端只保留 last_synced_at）、attachments 内嵌字段（改为独立查询）。
export interface EmailAccount {
  id: string;
  email: string;
  display_name: Option<string>;
  username: Option<string>;
  /** keyring 凭证引用键，前端不应直接使用 */
  credential_ref: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  use_ssl: boolean;
  /** 认证方式：password | oauth2 | xoauth2 */
  auth_type: string;
  /** 绑定的默认签名 id */
  signature_id: Option<string>;
  signature_auto_append_new: boolean;
  signature_auto_append_reply: boolean;
  last_synced_at: Option<string>;
  sync_enabled: boolean;
  /** 同步间隔（分钟） */
  sync_interval_mins: number;
  created_at: string;
  updated_at: string;
}

export interface EmailFolder {
  id: string;
  account_id: string;
  name: string;
  imap_path: string;
  parent_path: Option<string>;
  is_system: boolean;
  /** folder_type: inbox | sent | drafts | trash | spam | archive | custom */
  folder_type: string;
  sort_order: number;
  unread_count: number;
  total_count: number;
  created_at: string;
}

export interface Email {
  id: string;
  account_id: string;
  folder_id: Option<string>;
  message_id: Option<string>;
  uid: Option<number>;
  from_address: Option<string>;
  /** 逗号分隔的收件人字符串（后端存为单字段文本） */
  to_addresses: Option<string>;
  cc_addresses: Option<string>;
  subject: Option<string>;
  preview_text: Option<string>;
  body_text: Option<string>;
  body_html: Option<string>;
  has_attachments: boolean;
  is_read: boolean;
  is_starred: boolean;
  received_at: Option<string>;
  created_at: string;
  /** 统一收件箱视图下用于展示来源账户的冗余字段 */
  account_email: Option<string>;
  account_name: Option<string>;
}

export interface EmailAttachment {
  id: string;
  email_id: string;
  filename: Option<string>;
  mime_type: Option<string>;
  size: Option<number>;
  /** 本地缓存路径；为空字符串表示尚未按需从 IMAP 拉取 */
  file_path: string;
  is_inline: boolean;
  content_id: Option<string>;
  /** MIME part 编号（如 "1.2"），后端用于 IMAP 按需拉取 */
  part_id: Option<string>;
  /** true = 大附件待按需下载（同步时仅存元数据） */
  pending_download: boolean;
  created_at: string;
}

// 邮件模板和签名
export interface EmailTemplate {
  id: string;
  name: string;
  subject: Option<string>;
  body: Option<string>;
  created_at: string;
}

export interface EmailSignature {
  id: string;
  name: string;
  /** HTML 富文本签名内容 */
  html: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// 联系人（与 Rust 端 Contact / ContactGroup 保持一致）
export interface Contact {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  company: Option<string>;
  title: Option<string>;
  notes: Option<string>;
  group_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ContactGroup {
  id: string;
  name: string;
  sort_order: number;
  member_count: number;
  created_at: string;
  updated_at: string;
}

/** Rust SyncResult：邮件同步结果（error 为非致命错误聚合） */
export interface MailSyncResult {
  fetched: number;
  inserted: number;
  folders: number;
  error: Option<string>;
}

// 兼容 Rust Option<T> 序列化（serde 默认序列化为 null 或缺失）
type Option<T> = T | null;
