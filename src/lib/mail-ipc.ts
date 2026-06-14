import type { MailAccount, MailMessageSummary, MailContact, MailContactGroup } from "@/stores/mail-store"

export interface MailFolder {
  id: number | null
  account_id: number
  remote_id: string
  name: string
  role: string
  folder_type: string
}

export interface SendMailRequest {
  account_id: number
  to: string
  to_name?: string
  cc?: string
  bcc?: string
  subject: string
  body_text: string
  body_html?: string
  in_reply_to?: string
  references?: string[]
  /** Optional attachments: each item has filename, content_type, data_base64 (base64-encoded binary) */
  attachments?: { filename: string; content_type: string; data_base64: string }[]
}

export interface SendResult {
  success: boolean
  error: string | null
  /** Bug #8 fix: local id of the parent message (if this is a reply/forward). */
  linked_message_id: number | null
  /** Bug #8 fix: local id of the just-sent message. */
  new_message_id: number | null
}

export interface SyncResult {
  success: boolean
  folders_count: number
  messages_new: number
  messages_total: number
  /** Number of folders that could not be SELECTed (e.g. permission denied). */
  folders_skipped: number
  /** Number of messages that failed IMAP body parse. */
  messages_failed_parse: number
  /** Number of messages that failed DB insert. */
  messages_failed_insert: number
  error: string | null
}

export interface AttachmentInfo {
  id: number
  filename: string
  content_type: string
  size: number
  local_path: string
  content_id: string
}

export interface MessageHeaders {
  subject: string
  from_name: string
  from_email: string
  to_list: string
  message_id: string
}

// Check if Tauri API is available
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    console.warn(`Tauri not available, command "${cmd}" skipped`)
    throw new Error("Tauri not available")
  }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<T>(cmd, args)
}

// ==================== Accounts ====================

export async function addAccount(account: MailAccount): Promise<number> {
  return tauriInvoke<number>("add_account", { account })
}

export async function listAccounts(): Promise<MailAccount[]> {
  return tauriInvoke<MailAccount[]>("list_accounts")
}

export async function deleteAccount(id: number): Promise<void> {
  return tauriInvoke("delete_account", { id })
}

export async function listFolders(accountId: number): Promise<MailFolder[]> {
  return tauriInvoke<MailFolder[]>("list_folders", { accountId })
}

export async function updateAccount(account: MailAccount): Promise<void> {
  return tauriInvoke("update_account", { account })
}

export async function testConnection(account: MailAccount): Promise<string> {
  return tauriInvoke("test_connection", { account })
}

export async function syncAccount(accountId: number): Promise<SyncResult> {
  return tauriInvoke<SyncResult>("sync_account", { accountId })
}

// ==================== Messages ====================

export interface FetchMessagesResult {
  messages: MailMessageSummary[]
  total: number
  page: number
  page_size: number
}

export async function fetchMessages(
  accountId: number,
  folderId?: number,
  page?: number,
  pageSize?: number,
): Promise<FetchMessagesResult> {
  return tauriInvoke<FetchMessagesResult>("fetch_messages", {
    accountId,
    folderId: folderId ?? null,
    page: page ?? 1,
    pageSize: pageSize ?? 30,
  })
}

/** Combined inbox — list messages from multiple accounts (or all). */
export async function fetchMessagesMulti(
  accountIds: number[] | null,
  folderRole: string | null,
  page?: number,
  pageSize?: number,
): Promise<FetchMessagesResult> {
  return tauriInvoke<FetchMessagesResult>("fetch_messages_multi", {
    accountIds,
    folderRole,
    page: page ?? 1,
    pageSize: pageSize ?? 30,
  })
}

/** Total unread across given accounts (combined inbox badge). */
export async function getUnreadCountMulti(accountIds: number[] | null): Promise<number> {
  return tauriInvoke<number>("get_unread_count_multi", { accountIds })
}

export async function searchMessages(
  accountId: number,
  query: string,
): Promise<MailMessageSummary[]> {
  return tauriInvoke<MailMessageSummary[]>("search_messages", { accountId, query })
}

/** Unified full-text search across all (or specific) accounts. */
export async function searchMessagesMulti(
  accountIds: number[] | null,
  query: string,
): Promise<MailMessageSummary[]> {
  return tauriInvoke<MailMessageSummary[]>("search_messages_multi", { accountIds, query })
}

/** Mark all messages in a folder (or all folders if folderId is null) as read. */
export async function markFolderRead(accountId: number, folderId: number | null): Promise<number> {
  return tauriInvoke<number>("mark_folder_read", { accountId, folderId })
}

// ==================== Autoconfig ====================

export interface ServerConfig {
  protocol: string
  hostname: string
  port: number
  socket_type: string
}

export interface AutoconfigResult {
  email: string
  domain: string
  imap: ServerConfig | null
  smtp: ServerConfig | null
  source: string
  error: string | null
}

/** Mozilla-style autoconfig discovery — auto-fill IMAP/SMTP settings. */
export async function autodiscoverAccount(email: string): Promise<AutoconfigResult> {
  return tauriInvoke<AutoconfigResult>("autodiscover_account", { email })
}

// ==================== Drafts sync ====================

/** Push a local draft (remote_uid == 0) to the server's Drafts folder via APPEND. */
export async function pushDraftToImap(messageId: number): Promise<number> {
  return tauriInvoke<number>("push_draft_to_imap", { messageId })
}

/** Pull all server drafts for an account into the local DB. */
export async function pullDraftsFromImap(accountId: number): Promise<number> {
  return tauriInvoke<number>("pull_drafts_from_imap", { accountId })
}

export async function getMessageBody(
  messageId: number
): Promise<{ body_text: string; body_html: string; cc_list: string }> {
  return tauriInvoke("get_message_body", { messageId })
}

export async function getMessageHeaders(
  messageId: number
): Promise<MessageHeaders> {
  return tauriInvoke("get_message_headers", { messageId })
}

export async function markMessageRead(
  messageId: number,
  isRead: boolean
): Promise<void> {
  return tauriInvoke("mark_message_read", { messageId, isRead })
}

export async function toggleMessageStar(messageId: number): Promise<boolean> {
  return tauriInvoke("toggle_message_star", { messageId })
}

export async function deleteMessage(messageId: number): Promise<void> {
  return tauriInvoke("delete_message", { messageId })
}

export async function archiveMessage(messageId: number): Promise<void> {
  return tauriInvoke("archive_message", { messageId })
}

// ==================== Send ====================

export async function sendMail(request: SendMailRequest): Promise<SendResult> {
  return tauriInvoke<SendResult>("send_mail", { request })
}

// ==================== Attachments ====================

export async function listMessageAttachments(
  messageId: number,
): Promise<AttachmentInfo[]> {
  return tauriInvoke<AttachmentInfo[]>("list_message_attachments", { messageId })
}

export async function openFile(path: string): Promise<void> {
  return tauriInvoke("open_file", { path })
}

export async function readFileAsBase64(path: string): Promise<string> {
  return tauriInvoke<string>("read_file_as_base64", { path })
}

/**
 * Manually download a lazy attachment (one that was not auto-downloaded because
 * its size exceeded 5MB during sync). Returns the local file path.
 */
export async function downloadAttachment(
  attachmentId: number,
  messageId: number,
): Promise<string> {
  return tauriInvoke<string>("download_attachment", { attachmentId, messageId })
}

// ==================== Folders ====================

export async function folderUnreadCounts(
  accountId: number,
): Promise<[number, number][]> {
  return tauriInvoke<[number, number][]>("folder_unread_counts", { accountId })
}

// ==================== Contacts ====================

export async function addContact(contact: MailContact): Promise<number> {
  return tauriInvoke<number>("add_contact", { contact })
}

export async function listContacts(accountId: number): Promise<MailContact[]> {
  return tauriInvoke<MailContact[]>("list_contacts", { accountId })
}

export async function deleteContact(id: number): Promise<void> {
  return tauriInvoke("delete_contact", { id })
}

export async function updateContact(contact: MailContact): Promise<void> {
  return tauriInvoke("update_contact", { contact })
}

// ==================== Contact Groups ====================

export async function listContactGroups(accountId: number): Promise<MailContactGroup[]> {
  return tauriInvoke<MailContactGroup[]>("list_contact_groups", { accountId })
}

export async function addContactGroup(group: MailContactGroup): Promise<number> {
  return tauriInvoke<number>("add_contact_group", { group })
}

export async function updateContactGroup(group: MailContactGroup): Promise<void> {
  return tauriInvoke("update_contact_group", { group })
}

export async function deleteContactGroup(id: number): Promise<number> {
  return tauriInvoke<number>("delete_contact_group", { id })
}

/** 按 email 查找联系人（前端预热浮层查询用）。 */
export async function findContactByEmail(
  email: string,
  accountId?: number,
): Promise<MailContact | null> {
  return tauriInvoke<MailContact | null>("find_contact_by_email", {
    email,
    accountId: accountId ?? null,
  })
}

/** 跨账户搜索某邮箱的往来邮件。 */
export interface ContactMailSummary {
  contact_email: string
  total: number
  account_ids: number[]
  messages: import("@/stores/mail-store").MailMessageSummary[]
}

export async function searchMessagesByEmail(
  email: string,
  accountIds?: number[],
  limit?: number,
): Promise<ContactMailSummary> {
  return tauriInvoke<ContactMailSummary>("search_messages_by_email", {
    email,
    accountIds: accountIds ?? null,
    limit: limit ?? 50,
  })
}

// ==================== Config ====================

export async function getAutoFetchInterval(): Promise<number> {
  return tauriInvoke<number>("get_auto_fetch_interval")
}

export async function setAutoFetchInterval(intervalSecs: number): Promise<void> {
  return tauriInvoke("set_auto_fetch_interval", { intervalSecs })
}

export async function getCloseBehavior(): Promise<string> {
  return tauriInvoke<string>("get_close_behavior")
}

export async function setCloseBehavior(behavior: string): Promise<void> {
  return tauriInvoke("set_close_behavior", { behavior })
}

// ==================== Remote Images ====================

export async function getRemoteImagesEnabled(): Promise<boolean> {
  return tauriInvoke<boolean>("get_remote_images_enabled")
}

export async function setRemoteImagesEnabled(enabled: boolean): Promise<void> {
  return tauriInvoke("set_remote_images_enabled", { enabled })
}
