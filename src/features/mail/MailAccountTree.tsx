import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { confirm } from "@/lib/confirm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Inbox,
  Send,
  FileEdit,
  AlertOctagon,
  Plus,
  ChevronDown,
  ChevronRight,
  Mail as MailIcon,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  useEmailAccounts,
  useEmailFolders,
  useFolderUnreadCounts,
  useCreateEmailAccount,
  useUpdateEmailAccount,
  useDeleteEmailAccount,
  useRenameFolder,
  useDeleteFolder,
  useUnifiedUnread,
} from "./useMail";
import { UNIFIED_INBOX_ID } from "./mailApi";
import type { EmailFolder, EmailAccount } from "@/types";

interface MailAccountTreeProps {
  selectedFolderId?: string;
  onFolderSelect: (folderId: string) => void;
}

const folderIconMap: Record<string, typeof Inbox> = {
  收件箱: Inbox,
  已发送: Send,
  草稿箱: FileEdit,
  垃圾邮件: AlertOctagon,
};

/** 根据邮箱域名自动推断 IMAP/SMTP 服务器配置 */
const MAIL_PROVIDERS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; useSsl: boolean }> = {
  "qq.com":       { imapHost: "imap.qq.com",       imapPort: 993, smtpHost: "smtp.qq.com",       smtpPort: 465, useSsl: true },
  "jasolar.com":  { imapHost: "imap.qiye.163.com",  imapPort: 993, smtpHost: "smtp.qiye.163.com",  smtpPort: 465, useSsl: true },
};

function detectMailProvider(email: string) {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (domain && MAIL_PROVIDERS[domain]) {
    return MAIL_PROVIDERS[domain];
  }
  return null;
}

export function MailAccountTree({
  selectedFolderId,
  onFolderSelect,
}: MailAccountTreeProps) {
  const { t } = useTranslation();
  const { data: accounts = [], isLoading: accountsLoading, isError: accountsError, refetch } = useEmailAccounts();
  const { data: unifiedUnread = 0 } = useUnifiedUnread();
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);

  const toggleAccount = (accountId: string) => {
    setExpandedAccounts((prev) => ({ ...prev, [accountId]: !prev[accountId] }));
  };

  if (accountsLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">{t("common.loading")}</div>
    );
  }

  if (accountsError) {
    return (
      <div className="space-y-2 p-4 text-center">
        <p className="text-sm text-destructive">{t("mail.loadFailed")}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>{t("common.retry")}</Button>
      </div>
    );
  }

  const isUnifiedSelected = selectedFolderId === UNIFIED_INBOX_ID;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1 space-y-1 p-2">
        {/* 统一收件箱虚拟节点：聚合所有账户的收件箱邮件 */}
        <button
          type="button"
          onClick={() => onFolderSelect(UNIFIED_INBOX_ID)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
            isUnifiedSelected && "bg-accent"
          )}
        >
          <Inbox className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">{t("mail.unifiedInbox")}</span>
          {unifiedUnread > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
              {unifiedUnread}
            </span>
          )}
        </button>

        <div className="my-1 border-t" />

        {accounts.map((account) => (
          <AccountSection
            key={account.id}
            account={account}
            expanded={expandedAccounts[account.id] ?? true}
            onToggle={() => toggleAccount(account.id)}
            selectedFolderId={selectedFolderId}
            onFolderSelect={onFolderSelect}
          />
        ))}
      </div>
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {t("mail.addAccount")}
        </Button>
      </div>
      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AddAccountDialog({ open, onOpenChange }: AddAccountDialogProps) {
  const { t } = useTranslation();
  const createAccount = useCreateEmailAccount();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [useSsl, setUseSsl] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleEmailChange = (value: string) => {
    setEmail(value);
    const provider = detectMailProvider(value);
    if (provider) {
      setImapHost(provider.imapHost);
      setImapPort(String(provider.imapPort));
      setSmtpHost(provider.smtpHost);
      setSmtpPort(String(provider.smtpPort));
      setUseSsl(provider.useSsl);
    }
  };

  const reset = () => {
    setEmail("");
    setDisplayName("");
    setImapHost("");
    setImapPort("993");
    setSmtpHost("");
    setSmtpPort("465");
    setUseSsl(true);
    setUsername("");
    setPassword("");
    setError("");
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError(t("mail.enterEmail"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError(t("mail.invalidEmailAddress"));
      return;
    }
    setError("");
    try {
      await createAccount.mutateAsync({
        email: trimmed,
        display_name: displayName.trim() || undefined,
        username: username.trim() || undefined,
        password: password || undefined,
        imap_host: imapHost.trim(),
        imap_port: Number(imapPort) || 993,
        smtp_host: smtpHost.trim(),
        smtp_port: Number(smtpPort) || 465,
        use_ssl: useSsl,
      });
      handleClose();
    } catch {
      setError(t("mail.createFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogClose onClose={handleClose} />
        <DialogHeader>
          <DialogTitle>{t("mail.addAccount")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">
              {t("mail.email")} <span className="text-destructive">*</span>
            </label>
            <Input
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">{t("mail.displayName")}</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("common.optional")}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">{t("mail.loginUsername")}</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("mail.loginUsernamePlaceholder")}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">
              {t("mail.passwordOrAuthCode")} <span className="text-destructive">*</span>
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("mail.passwordPlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("mail.imapServer")}</label>
              <Input
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                placeholder="imap.example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("mail.imapPort")}</label>
              <Input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(e.target.value)}
                placeholder="993"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("mail.smtpServer")}</label>
              <Input
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("mail.smtpPort")}</label>
              <Input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="465"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useSsl}
              onChange={(e) => setUseSsl(e.target.checked)}
              className="h-4 w-4"
            />
            {t("mail.useSslTls")}
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={createAccount.isPending}
          >
            {createAccount.isPending ? t("mail.creating") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AccountSectionProps {
  account: EmailAccount;
  expanded: boolean;
  onToggle: () => void;
  selectedFolderId?: string;
  onFolderSelect: (folderId: string) => void;
}

function AccountSection({
  account,
  expanded,
  onToggle,
  selectedFolderId,
  onFolderSelect,
}: AccountSectionProps) {
  const { t } = useTranslation();
  const { data: folders = [] } = useEmailFolders(account.id);
  const { data: unreadCounts = {} } = useFolderUnreadCounts();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();
  const deleteAccount = useDeleteEmailAccount();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<EmailFolder | null>(null);
  const [renameName, setRenameName] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const displayName = account.display_name || account.email;

  const isSystem = (f: EmailFolder) =>
    ["INBOX", "SENT", "DRAFTS"].includes((f.imap_path ?? "").toUpperCase()) ||
    ["收件箱", "已发送", "草稿箱"].includes(f.name);

  const openRename = (f: EmailFolder) => {
    setMenuId(null);
    setRenameTarget(f);
    setRenameName(f.name);
  };

  const submitRename = () => {
    if (!renameTarget || !renameName.trim()) return;
    renameFolder.mutate(
      { id: renameTarget.id, name: renameName },
      { onSuccess: () => setRenameTarget(null) }
    );
  };

  const handleDelete = async (f: EmailFolder) => {
    setMenuId(null);
    const ok = await confirm({
      title: t("mail.deleteFolder"),
      description: t("mail.deleteFolderWithCacheConfirm", { name: f.name }),
      confirmText: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    deleteFolder.mutate(f.id);
  };

  const handleDeleteAccount = async () => {
    setMenuId(null);
    const ok = await confirm({
      title: t("mail.deleteAccount"),
      description: t("mail.deleteAccountWithCacheConfirm", { name: displayName }),
      confirmText: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    deleteAccount.mutate(account.id);
  };

  return (
    <div>
      <div className="group flex items-center">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )}
          <Avatar fallback={displayName} size="sm" />
          <span className="flex-1 truncate text-left">{displayName}</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuId((p) => (p === account.id ? null : account.id));
          }}
          aria-label={t("mail.manageAccount")}
          className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded opacity-0 hover:bg-background/60 group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
      {menuId === account.id && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuId(null)} />
          <div className="absolute left-8 top-8 z-50 w-36 rounded-md border bg-background p-1 shadow-md">
            <button
              type="button"
              onClick={() => { setMenuId(null); setEditOpen(true); }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("common.edit")}
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-accent"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("common.delete")}
            </button>
          </div>
        </>
      )}
      {expanded && (
        <div className="ml-4 mt-0.5 space-y-0.5">
          {folders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              unreadCount={unreadCounts[folder.id] ?? 0}
              selected={folder.id === selectedFolderId}
              onClick={() => onFolderSelect(folder.id)}
              canManage={!isSystem(folder)}
              menuOpen={menuId === folder.id}
              onMenuClick={() => setMenuId((p) => (p === folder.id ? null : folder.id))}
              onRename={() => openRename(folder)}
              onDelete={() => handleDelete(folder)}
            />
          ))}
        </div>
      )}

      <EditAccountDialog
        account={account}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("mail.renameFolder")}</DialogTitle>
          </DialogHeader>
          <DialogClose onClose={() => setRenameTarget(null)} />
          <div className="space-y-3">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder={t("mail.folderNamePlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameTarget(null)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={submitRename} disabled={!renameName.trim() || renameFolder.isPending}>
                {renameFolder.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FolderItemProps {
  folder: EmailFolder;
  unreadCount: number;
  selected: boolean;
  onClick: () => void;
  canManage: boolean;
  menuOpen: boolean;
  onMenuClick: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function FolderItem({
  folder,
  unreadCount,
  selected,
  onClick,
  canManage,
  menuOpen,
  onMenuClick,
  onRename,
  onDelete,
}: FolderItemProps) {
  const { t } = useTranslation();
  const Icon = folderIconMap[folder.name] || MailIcon;

  return (
    <div className="relative flex items-center">
      <button
        onClick={onClick}
        className={cn(
          "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
          selected && "bg-accent font-medium"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{folder.name}</span>
        {unreadCount > 0 && (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
            {unreadCount}
          </span>
        )}
      </button>
      {canManage && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMenuClick();
          }}
          aria-label={t("mail.manageFolder")}
          className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-background/60"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      )}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onMenuClick} />
          <div className="absolute right-0 top-9 z-50 w-32 rounded-md border bg-background p-1 shadow-md">
            <button
              type="button"
              onClick={onRename}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t("mail.rename")}
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-accent"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("common.delete")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface EditAccountDialogProps {
  account: { id: string; email: string; display_name?: string | null; username?: string | null; imap_host: string; imap_port: number; smtp_host: string; smtp_port: number; use_ssl: boolean };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditAccountDialog({ account, open, onOpenChange }: EditAccountDialogProps) {
  const { t } = useTranslation();
  const updateAccount = useUpdateEmailAccount();
  const [email, setEmail] = useState(account.email);
  const [displayName, setDisplayName] = useState(account.display_name ?? "");
  const [imapHost, setImapHost] = useState(account.imap_host);
  const [imapPort, setImapPort] = useState(String(account.imap_port));
  const [smtpHost, setSmtpHost] = useState(account.smtp_host);
  const [smtpPort, setSmtpPort] = useState(String(account.smtp_port));
  const [useSsl, setUseSsl] = useState(account.use_ssl);
  const [username, setUsername] = useState(account.username ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // 当 account 切换或对话框打开时重新填充表单
  useEffect(() => {
    if (!open) return;
    setEmail(account.email);
    setDisplayName(account.display_name ?? "");
    setImapHost(account.imap_host);
    setImapPort(String(account.imap_port));
    setSmtpHost(account.smtp_host);
    setSmtpPort(String(account.smtp_port));
    setUseSsl(account.use_ssl);
    setUsername(account.username ?? "");
    setPassword("");
    setError("");
  }, [open, account]);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) { setError(t("mail.enterEmail")); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setError(t("mail.invalidEmailAddress")); return; }
    setError("");
    try {
      await updateAccount.mutateAsync({
        id: account.id,
        email: trimmed,
        display_name: displayName.trim() || undefined,
        username: username.trim() || undefined,
        password: password || undefined,
        imap_host: imapHost.trim(),
        imap_port: Number(imapPort) || 993,
        smtp_host: smtpHost.trim(),
        smtp_port: Number(smtpPort) || 465,
        use_ssl: useSsl,
      });
      onOpenChange(false);
    } catch {
      setError(t("mail.updateFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogClose onClose={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>{t("mail.editAccount")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">{t("mail.email")} <span className="text-destructive">*</span></label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">{t("mail.displayName")}</label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("common.optional")} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">{t("mail.loginUsername")}</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("mail.loginUsernamePlaceholder")} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">{t("mail.passwordOrAuthCode")}</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("mail.passwordOptionalPlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("mail.imapServer")}</label>
              <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.example.com" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("mail.imapPort")}</label>
              <Input type="number" value={imapPort} onChange={(e) => setImapPort(e.target.value)} placeholder="993" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("mail.smtpServer")}</label>
              <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">{t("mail.smtpPort")}</label>
              <Input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="465" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useSsl} onChange={(e) => setUseSsl(e.target.checked)} className="h-4 w-4" />
            {t("mail.useSslTls")}
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button size="sm" onClick={handleSubmit} disabled={updateAccount.isPending}>
            {updateAccount.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
