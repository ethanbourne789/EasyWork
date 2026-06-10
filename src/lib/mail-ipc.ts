import type { MailAccount, MailMessageSummary } from "@/stores/mail-store"

export interface MailFolder {
  id: number | null
  account_id: number
  remote_id: string
  name: string
  role: string
  folder_type: string
}

// Check if Tauri API is available
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

// Dynamic import for Tauri invoke (only on desktop)
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    console.warn(`Tauri not available, command "${cmd}" skipped`)
    throw new Error("Tauri not available")
  }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<T>(cmd, args)
}

export interface SyncResult {
  success: boolean
  folders_count: number
  messages_new: number
  messages_total: number
  error: string | null
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
  page?: number,
  pageSize?: number
): Promise<MailMessageSummary[]> {
  return tauriInvoke<MailMessageSummary[]>("fetch_messages", {
    accountId,
    page: page ?? 1,
    pageSize: pageSize ?? 50,
  })
}

export async function getMessageBody(
  messageId: number
): Promise<{ body_text: string; body_html: string }> {
  return tauriInvoke("get_message_body", { messageId })
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
