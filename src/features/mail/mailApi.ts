import { invoke } from '@tauri-apps/api/core';
import type { Email, EmailFolder, EmailAccount, EmailSignature } from '@/types';

export const mailApi = {
  listAccounts: () => invoke<EmailAccount[]>('mail_list_accounts'),
  listFolders: (accountId?: string) => invoke<EmailFolder[]>('mail_list_folders', { accountId }),
  listMessages: (folderId: string, limit = 50, offset = 0) =>
    invoke<Email[]>('mail_list_messages', { folderId, limit, offset }),
  unifiedInbox: (limit = 50, offset = 0) =>
    invoke<Email[]>('mail_unified_inbox', { limit, offset }),
  unifiedUnread: () => invoke<number>('mail_unified_unread'),
  getMessage: (id: string) => invoke<Email>('mail_get_message', { id }),
  folderUnread: (accountId?: string) => invoke<Record<string, number>>('mail_folder_unread', { accountId }),
  addAccount: (params: {
    email: string; displayName?: string; username?: string; password: string;
    imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; useSsl?: boolean;
  }) => invoke<EmailAccount>('mail_add_account', {
    email: params.email, displayName: params.displayName, username: params.username,
    password: params.password, imapHost: params.imapHost, imapPort: params.imapPort,
    smtpHost: params.smtpHost, smtpPort: params.smtpPort, useSsl: params.useSsl,
  }),
  sync: (accountId?: string) => invoke('mail_sync', { accountId }),
  send: (params: {
    accountId: string; to: string[]; cc: string[]; subject: string; bodyHtml: string; bodyText: string;
  }) => invoke<Email>('mail_send', params),
  markRead: (id: string, isRead: boolean) => invoke('mail_mark_read', { id, isRead }),
  toggleStar: (id: string) => invoke('mail_toggle_star', { id }),
  deleteMessage: (id: string) => invoke('mail_delete_message', { id }),
  createFolder: (accountId: string, name: string) => invoke<EmailFolder>('mail_create_folder', { accountId, name }),
  renameFolder: (id: string, name: string) => invoke<EmailFolder>('mail_rename_folder', { id, name }),
  deleteFolder: (id: string) => invoke('mail_delete_folder', { id }),
  listSignatures: () => invoke<EmailSignature[]>('mail_list_signatures'),
  saveSignature: (params: { id?: string; name: string; html: string; isDefault?: boolean }) =>
    invoke<EmailSignature>('mail_save_signature', params),
  deleteSignature: (id: string) => invoke('mail_delete_signature', { id }),
  setAccountSignature: (params: {
    accountId: string; signatureId?: string; autoNew?: boolean; autoReply?: boolean;
  }) => invoke('mail_set_account_signature', params),
};
