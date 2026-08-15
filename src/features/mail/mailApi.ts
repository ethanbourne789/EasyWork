import { isTauri } from "@/lib/tauri";
import type { Email, EmailFolder, EmailAccount, EmailSignature, EmailTemplate, EmailAttachment, Contact, ContactGroup, MailSyncResult } from "@/types";

/**
 * 统一收件箱虚拟节点 ID。
 * 当 selectedFolderId === UNIFIED_INBOX_ID 时，MailList 改为调用 mail_unified_inbox，
 * 聚合所有账户的收件箱邮件。该 ID 不会出现在 email_folders 表中。
 */
export const UNIFIED_INBOX_ID = "__unified_inbox__";

/**
 * 懒加载 Tauri invoke 函数。
 * 使用动态导入避免在浏览器环境下因 @tauri-apps/api/core 模块无法加载而崩溃。
 */
async function getInvoke() {
  if (!isTauri()) {
    throw new Error("Tauri runtime not available");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

export const mailApi = {
  listAccounts: async () => {
    const invoke = await getInvoke();
    return invoke<EmailAccount[]>("mail_list_accounts");
  },
  listFolders: async (accountId?: string) => {
    const invoke = await getInvoke();
    return invoke<EmailFolder[]>("mail_list_folders", { accountId });
  },
  listMessages: async (folderId: string, limit = 50, offset = 0) => {
    const invoke = await getInvoke();
    return invoke<Email[]>("mail_list_messages", { folderId, limit, offset });
  },
  unifiedInbox: async (limit = 50, offset = 0) => {
    const invoke = await getInvoke();
    return invoke<Email[]>("mail_unified_inbox", { limit, offset });
  },
  unifiedUnread: async () => {
    const invoke = await getInvoke();
    return invoke<number>("mail_unified_unread");
  },
  getMessage: async (id: string) => {
    const invoke = await getInvoke();
    return invoke<Email>("mail_get_message", { id });
  },
  folderUnread: async (accountId?: string) => {
    const invoke = await getInvoke();
    return invoke<Record<string, number>>("mail_folder_unread", { accountId });
  },
  addAccount: async (params: {
    email: string;
    displayName?: string;
    username?: string;
    password: string;
    imapHost: string;
    imapPort: number;
    smtpHost: string;
    smtpPort: number;
    useSsl?: boolean;
  }) => {
    const invoke = await getInvoke();
    return invoke<EmailAccount>("mail_add_account", {
      email: params.email,
      displayName: params.displayName,
      username: params.username,
      password: params.password,
      imapHost: params.imapHost,
      imapPort: params.imapPort,
      smtpHost: params.smtpHost,
      smtpPort: params.smtpPort,
      useSsl: params.useSsl,
    });
  },
  sync: async (accountId?: string) => {
    const invoke = await getInvoke();
    return invoke<MailSyncResult>("mail_sync", { accountId });
  },
  send: async (params: {
    accountId: string;
    to: string[];
    cc: string[];
    subject: string;
    bodyHtml: string;
    bodyText: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Email>("mail_send", params);
  },
  markRead: async (id: string, isRead: boolean) => {
    const invoke = await getInvoke();
    return invoke("mail_mark_read", { id, isRead });
  },
  toggleStar: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("mail_toggle_star", { id });
  },
  deleteMessage: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("mail_delete_message", { id });
  },
  createFolder: async (accountId: string, name: string) => {
    const invoke = await getInvoke();
    return invoke<EmailFolder>("mail_create_folder", { accountId, name });
  },
  renameFolder: async (id: string, name: string) => {
    const invoke = await getInvoke();
    return invoke<EmailFolder>("mail_rename_folder", { id, name });
  },
  deleteFolder: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("mail_delete_folder", { id });
  },
  listSignatures: async () => {
    const invoke = await getInvoke();
    return invoke<EmailSignature[]>("mail_list_signatures");
  },
  saveSignature: async (params: {
    id?: string;
    name: string;
    html: string;
    isDefault?: boolean;
  }) => {
    const invoke = await getInvoke();
    return invoke<EmailSignature>("mail_save_signature", params);
  },
  deleteSignature: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("mail_delete_signature", { id });
  },
  setAccountSignature: async (params: {
    accountId: string;
    signatureId?: string;
    autoNew?: boolean;
    autoReply?: boolean;
  }) => {
    const invoke = await getInvoke();
    return invoke("mail_set_account_signature", params);
  },
  updateAccount: async (params: {
    id: string;
    email: string;
    displayName?: string;
    username?: string;
    password?: string;
    imapHost: string;
    imapPort: number;
    smtpHost: string;
    smtpPort: number;
    useSsl?: boolean;
  }) => {
    const invoke = await getInvoke();
    return invoke("mail_update_account", {
      id: params.id,
      email: params.email,
      displayName: params.displayName,
      username: params.username,
      password: params.password,
      imapHost: params.imapHost,
      imapPort: params.imapPort,
      smtpHost: params.smtpHost,
      smtpPort: params.smtpPort,
      useSsl: params.useSsl,
    });
  },
  deleteAccount: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("mail_delete_account", { id });
  },
  // ---- 邮件模板 ----
  listTemplates: async () => {
    const invoke = await getInvoke();
    return invoke<EmailTemplate[]>("mail_list_templates");
  },
  saveTemplate: async (params: { id?: string; name: string; subject?: string; body?: string }) => {
    const invoke = await getInvoke();
    return invoke<EmailTemplate>("mail_save_template", params);
  },
  deleteTemplate: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("mail_delete_template", { id });
  },
  // ---- 草稿 ----
  saveDraft: async (params: {
    accountId: string;
    to: string[];
    cc: string[];
    subject: string;
    bodyHtml: string;
    bodyText: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Email>("mail_save_draft", params);
  },
  // ---- 联系人 ----
  contactList: async (groupId?: string, query?: string) => {
    const invoke = await getInvoke();
    return invoke<Contact[]>("contact_list", { groupId, query });
  },
  contactSave: async (contact: Contact) => {
    const invoke = await getInvoke();
    return invoke<Contact>("contact_save", { contact });
  },
  contactDelete: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("contact_delete", { id });
  },
  contactGroupList: async () => {
    const invoke = await getInvoke();
    return invoke<ContactGroup[]>("contact_group_list");
  },
  contactGroupSave: async (params: { id?: string; name: string }) => {
    const invoke = await getInvoke();
    return invoke<ContactGroup>("contact_group_save", params);
  },
  contactGroupDelete: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("contact_group_delete", { id });
  },
  contactExportVcf: async (groupId?: string) => {
    const invoke = await getInvoke();
    return invoke<string>("contact_export_vcf", { groupId });
  },
  contactImportVcf: async (content: string) => {
    const invoke = await getInvoke();
    return invoke<number>("contact_import_vcf", { content });
  },
  // ---- 附件 ----
  listAttachments: async (emailId: string) => {
    const invoke = await getInvoke();
    return invoke<EmailAttachment[]>("mail_list_attachments", { emailId });
  },
  /** 下载附件：弹出系统保存对话框；用户取消返回空字符串 */
  downloadAttachment: async (id: string) => {
    const invoke = await getInvoke();
    return invoke<string>("mail_download_attachment", { id });
  },
  /** FTS5 全文搜索（标题/发件人/正文） */
  search: async (query: string, limit = 50) => {
    const invoke = await getInvoke();
    return invoke<Email[]>("mail_search", { query, limit });
  },
};
