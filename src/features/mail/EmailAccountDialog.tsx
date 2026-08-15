import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useCreateEmailAccount,
  useUpdateEmailAccount,
  type CreateEmailAccountInput,
} from "./useMail";

/** 根据邮箱域名自动推断 IMAP/SMTP 服务器配置 */
const MAIL_PROVIDERS: Record<
  string,
  {
    imapHost: string;
    imapPort: number;
    smtpHost: string;
    smtpPort: number;
    useSsl: boolean;
  }
> = {
  "qq.com": {
    imapHost: "imap.qq.com",
    imapPort: 993,
    smtpHost: "smtp.qq.com",
    smtpPort: 465,
    useSsl: true,
  },
  "jasolar.com": {
    imapHost: "imap.qiye.163.com",
    imapPort: 993,
    smtpHost: "smtp.qiye.163.com",
    smtpPort: 465,
    useSsl: true,
  },
};

function detectMailProvider(email: string) {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (domain && MAIL_PROVIDERS[domain]) {
    return MAIL_PROVIDERS[domain];
  }
  return null;
}

interface AddAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddAccountDialog({ open, onOpenChange }: AddAccountDialogProps) {
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
      } satisfies CreateEmailAccountInput);
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
          <Button size="sm" onClick={handleSubmit} disabled={createAccount.isPending}>
            {createAccount.isPending ? t("mail.creating") : t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditAccountDialogProps {
  account: {
    id: string;
    email: string;
    display_name?: string | null;
    username?: string | null;
    imap_host: string;
    imap_port: number;
    smtp_host: string;
    smtp_port: number;
    use_ssl: boolean;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditAccountDialog({
  account,
  open,
  onOpenChange,
}: EditAccountDialogProps) {
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
            <label className="text-sm text-muted-foreground">
              {t("mail.email")} <span className="text-destructive">*</span>
            </label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            <label className="text-sm text-muted-foreground">{t("mail.passwordOrAuthCode")}</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("mail.passwordOptionalPlaceholder")}
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
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={updateAccount.isPending}
          >
            {updateAccount.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
