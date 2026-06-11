import type { MailAccount, MailMessageSummary, MailContact } from "@/stores/mail-store"

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

export async function fetchMessages(
  accountId: number,
  folderId?: number,
  page?: number,
  pageSize?: number,
): Promise<MailMessageSummary[]> {
  return tauriInvoke<MailMessageSummary[]>("fetch_messages", {
    accountId,
    folderId: folderId ?? null,
    page: page ?? 1,
    pageSize: pageSize ?? 50,
  })
}

export async function searchMessages(
  accountId: number,
  query: string,
): Promise<MailMessageSummary[]> {
  return tauriInvoke<MailMessageSummary[]>("search_messages", { accountId, query })
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
