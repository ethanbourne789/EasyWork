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
}

export interface Contact {
  id: number;
  name: string;
  email: string;
  phone: string;
  groupId: number | null;
}
