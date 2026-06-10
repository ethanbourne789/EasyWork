import { create } from "zustand"

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
}

export interface SyncStatus {
  syncing: boolean
  lastResult: string | null
  lastError: string | null
  lastSyncAt: string | null
}

export interface MailContact {
  id: string
  name: string
  email: string
  phone: string
  group: string
  notes: string
}

interface MailState {
  // Accounts
  accounts: MailAccount[]
  loadingAccounts: boolean
  setAccounts: (accounts: MailAccount[]) => void
  addAccount: (account: MailAccount) => void
  removeAccount: (id: number) => void

  // Messages
  messages: MailMessageSummary[]
  selectedMessageId: number | null
  messageBody: { body_text: string; body_html: string } | null
  loadingMessages: boolean
  loadingBody: boolean
  setMessages: (messages: MailMessageSummary[]) => void
  setLoadingMessages: (loading: boolean) => void
  selectMessage: (id: number | null) => void
  setMessageBody: (body: { body_text: string; body_html: string } | null) => void
  markRead: (id: number, is_read: boolean) => void
  toggleStar: (id: number) => void

  // UI state
  activeView: "inbox" | "account" | "contacts" | "compose"
  activeFolder: string
  composeOpen: boolean
  composeData: { to: string; subject: string; body: string } | null
  setActiveView: (view: "inbox" | "account" | "contacts" | "compose") => void
  setActiveFolder: (folder: string) => void
  openCompose: (data?: { to: string; subject: string; body: string }) => void
  closeCompose: () => void

  // Sync
  syncStatus: SyncStatus
  setSyncStatus: (status: Partial<SyncStatus>) => void

  // Contacts
  contacts: MailContact[]
  setContacts: (contacts: MailContact[]) => void
}

export const useMailStore = create<MailState>((set) => ({
  accounts: [],
  loadingAccounts: false,
  setAccounts: (accounts) => set({ accounts }),
  addAccount: (account) => set((s) => ({ accounts: [...s.accounts, account] })),
  removeAccount: (id) => set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) })),

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

  activeView: "inbox",
  activeFolder: "inbox",
  composeOpen: false,
  composeData: null,
  setActiveView: (view) => set({ activeView: view }),
  setActiveFolder: (folder) => set({ activeFolder: folder }),
  openCompose: (data) => set({ composeOpen: true, composeData: data || null }),
  closeCompose: () => set({ composeOpen: false, composeData: null }),

  syncStatus: { syncing: false, lastResult: null, lastError: null, lastSyncAt: null },
  setSyncStatus: (partial) =>
    set((s) => ({ syncStatus: { ...s.syncStatus, ...partial } })),

  contacts: [],
  setContacts: (contacts) => set({ contacts }),
}))
