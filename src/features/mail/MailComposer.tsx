import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { X, Send, Save, FileText, Signature } from "lucide-react";
import { useSendEmail, useSaveDraft, useEmailAccounts, useUpdateDraft, useDeleteEmail } from "./useMail";
import { useEmailSignatures, useEmailTemplates } from "./useEmailTemplates";
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
        title: "关闭编辑器",
        description: "有未保存的更改，确定要关闭吗？",
        confirmText: "放弃并关闭",
        cancelText: "继续编辑",
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  const handleSend = async () => {
    if (!to.trim()) {
      toast("请输入收件人", "error");
      return;
    }
    if (!subject.trim()) {
      toast("请输入主题", "error");
      return;
    }

    const invalid = [...invalidAddresses(to), ...invalidAddresses(cc)];
    if (invalid.length) {
      toast(`收件人地址格式不正确：${invalid.join("、")}`, "error");
      return;
    }

    const accountId = selectedAccountId ?? accounts[0]?.id;
    if (!accountId) {
      toast("没有可用的邮箱账号", "error");
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
        toast("邮件已发送，但草稿清理失败", "info");
      }
    }
    notify("邮件已发送", subject || undefined);
    onClose();
  };

  const handleSaveDraft = async () => {
    const accountId = selectedAccountId ?? accounts[0]?.id;
    if (!accountId) {
      return;
    }

    const invalid = [...invalidAddresses(to), ...invalidAddresses(cc)];
    if (invalid.length) {
      toast(`收件人地址格式不正确：${invalid.join("、")}`, "error");
      return;
    }

    let saved = false;
    try {
      // useSafeMutation 默认 onError 会弹出真实错误 toast，这里只拦截 rejection 用于控制流
      if (draftId) {
        await updateDraft.mutateAsync({ id: draftId, to, cc: cc || undefined, subject, body });
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-background shadow-xl">
        <div className="flex items-center justify-between border-b p-3">
          <h3 className="text-sm font-medium">{draftId ? "编辑草稿" : "撰写邮件"}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
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
            模板
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setSignatureDialogOpen(true)}
          >
            <Signature className="h-3.5 w-3.5" />
            签名
          </Button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          <div className="flex items-center gap-2">
            <label className="w-16 shrink-0 text-sm text-muted-foreground">发件账号</label>
            <div className="flex flex-1 items-center gap-2">
              <Select
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
                <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-50 dark:text-brand-700" title="该账号已绑定签名">
                  <Signature className="mr-0.5 inline-block h-3 w-3" />
                  签名
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-16 shrink-0 text-sm text-muted-foreground">收件人</label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="输入邮箱地址，多个地址用逗号分隔"
              className="flex-1"
            />
            {!showCc && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCc(true)}
                className="shrink-0"
              >
                添加抄送
              </Button>
            )}
          </div>
          {showCc && (
            <div className="flex items-center gap-2">
              <label className="w-16 shrink-0 text-sm text-muted-foreground">抄送</label>
              <Input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="输入抄送地址，多个地址用逗号分隔"
                className="flex-1"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="w-16 shrink-0 text-sm text-muted-foreground">主题</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="输入邮件主题"
              className="flex-1"
            />
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="输入邮件内容..."
            className="min-h-[200px] flex-1"
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t p-3">
          {draftSaved && (
            <span className="mr-auto text-sm text-success">草稿已保存</span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleSaveDraft}
            disabled={sendEmail.isPending || saveDraft.isPending}
          >
            <Save className="h-4 w-4" />
            {saveDraft.isPending ? "保存中..." : "保存草稿"}
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={handleSend}
            disabled={sendEmail.isPending}
          >
            <Send className="h-4 w-4" />
            {sendEmail.isPending ? "发送中..." : "发送"}
          </Button>
        </div>
      </div>
      <EmailTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onSelect={handleInsertTemplate}
      />
      <EmailSignatureDialog
        open={signatureDialogOpen}
        onOpenChange={setSignatureDialogOpen}
      />
    </div>
  );
}
