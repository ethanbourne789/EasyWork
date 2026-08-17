import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Star, Reply, Forward, Trash, Download, Paperclip, X, Send, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  useToggleStar,
  useDeleteEmail,
  useEmailAttachments,
  useSendEmail,
  useEmailAttachmentDownload,
} from "./useMail";
import { sanitizeHtml } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { isTauri } from "@/lib/tauri";
import { mailApi } from "./mailApi";
import { TOAST_DURATION } from "@/lib/constants";
import { formatDateTime } from "@/lib/dateUtils";
import type { Email, EmailAttachment } from "@/types";

/**
 * 解析附件的可访问 URL。
 * Tauri 环境：本地绝对路径经 convertFileSrc 转成 asset protocol URL
 * （http://tauri.localhost/...，同源，受 assetProtocol scope 约束）。
 * 非 Tauri 环境回退 file:// 以便浏览器预览。
 */
async function resolveAttachmentUrl(attachment: EmailAttachment): Promise<string | null> {
  const path = attachment.file_path;
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:") || path.startsWith("blob:")) {
    return path;
  }
  if (!isTauri()) {
    const normalized = path.replace(/\\/g, "/");
    return `file:///${normalized}`;
  }
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(path);
}

/** 把 body_html 里的 cid:xxx 内联引用替换为本地附件 URL（在 sanitize 之前执行） */
function resolveCidHtml(html: string, attachments: EmailAttachment[], urlMap: Record<string, string>): string {
  if (!html || !attachments.length) return html;
  let out = html;
  for (const a of attachments) {
    if (!a.content_id) continue;
    const url = urlMap[a.id];
    if (!url) continue;
    const cid = a.content_id.replace(/[<>]/g, "");
    if (out.includes(`cid:${cid}`)) {
      out = out.split(`cid:${cid}`).join(url);
    }
  }
  return out;
}

interface MailReaderProps {
  email: Email | null;
  isDraft?: boolean;
  onForward?: (email: Email, to: string, subject: string, body: string) => void;
  onEditDraft?: (email: Email) => void;
  onDeleted?: () => void;
}

export function MailReader({ email, isDraft, onForward, onEditDraft, onDeleted }: MailReaderProps) {
  const { t } = useTranslation();
  const toggleStar = useToggleStar();
  const deleteEmail = useDeleteEmail();
  const sendEmail = useSendEmail();
  const downloadPending = useEmailAttachmentDownload();
  const { data: attachments = [] } = useEmailAttachments(email?.id);
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [replyMode, setReplyMode] = useState(false);
  const [forwardMode, setForwardMode] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replySent, setReplySent] = useState(false);
  const [forwardTo, setForwardTo] = useState("");
  const [forwardSubject, setForwardSubject] = useState("");
  const [forwardBody, setForwardBody] = useState("");

  // 为全部附件生成可访问 URL（urlMap 供 cid 替换与预览使用）
  // 依赖 email?.id 而非 attachments 数组，避免每次渲染新数组引用导致无限循环
  useEffect(() => {
    if (!email?.id) {
      setUrlMap({});
      setPreviewUrls({});
      return;
    }
    let cancelled = false;
    (async () => {
      const all: Record<string, string> = {};
      const previewable = (mime?: string | null) =>
        !!mime && (mime.startsWith("image/") || mime === "application/pdf");
      const preview: Record<string, string> = {};
      for (const a of attachments) {
        const url = await resolveAttachmentUrl(a);
        if (!url) continue;
        all[a.id] = url;
        if (previewable(a.mime_type)) preview[a.id] = url;
      }
      if (!cancelled) {
        setUrlMap(all);
        setPreviewUrls(preview);
      }
    })();
    return () => { cancelled = true; };
  }, [email?.id, attachments]);

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        {t("mail.selectEmailToRead")}
      </div>
    );
  }

  const handleToggleStar = () => {
    toggleStar.mutate(email.id);
  };

  const handleDelete = () => {
    deleteEmail.mutate(email.id, {
      onSuccess: () => onDeleted?.(),
    });
  };

  const handleReply = async () => {
    if (!replyBody.trim()) return;
    try {
      await sendEmail.mutateAsync({
        to: email.from_address || "",
        subject: replySubject,
        body: replyBody,
        accountId: email.account_id,
      });
      setReplyMode(false);
      setReplySubject("");
      setReplyBody("");
      setReplySent(true);
      setTimeout(() => setReplySent(false), TOAST_DURATION);
    } catch {
      toast(t("mail.replyFailed"), "error");
    }
  };

  const handleDownload = async (attachment: EmailAttachment) => {
    try {
      const saved = await mailApi.downloadAttachment(attachment.id);
      if (saved) {
        toast(t("mail.attachmentSaved", { path: saved }), "success");
      }
      // 用户取消保存对话框时静默
    } catch (e) {
      toast(t("mail.attachmentDownloadFailed", { error: e instanceof Error ? e.message : String(e) }), "error");
    }
  };

  /** 大附件按需下载：先从 IMAP 拉取到本地缓存，再弹系统保存对话框 */
  const handleDownloadPending = async (attachment: EmailAttachment) => {
    try {
      const saved = await downloadPending.mutateAsync({ emailId: email.id, attachmentId: attachment.id });
      if (saved) {
        toast(t("mail.attachmentSaved", { path: saved }), "success");
      }
      // 用户取消保存对话框时静默（附件已缓存，下次可直接保存）
    } catch (e) {
      toast(t("mail.attachmentDownloadFailed", { error: e instanceof Error ? e.message : String(e) }), "error");
    }
  };

  const handleForward = () => {
    if (forwardTo.trim() && forwardBody.trim()) {
      onForward?.(email, forwardTo, forwardSubject, forwardBody);
      setForwardMode(false);
      setForwardTo("");
      setForwardSubject("");
      setForwardBody("");
    }
  };

  const handleReplyClick = () => {
    setReplyMode(true);
    setForwardMode(false);
    setReplySubject(`Re: ${email.subject}`);
    setReplyBody(`\n\n${t("mail.replyPrefix")}\n${t("mail.fromLabel")}: ${email.from_address}\n${t("mail.subjectLabel")} ${email.subject}\n\n${email.body_text || email.body_html?.replace(/<[^>]*>/g, "") || ""}`);
  };

  const handleForwardClick = () => {
    setForwardMode(true);
    setReplyMode(false);
    setForwardSubject(`Fwd: ${email.subject}`);
    setForwardBody(`\n\n${t("mail.forwardPrefix")}\n${t("mail.fromLabel")}: ${email.from_address}\n${t("mail.subjectLabel")} ${email.subject}\n\n${email.body_text || email.body_html?.replace(/<[^>]*>/g, "") || ""}`);
  };

  return (
    <div className="flex-1 flex flex-col border-l">
      <div className="p-4 border-b">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-lg font-medium flex-1 pr-4">{email.subject}</h2>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={handleToggleStar} aria-label={t("mail.toggleStar")}>
              <Star
                className={`h-4 w-4 ${email.is_starred ? "fill-warning text-warning" : ""}`}
              />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDelete} aria-label={t("mail.deleteEmail")}>
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <Avatar name={email.from_address || ""} />
          <div className="flex-1">
            <div className="text-sm font-medium">{email.from_address}</div>
            <div className="text-xs text-muted-foreground">
              {t("mail.recipientLabel")}: {email.to_addresses}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {email.received_at && formatDateTime(new Date(email.received_at))}
          </div>
        </div>
        
        {attachments && attachments.length > 0 && (
          <div className="flex flex-col gap-2 p-2 bg-muted/50 rounded-md">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              {t("mail.attachmentsCount", { count: attachments.length })}
            </div>
            <div className="flex flex-wrap gap-3">
              {attachments.map((attachment, idx) => {
                const url = previewUrls[attachment.id];
                const isImage = attachment.mime_type?.startsWith("image/");
                const isPdf = attachment.mime_type === "application/pdf";
                // 大附件未按需下载时 file_path 为空，展示"下载"按钮触发 IMAP 拉取
                const isPending = !attachment.file_path || attachment.pending_download;
                const downloading = downloadPending.isPending && downloadPending.variables?.attachmentId === attachment.id;
                return (
                  <div key={idx} className="flex flex-col gap-1">
                    {isImage && url && (
                      <a href={url} target="_blank" rel="noreferrer">
                        <img
                          src={url}
                          alt={attachment.filename || t("mail.attachmentPreview")}
                          className="h-28 w-28 rounded-md border object-cover hover:opacity-90"
                        />
                      </a>
                    )}
                    {isPdf && url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-28 w-28 items-center justify-center rounded-md border bg-background text-xs text-brand-700 hover:opacity-90"
                      >
                        {t("mail.pdfPreview")}
                      </a>
                    )}
                    <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs">
                      <span className="truncate max-w-[150px]">{attachment.filename || t("mail.unnamedAttachment")}</span>
                      <span className="text-muted-foreground">({attachment.size ? `${(attachment.size / 1024).toFixed(1)}KB` : t("mail.unknownSize")})</span>
                      {isPending ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 px-2"
                          disabled={downloading}
                          aria-label={t("mail.attachments.download")}
                          onClick={() => handleDownloadPending(attachment)}
                        >
                          <Download className="h-3 w-3 mr-0.5" />
                          {downloading ? t("mail.attachments.downloading") : t("mail.attachments.download")}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          aria-label={t("mail.downloadAttachment")}
                          onClick={() => handleDownload(attachment)}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div
        className="flex-1 overflow-auto p-4 prose prose-sm max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{
          __html: sanitizeHtml(resolveCidHtml(email.body_html ?? email.preview_text ?? "", attachments, urlMap)),
        }}
      />

      {(replyMode || forwardMode) && (
        <div className="p-4 border-t bg-muted/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">
              {replyMode ? t("mail.replyTo") : t("mail.forwardTo")}
            </h3>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
              setReplyMode(false);
              setForwardMode(false);
            }} aria-label={t("mail.closeReply")}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          
          {replyMode && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">{t("mail.to")}:</span>
                <Input
                  value={email.from_address || ""}
                  disabled
                  className="h-8 text-sm flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">{t("mail.subject")}:</span>
                <Input
                  value={replySubject}
                  onChange={(e) => setReplySubject(e.target.value)}
                  className="h-8 text-sm flex-1"
                />
              </div>
              <div className="space-y-1">
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  className="w-full min-h-[150px] p-3 text-sm border rounded-md bg-background resize-y"
                  placeholder={t("mail.replyBodyPlaceholder")}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setReplyMode(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={!replyBody.trim() || sendEmail.isPending}
                >
                  <Send className="h-3 w-3 mr-1" />
                  {sendEmail.isPending ? t("mail.sending") : t("mail.send")}
                </Button>
              </div>
            </div>
          )}

          {forwardMode && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">{t("mail.to")}:</span>
                <Input
                  value={forwardTo}
                  onChange={(e) => setForwardTo(e.target.value)}
                  className="h-8 text-sm flex-1"
                  placeholder={t("mail.toPlaceholder")}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">{t("mail.subject")}:</span>
                <Input
                  value={forwardSubject}
                  onChange={(e) => setForwardSubject(e.target.value)}
                  className="h-8 text-sm flex-1"
                />
              </div>
              <div className="space-y-1">
                <textarea
                  value={forwardBody}
                  onChange={(e) => setForwardBody(e.target.value)}
                  className="w-full min-h-[150px] p-3 text-sm border rounded-md bg-background resize-y"
                  placeholder={t("mail.forwardBodyPlaceholder")}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setForwardMode(false)}>
                  {t("common.cancel")}
                </Button>
                <Button size="sm" onClick={handleForward} disabled={!forwardTo.trim() || !forwardBody.trim()}>
                  <Send className="h-3 w-3 mr-1" />
                  {t("mail.send")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-3 border-t flex items-center gap-2">
        {isDraft && onEditDraft && (
          <Button variant="outline" size="sm" onClick={() => onEditDraft(email)}>
            <Pencil className="h-4 w-4 mr-1" />
            {t("mail.editDraft")}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleReplyClick}>
          <Reply className="h-4 w-4 mr-1" />
          {t("mail.reply")}
        </Button>
        <Button variant="outline" size="sm" onClick={handleForwardClick}>
          <Forward className="h-4 w-4 mr-1" />
          {t("mail.forward")}
        </Button>
        {replySent && (
          <span className="ml-2 text-sm text-success">{t("mail.replySent")}</span>
        )}
      </div>
    </div>
  );
}
