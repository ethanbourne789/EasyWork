import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, Send, Save, FileText, Signature } from "lucide-react";
import { useSendEmail, useSaveDraft, useEmailAccounts, useUpdateDraft, useDeleteEmail } from "./useMail";
import { useEmailSignatures, useEmailTemplates } from "./useEmailTemplates";
import { useContacts } from "./useContacts";
import { EmailTemplateDialog } from "./EmailTemplateDialog";
import { EmailSignatureDialog } from "./EmailSignatureDialog";
import { notify } from "@/lib/notify";
import { toast } from "@/lib/toast";
import { confirm } from "@/lib/confirm";
import { DRAFT_SAVE_DELAY } from "@/lib/constants";
import type { Email, EmailAccount, EmailSignature, EmailTemplate } from "@/types";

// 简单邮箱格式校验（足够拦截明显手误，不追求 RFC 完全合规）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAddresses(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function invalidAddresses(raw: string): string[] {
  return parseAddresses(raw).filter((a) => !EMAIL_RE.test(a));
}

/** 根据当前选中账号获取绑定的签名 HTML 内容 */
function getAccountSignatureHtml(
  accountId: string | undefined,
  accounts: EmailAccount[],
  signatures: EmailSignature[],
): string | null {
  if (!accountId) return null;
  const account = accounts.find((a) => a.id === accountId);
  if (!account?.signature_id) return null;
  const sig = signatures.find((s) => s.id === account.signature_id);
  return sig?.html ?? null;
}

interface MailComposerProps {
  open: boolean;
  onClose: () => void;
  /** 编辑已有草稿时传入草稿邮件 id；为空表示新建。 */
  draftId?: string;
  initialData?: {
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
  };
}

export function MailComposer({ open, onClose, draftId, initialData }: MailComposerProps) {
  const { t } = useTranslation();
  const [to, setTo] = useState(initialData?.to || "");
  const [cc, setCc] = useState(initialData?.cc || "");
  const [subject, setSubject] = useState(initialData?.subject || "");
  const [body, setBody] = useState(initialData?.body || "");
  const [showCc, setShowCc] = useState(!!initialData?.cc);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(
    undefined
  );

  const sendEmail = useSendEmail();
  const saveDraft = useSaveDraft();
  const updateDraft = useUpdateDraft();
  const deleteEmail = useDeleteEmail();
  const { data: accounts = [] } = useEmailAccounts();
  const { data: signatures = [] } = useEmailSignatures();
  const { data: contacts = [] } = useContacts();
  // 收件人联想：扁平化为 email -> 姓名 的候选列表（value 必须是纯地址以通过格式校验）
  const contactSuggestions = contacts.flatMap((c) =>
    c.emails.map((email) => ({ email, name: c.name })),
  );
  useEmailTemplates(); // 保留以触发查询缓存
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);

  // 当前选中账号绑定的签名信息
  const currentAccount = accounts.find((a) => a.id === selectedAccountId);
  const accountSignatureHtml = getAccountSignatureHtml(selectedAccountId, accounts, signatures);
  const hasSignature = currentAccount?.signature_id != null && accountSignatureHtml != null;

  useEffect(() => {
    if (open) {
      setTo(initialData?.to || "");
      setCc(initialData?.cc || "");
      setSubject(initialData?.subject || "");
      // 新建邮件时自动插入账号绑定的签名
      let initialBody = initialData?.body || "";
      if (!draftId && !initialData?.body && hasSignature && currentAccount?.signature_auto_append_new) {
        // 签名已包含在 bodyHtml 中，以 HTML 形式追加到正文后
        initialBody = `${initialBody}\n\n-- \n${accountSignatureHtml}`;
      }
      setBody(initialBody);
      setShowCc(!!initialData?.cc);
      setHasUnsavedChanges(false);
      setDraftSaved(false);
      // 默认选中第一个账号
      setSelectedAccountId((prev) => prev ?? accounts[0]?.id);
    }
  }, [open, initialData, draftId, accounts, selectedAccountId, hasSignature, currentAccount?.signature_auto_append_new, accountSignatureHtml]);

  useEffect(() => {
    const hasChanges =
      to !== (initialData?.to || "") ||
      cc !== (initialData?.cc || "") ||
      subject !== (initialData?.subject || "") ||
      body !== (initialData?.body || "");
    setHasUnsavedChanges(hasChanges);
  }, [to, cc, subject, body, initialData]);

  const handleClose = async () => {
    if (hasUnsavedChanges) {
      const ok = await confirm({
        title: t("mail.closeEditor"),
        description: t("common.discardMessage"),
        confirmText: t("common.close"),
        cancelText: t("mail.continueEditing"),
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  const handleSend = async () => {
    if (!to.trim()) {
      toast(t("mail.enterRecipient"), "error");
      return;
    }
    if (!subject.trim()) {
      toast(t("mail.enterSubject"), "error");
      return;
    }

    const invalid = [...invalidAddresses(to), ...invalidAddresses(cc)];
    if (invalid.length) {
      toast(t("mail.invalidAddress", { addresses: invalid.join("、") }), "error");
      return;
    }

    const accountId = selectedAccountId ?? accounts[0]?.id;
    if (!accountId) {
      toast(t("mail.noAccount"), "error");
      return;
    }

    let sent: Email | null = null;
    try {
      // useSafeMutation 默认 onError 会弹出真实错误 toast，这里只拦截 rejection 用于控制流
      sent = await sendEmail.mutateAsync({
        to,
        cc: cc || undefined,
        subject,
        body,
        accountId,
      });
    } catch {
      // 发送失败：不关闭编辑器，保留内容供用户重试
      return;
    }
    if (!sent) return;
    // 编辑草稿并发送后，清除原草稿行（清理失败不应阻塞已成功的发送）
    if (draftId) {
      try {
        await deleteEmail.mutateAsync(draftId);
      } catch {
        toast(t("mail.draftCleanupFailed"), "info");
      }
    }
    notify(t("mail.sent"), subject || undefined);
    onClose();
  };

  const handleSaveDraft = async () => {
    const accountId = selectedAccountId ?? accounts[0]?.id;
    if (!accountId) {
      return;
    }

    const invalid = [...invalidAddresses(to), ...invalidAddresses(cc)];
    if (invalid.length) {
      toast(t("mail.invalidAddress", { addresses: invalid.join("、") }), "error");
      return;
    }

    let saved = false;
    try {
      // useSafeMutation 默认 onError 会弹出真实错误 toast，这里只拦截 rejection 用于控制流
      if (draftId) {
        await updateDraft.mutateAsync({ id: draftId, to, cc: cc || undefined, subject, body, accountId });
      } else {
        await saveDraft.mutateAsync({
          to,
          cc: cc || undefined,
          subject,
          body,
          accountId,
        });
      }
      saved = true;
    } catch {
      return;
    }
    if (!saved) return;
    setHasUnsavedChanges(false);
    setDraftSaved(true);
    setTimeout(() => {
      setDraftSaved(false);
      onClose();
    }, DRAFT_SAVE_DELAY);
  };

  const handleInsertTemplate = (template: EmailTemplate) => {
    if (template.subject) setSubject(template.subject);
    setBody(template.body ?? "");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose} ariaLabel={t("mail.writeMail")}>
      <DialogContent className="flex h-[80vh] max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border bg-background p-0 shadow-xl">
        <div className="flex items-center justify-between border-b p-3">
          <h3 className="text-sm font-medium">{draftId ? t("mail.editDraft") : t("mail.writeMail")}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose} aria-label={t("mail.close")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2 border-b p-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setTemplateDialogOpen(true)}
          >
            <FileText className="h-3.5 w-3.5" />
            {t("mail.template")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setSignatureDialogOpen(true)}
          >
            <Signature className="h-3.5 w-3.5" />
            {t("mail.signature")}
          </Button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          <div className="flex items-center gap-2">
            <label htmlFor="mail-from-account" className="w-16 shrink-0 text-sm text-muted-foreground">{t("mail.fromAccount")}</label>
            <div className="flex flex-1 items-center gap-2">
              <Select
                id="mail-from-account"
                value={selectedAccountId ?? accounts[0]?.id ?? ""}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="flex-1"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.display_name || acc.email}
                  </option>
                ))}
              </Select>
              {hasSignature && (
                <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-50 dark:text-brand-700" title={t("mail.accountBoundSignature")}>
                  <Signature className="mr-0.5 inline-block h-3 w-3" />
                  {t("mail.signature")}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="mail-to" className="w-16 shrink-0 text-sm text-muted-foreground">{t("mail.to")}</label>
            <Input
              id="mail-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={t("mail.toPlaceholder")}
              className="flex-1"
              list="mail-contact-suggestions"
            />
            <datalist id="mail-contact-suggestions">
              {contactSuggestions.map((s) => (
                <option key={s.email} value={s.email}>{s.name}</option>
              ))}
            </datalist>
            {!showCc && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCc(true)}
                className="shrink-0"
              >
                {t("mail.addCc")}
              </Button>
            )}
          </div>
          {showCc && (
            <div className="flex items-center gap-2">
              <label htmlFor="mail-cc" className="w-16 shrink-0 text-sm text-muted-foreground">{t("mail.cc")}</label>
              <Input
                id="mail-cc"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder={t("mail.ccPlaceholder")}
                className="flex-1"
                list="mail-contact-suggestions"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="mail-subject" className="w-16 shrink-0 text-sm text-muted-foreground">{t("mail.subject")}</label>
            <Input
              id="mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("mail.subjectPlaceholder")}
              className="flex-1"
            />
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("mail.bodyPlaceholder")}
            className="min-h-[200px] flex-1"
            aria-label={t("mail.body")}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t p-3">
          {draftSaved && (
            <span className="mr-auto text-sm text-success">{t("mail.draftSaved")}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleSaveDraft}
            disabled={sendEmail.isPending || saveDraft.isPending}
          >
            <Save className="h-4 w-4" />
            {saveDraft.isPending ? t("common.saving") : t("mail.saveDraft")}
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={handleSend}
            disabled={sendEmail.isPending}
          >
            <Send className="h-4 w-4" />
            {sendEmail.isPending ? t("mail.sending") : t("mail.send")}
          </Button>
        </div>
      </DialogContent>
      <EmailTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onSelect={handleInsertTemplate}
      />
      <EmailSignatureDialog
        open={signatureDialogOpen}
        onOpenChange={setSignatureDialogOpen}
      />
    </Dialog>
  );
}
