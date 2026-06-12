export type MailFolder = 'inbox' | 'sent' | 'drafts' | 'trash';

export interface MailMessage {
  id: number;
  accountId: number;
  uid: number;
  subject: string;
  sender: string;
  recipients: string;
  bodyText: string;
  bodyHtml: string;
  folder: MailFolder;
  isRead: boolean;
  isStarred: boolean;
  receivedDate: string;
  createdAt: string;
}

export interface MailAccount {
  id: number;
  email: string;
  username: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  syncPeriod: number;
  syncInterval: number;
  /** Optional display name (defaults to email). */
  displayName?: string;
  /** Optional color (#RRGGBB) for sidebar avatar / account badge. */
  color?: string;
  /** True if this is the default account used for new compose when no context. */
  isDefault?: boolean;
  /** Whether desktop notifications fire for new mail on this account. */
  notificationsEnabled?: boolean;
}

export interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  groupId: number | null;
}
