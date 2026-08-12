import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { mailApi } from "./mailApi";
import { getCurrentUserId } from "@/features/auth/authStore";
import { useSafeMutation } from "@/lib/mutation";
import type {
  EmailAccount,
  EmailFolder,
  Email,
  EmailAttachment,
} from "@/types";

export function useEmailAccounts() {
  return useQuery({
    queryKey: ["email-accounts"],
    queryFn: async () => {
      const data = await mailApi.listAccounts();
      return (data ?? []) as EmailAccount[];
    },
  });
}

/**
 * 查询邮件文件夹。不传 accountId 时返回全部文件夹。
 */
export function useEmailFolders(accountId?: string) {
  return useQuery({
    queryKey: ["email-folders", accountId ?? "__all__"],
    queryFn: async () => {
      const data = await mailApi.listFolders(accountId);
      return (data ?? []) as EmailFolder[];
    },
  });
}

/**
 * 动态计算每个文件夹的未读邮件数（folder_id -> count）。
 * Rust 端 mail_folder_unread 返回 Vec<(String, i64)>，Tauri IPC 序列化为数组数组；
 * 这里兼容 [string, number][] 与对象数组两种形式。
 */
export function useFolderUnreadCounts() {
  const userId = getCurrentUserId();
  return useQuery({
    queryKey: ["folder-unread-counts", userId],
    enabled: !!userId,
    queryFn: async () => {
      const raw = (await mailApi.folderUnread()) as unknown;
      const counts: Record<string, number> = {};
      if (Array.isArray(raw)) {
        for (const row of raw) {
          if (Array.isArray(row) && row.length >= 2) {
            counts[String(row[0])] = Number(row[1]);
          } else if (row && typeof row === "object") {
            const r = row as { folder_id?: string; unread_count?: number; 0?: string; 1?: number };
            const k = r.folder_id ?? r[0];
            const v = r.unread_count ?? r[1];
            if (k) counts[String(k)] = Number(v ?? 0);
          }
        }
      } else if (raw && typeof raw === "object") {
        // 兼容 Record<string, number> 形式
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          counts[k] = Number(v);
        }
      }
      return counts;
    },
  });
}

export function useEmails(folderId?: string) {
  return useQuery({
    queryKey: ["emails", folderId],
    queryFn: async () => {
      const data = await mailApi.listMessages(folderId!);
      return (data ?? []) as Email[];
    },
    enabled: folderId !== undefined,
  });
}

export function useEmail(id?: string) {
  return useQuery({
    queryKey: ["email", id],
    queryFn: async () => {
      if (!id) return null;
      const data = await mailApi.getMessage(id);
      return (data as Email | null) ?? null;
    },
    enabled: !!id,
  });
}

export function useEmailAttachments(emailId?: string) {
  return useQuery({
    queryKey: ["email-attachments", emailId],
    queryFn: async () => {
      // TODO: 后端尚未提供 mail_list_attachments 命令（P1+ 阶段补齐）；
      // 附件元数据已内嵌在 Email.attachments 中，目前返回空数组占位。
      return [] as EmailAttachment[];
    },
    enabled: !!emailId,
  });
}

export function useMarkAsRead() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (id: string) => {
      await mailApi.markRead(id, true);
      // 后端命令无返回值，无法精确知道 folder_id；交由 onSuccess 全量失效。
      return undefined;
    },
    onSuccess: (_folderId, id) => {
      qc.invalidateQueries({ queryKey: ["email", id] });
      qc.invalidateQueries({ queryKey: ["email-folders"] });
      qc.invalidateQueries({ queryKey: ["folder-unread-counts"] });
      qc.invalidateQueries({ queryKey: ["emails"] });
    },
  });
}

export function useToggleStar() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (id: string) => {
      await mailApi.toggleStar(id);
      // 后端命令无返回值，无法精确知道 folder_id；交由 onSuccess 全量失效。
      return undefined;
    },
    onSuccess: (_folderId, id) => {
      qc.invalidateQueries({ queryKey: ["email", id] });
      qc.invalidateQueries({ queryKey: ["folder-unread-counts"] });
      qc.invalidateQueries({ queryKey: ["emails"] });
    },
  });
}

export function useSendEmail() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: {
      to: string;
      cc?: string;
      subject: string;
      body: string;
      accountId: string;
    }) => {
      const toArr = data.to ? data.to.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const ccArr = data.cc ? data.cc.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const email = await mailApi.send({
        accountId: data.accountId,
        to: toArr,
        cc: ccArr,
        subject: data.subject,
        bodyHtml: data.body,
        bodyText: data.body,
      });
      return email as Email;
    },
    onSuccess: (email) => {
      qc.invalidateQueries({ queryKey: ["email-folders"] });
      qc.invalidateQueries({ queryKey: ["folder-unread-counts"] });
      if (email?.folder_id) qc.invalidateQueries({ queryKey: ["emails", email.folder_id] });
      else qc.invalidateQueries({ queryKey: ["emails"] });
    },
  });
}

export function useSyncMail() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (accountId?: string) => {
      const res = await mailApi.sync(accountId);
      return res as { scheduled?: boolean; result?: unknown } | undefined;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emails"] });
      qc.invalidateQueries({ queryKey: ["email-folders"] });
      qc.invalidateQueries({ queryKey: ["folder-unread-counts"] });
    },
  });
}

export function useSaveDraft() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (_data: {
      to: string;
      cc?: string;
      subject: string;
      body: string;
      accountId: string;
    }) => {
      // TODO: 后端尚未提供 mail_save_draft 命令（P1+ 阶段补齐）。
      // 临时回退：调用 mailApi.send 无法生成草稿（会真实发送），故直接抛错避免误用。
      throw new Error("草稿保存暂未实现：等待后端 mail_save_draft 命令");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folder-unread-counts"] });
      qc.invalidateQueries({ queryKey: ["emails"] });
    },
  });
}

export function useCreateEmailAccount() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (input: {
      email: string;
      display_name?: string;
      username?: string;
      password?: string;
      imap_host: string;
      imap_port: number;
      smtp_host: string;
      smtp_port: number;
      use_ssl: boolean;
    }) => {
      const account = await mailApi.addAccount({
        email: input.email,
        displayName: input.display_name || undefined,
        username: input.username?.trim() || undefined,
        password: input.password ?? "",
        imapHost: input.imap_host,
        imapPort: input.imap_port,
        smtpHost: input.smtp_host,
        smtpPort: input.smtp_port,
        useSsl: input.use_ssl,
      });
      return account as EmailAccount;
    },
    onSuccess: (account) => {
      qc.invalidateQueries({ queryKey: ["email-accounts"] });
      qc.invalidateQueries({ queryKey: ["email-folders"] });
      // 创建账号后自动触发该账号的邮件同步，无需用户手动点击"收取邮件"
      if (account?.id) {
        mailApi
          .sync(account.id)
          .then(() => {
            qc.invalidateQueries({ queryKey: ["emails"] });
            qc.invalidateQueries({ queryKey: ["email-folders"] });
            qc.invalidateQueries({ queryKey: ["folder-unread-counts"] });
          })
          .catch((e: unknown) => {
            console.error("自动同步邮件失败:", e instanceof Error ? e.message : e);
          });
      }
    },
  });
}

export function useDeleteEmail() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (id: string) => {
      // 后端命令无返回值，无法精确知道 folder_id；交由 onSuccess 全量失效。
      await mailApi.deleteMessage(id);
      return undefined;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folder-unread-counts"] });
      qc.invalidateQueries({ queryKey: ["emails"] });
    },
  });
}

/**
 * 新建邮件文件夹：通过 mailApi.createFolder 在 IMAP 服务端真实建目录，
 * 并由后端写回本地 email_folders 元数据（imap_path 取服务端返回的真实路径）。
 */
export function useCreateFolder() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (input: { accountId: string; name: string }) => {
      const name = input.name.trim();
      if (!name) throw new Error("文件夹名称不能为空");
      const folder = await mailApi.createFolder(input.accountId, name);
      return folder as EmailFolder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-folders"] });
    },
  });
}

/**
 * 更新已存在的草稿（按 id upsert），避免重复创建草稿行。
 */
export function useUpdateDraft() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (_data: {
      id: string;
      to: string;
      cc?: string;
      subject: string;
      body: string;
    }) => {
      // TODO: 后端尚未提供 mail_update_draft 命令（P1+ 阶段补齐）。
      throw new Error("草稿更新暂未实现：等待后端 mail_update_draft 命令");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["folder-unread-counts"] });
      qc.invalidateQueries({ queryKey: ["emails"] });
    },
  });
}

/**
 * 重命名邮件文件夹：通过 mailApi.renameFolder 在 IMAP 服务端真实重命名目录，
 * 并由后端回写本地 email_folders 的 name 与 imap_path（系统文件夹已在后端拒绝）。
 */
export function useRenameFolder() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: { id: string; name: string }) => {
      const name = data.name.trim();
      if (!name) throw new Error("文件夹名称不能为空");
      const folder = await mailApi.renameFolder(data.id, name);
      return folder as EmailFolder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-folders"] });
    },
  });
}

/**
 * 删除邮件文件夹：通过 mailApi.deleteFolder 在 IMAP 服务端真实删除目录，
 * 并由后端清理本地 email_folders 元数据及其下邮件缓存（系统文件夹已在后端拒绝）。
 */
export function useDeleteFolder() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (id: string) => {
      await mailApi.deleteFolder(id);
      return undefined;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-folders"] });
      qc.invalidateQueries({ queryKey: ["emails"] });
      qc.invalidateQueries({ queryKey: ["folder-unread-counts"] });
    },
  });
}
