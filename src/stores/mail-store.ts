import { create } from "zustand"
import type { MailRecipient } from "@/lib/parseAddressList"

// Types matching Rust MailAccount
export interface MailAccount {
  id?: number
  email: string
  provider: string
  imap_host: string
  imap_port: number
  smtp_host: string
  smtp_port: number
  username: string
  password: string
  use_tls: boolean
  sync_interval_secs: number
  sync_period_days: number
}

export interface MailMessageSummary {
  id: number
  account_id: number
  remote_uid: number
  subject: string
  from_name: string
  from_email: string
  date: string
  is_read: boolean
  is_starred: boolean
  has_attachment: boolean
  size: number
  thread_id?: string
  is_deleted?: boolean
  /** v1.2: 来源账户邮箱（多账户聚合视图用） */
  account_email?: string
}

export interface FetchMessagesResult {
  messages: MailMessageSummary[]
  total: number
  page: number
  page_size: number
}

export interface SyncStatus {
  syncing: boolean
  lastResult: string | null
  lastError: string | null
  lastSyncAt: string | null
}

export interface MailContact {
  id?: number
  account_id: number
  name: string
  display_name?: string
  email: string
  phone: string
  group_id?: number | null
  group_name?: string
  notes: string
}

export interface MailContactGroup {
  id?: number
  account_id: number
  name: string
  color: string
  sort_order: number
}

export interface ComposeData {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  inReplyTo?: string
  references?: string[]
  isReply?: boolean
  isForward?: boolean
  replyMessageId?: number
  /**
   * v1.1: 结构化收件人。优先于 to/cc/bcc 字符串。
   * Reply/Forward 入口会把 from_email/cc_list 解析到此字段。
   * ComposeDialog 初始化时若存在则用之，否则从 to/cc/bcc 降级。
   */
  recipients?: MailRecipient[]
}

interface MailState {
  // Accounts
  accounts: MailAccount[]
  activeAccountId: number | null
  loadingAccounts: boolean
  setAccounts: (accounts: MailAccount[]) => void
  addAccount: (account: MailAccount) => void
  removeAccount: (id: number) => void
  updateAccount: (account: MailAccount) => void
  setActiveAccountId: (id: number | null) => void

  // Messages
  messages: MailMessageSummary[]
  selectedMessageId: number | null
  messageBody: { body_text: string; body_html: string; cc_list?: string } | null
  loadingMessages: boolean
  loadingBody: boolean
  setMessages: (messages: MailMessageSummary[]) => void
  setLoadingMessages: (loading: boolean) => void
  selectMessage: (id: number | null) => void
  setMessageBody: (body: { body_text: string; body_html: string; cc_list?: string } | null) => void
  markRead: (id: number, is_read: boolean) => void
  toggleStar: (id: number) => void
  removeMessage: (id: number) => void
  clearMessages: () => void

  // Search
  searchQuery: string
  setSearchQuery: (q: string) => void

  // UI state
  activeView: "inbox" | "account" | "contacts" | "compose"
  activeFolder: string
  activeFolderId: number | null
  composeOpen: boolean
  composeData: ComposeData | null
  setActiveView: (view: "inbox" | "account" | "contacts" | "compose") => void
  setActiveFolder: (folder: string, folderId?: number | null) => void
  openCompose: (data?: Partial<ComposeData>) => void
  closeCompose: () => void

  // Sync
  syncStatus: SyncStatus
  setSyncStatus: (status: Partial<SyncStatus>) => void

  // Contacts
  contacts: MailContact[]
  setContacts: (contacts: MailContact[]) => void

  // Contact Groups
  contactGroups: MailContactGroup[]
  setContactGroups: (groups: MailContactGroup[]) => void
  addContactGroup: (group: MailContactGroup) => void
  updateContactGroup: (group: MailContactGroup) => void
  removeContactGroup: (id: number) => void

  // Contact mail filter (viewing messages with a specific contact)
  contactFilterEmail: string | null
  contactFilterName: string | null
  setContactFilter: (email: string | null, name: string | null) => void

  // Folders
  folderUnreadCounts: Record<number, number>
  setFolderUnreadCounts: (counts: Record<number, number>) => void
  decrementFolderUnread: (folderId: number) => void
  incrementFolderUnread: (folderId: number) => void
}

export const useMailStore = create<MailState>((set) => ({
  accounts: [],
  activeAccountId: null,
  loadingAccounts: false,
  setAccounts: (accounts) => set((s) => ({
    accounts,
    activeAccountId: s.activeAccountId ?? (accounts[0]?.id ?? null),
  })),
  addAccount: (account) => set((s) => ({
    accounts: [...s.accounts, account],
    activeAccountId: s.activeAccountId ?? account.id ?? null,
  })),
  removeAccount: (id) => set((s) => {
    // If the deleted account is the active one, scrub ALL related UI state so
    // the user doesn't see orphaned messages / contacts / folder references.
    if (s.activeAccountId !== id) {
      return {
        accounts: s.accounts.filter((a) => a.id !== id),
        activeAccountId: s.activeAccountId,
      }
    }
    return {
      accounts: s.accounts.filter((a) => a.id !== id),
      activeAccountId: null,
      activeFolder: "inbox",
      activeFolderId: null,
      selectedMessageId: null,
      messageBody: null,
      messages: [],
      folderUnreadCounts: {},
      contacts: [],
      contactFilterEmail: null,
      contactFilterName: null,
    }
  }),
  updateAccount: (updated) => set((s) => ({
    accounts: s.accounts.map((a) => a.id === updated.id ? { ...a, ...updated } : a),
  })),
  setActiveAccountId: (id) => set({ activeAccountId: id }),

  messages: [],
  selectedMessageId: null,
  messageBody: null,
  loadingMessages: false,
  loadingBody: false,
  setMessages: (messages) => set({ messages }),
  setLoadingMessages: (loading) => set({ loadingMessages: loading }),
  selectMessage: (id) => set({ selectedMessageId: id, messageBody: null }),
  setMessageBody: (body) => set({ messageBody: body, loadingBody: false }),
  markRead: (id, is_read) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, is_read } : m)),
    })),
  toggleStar: (id) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, is_starred: !m.is_starred } : m
      ),
    })),
  removeMessage: (id) =>
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== id),
      selectedMessageId: s.selectedMessageId === id ? null : s.selectedMessageId,
    })),
  clearMessages: () => set({ messages: [], selectedMessageId: null, messageBody: null }),

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),

  activeView: "inbox",
  activeFolder: "inbox",
  activeFolderId: null,
  composeOpen: false,
  composeData: null,
  setActiveView: (view) => set({ activeView: view }),
  setActiveFolder: (folder, folderId) => set({ activeFolder: folder, activeFolderId: folderId ?? null }),
  openCompose: (data) => set({
    composeOpen: true,
    composeData: {
      to: data?.to || "",
      cc: data?.cc || "",
      bcc: data?.bcc || "",
      subject: data?.subject || "",
      body: data?.body || "",
      inReplyTo: data?.inReplyTo,
      references: data?.references,
      isReply: data?.isReply,
      isForward: data?.isForward,
      replyMessageId: data?.replyMessageId,
    },
  }),
  closeCompose: () => set({ composeOpen: false, composeData: null }),

  syncStatus: { syncing: false, lastResult: null, lastError: null, lastSyncAt: null },
  setSyncStatus: (partial) =>
    set((s) => ({ syncStatus: { ...s.syncStatus, ...partial } })),

  contacts: [],
  setContacts: (contacts) => set({ contacts }),

  contactGroups: [],
  setContactGroups: (groups) => set({ contactGroups: groups }),
  addContactGroup: (group) => set((s) => ({ contactGroups: [...s.contactGroups, group] })),
  updateContactGroup: (updated) => set((s) => ({
    contactGroups: s.contactGroups.map((g) => g.id === updated.id ? { ...g, ...updated } : g),
  })),
  removeContactGroup: (id) => set((s) => ({
    contactGroups: s.contactGroups.filter((g) => g.id !== id),
  })),

  contactFilterEmail: null,
  contactFilterName: null,
  setContactFilter: (email, name) => set({ contactFilterEmail: email, contactFilterName: name }),

  folderUnreadCounts: {},
  setFolderUnreadCounts: (counts) => set({ folderUnreadCounts: counts }),
  decrementFolderUnread: (folderId) =>
    set((s) => ({
      folderUnreadCounts: {
        ...s.folderUnreadCounts,
        [folderId]: Math.max(0, (s.folderUnreadCounts[folderId] || 0) - 1),
      },
    })),
  incrementFolderUnread: (folderId) =>
    set((s) => ({
      folderUnreadCounts: {
        ...s.folderUnreadCounts,
        [folderId]: (s.folderUnreadCounts[folderId] || 0) + 1,
      },
    })),
}))
