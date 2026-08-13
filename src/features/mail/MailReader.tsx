import { useState, useEffect } from "react";
import { Star, Reply, Forward, Trash, Download, Paperclip, X, Send, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  useToggleStar,
  useDeleteEmail,
  useEmailAttachments,
  useSendEmail,
} from "./useMail";
import { sanitizeHtml } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { TOAST_DURATION } from "@/lib/constants";
import { formatDateTime } from "@/lib/dateUtils";
import type { Email, EmailAttachment } from "@/types";

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 解析附件的可访问 URL。
 * Tauri 本地模式下附件存储在本地文件系统，file_path 已是可直接访问的本地路径或 file:// URL。
 * 兼容 http/data/blob 外链场景。
 */
function resolveAttachmentUrl(attachment: EmailAttachment): string | null {
  const path = attachment.file_path;
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:") || path.startsWith("blob:") || path.startsWith("file:")) {
    return path;
  }
  // 本地绝对路径：转为 file:// URL 供 WebView 加载
  // Windows 路径形如 C:\Users\... -> file:///C:/Users/...
  const normalized = path.replace(/\\/g, "/");
  return `file:///${normalized}`;
}

interface MailReaderProps {
  email: Email | null;
  isDraft?: boolean;
  onForward?: (email: Email, to: string, subject: string, body: string) => void;
  onEditDraft?: (email: Email) => void;
  onDeleted?: () => void;
}

export function MailReader({ email, isDraft, onForward, onEditDraft, onDeleted }: MailReaderProps) {
  const toggleStar = useToggleStar();
  const deleteEmail = useDeleteEmail();
  const sendEmail = useSendEmail();
  const { data: attachments = [] } = useEmailAttachments(email?.id);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [replyMode, setReplyMode] = useState(false);
  const [forwardMode, setForwardMode] = useState(false);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replySent, setReplySent] = useState(false);
  const [forwardTo, setForwardTo] = useState("");
  const [forwardSubject, setForwardSubject] = useState("");
  const [forwardBody, setForwardBody] = useState("");

  // 为图片/PDF 附件预取可访问 URL，用于内联预览
  // 依赖 email?.id 而非 attachments 数组，避免每次渲染新数组引用导致无限循环
  useEffect(() => {
    if (!email?.id) {
      setPreviewUrls({});
      return;
    }
    const previewable = (mime?: string | null) =>
      !!mime && (mime.startsWith("image/") || mime === "application/pdf");
    const map: Record<string, string> = {};
    for (const a of attachments) {
      if (!previewable(a.mime_type)) continue;
      const url = resolveAttachmentUrl(a);
      if (url) map[a.id] = url;
    }
    setPreviewUrls(map);
  }, [email?.id, attachments]);

  if (!email) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        选择一封邮件查看
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
      /* 发送失败时保持回复表单 */
    }
  };

  const handleDownload = (attachment: EmailAttachment) => {
    const filename = attachment.filename || "attachment";
    const url = resolveAttachmentUrl(attachment);
    if (!url) {
      toast("该附件没有可用的存储路径", "error");
      return;
    }
    triggerDownload(url, filename);
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
    setReplyBody(`\n\n--- 原始邮件 ---\n发件人: ${email.from_address}\n主题: ${email.subject}\n\n${email.body_text || email.body_html?.replace(/<[^>]*>/g, "") || ""}`);
  };

  const handleForwardClick = () => {
    setForwardMode(true);
    setReplyMode(false);
    setForwardSubject(`Fwd: ${email.subject}`);
    setForwardBody(`\n\n--- 转发的邮件 ---\n发件人: ${email.from_address}\n主题: ${email.subject}\n\n${email.body_text || email.body_html?.replace(/<[^>]*>/g, "") || ""}`);
  };

  return (
    <div className="flex-1 flex flex-col border-l">
      <div className="p-4 border-b">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-lg font-medium flex-1 pr-4">{email.subject}</h2>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={handleToggleStar}>
              <Star
                className={`h-4 w-4 ${email.is_starred ? "fill-yellow-400 text-yellow-400" : ""}`}
              />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDelete}>
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <Avatar name={email.from_address || ""} />
          <div className="flex-1">
            <div className="text-sm font-medium">{email.from_address}</div>
            <div className="text-xs text-muted-foreground">
              收件人: {email.to_addresses}
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
              附件（{attachments.length}）
            </div>
            <div className="flex flex-wrap gap-3">
              {attachments.map((attachment, idx) => {
                const url = previewUrls[attachment.id];
                const isImage = attachment.mime_type?.startsWith("image/");
                const isPdf = attachment.mime_type === "application/pdf";
                return (
                  <div key={idx} className="flex flex-col gap-1">
                    {isImage && url && (
                      <a href={url} target="_blank" rel="noreferrer">
                        <img
                          src={url}
                          alt={attachment.filename || "附件预览"}
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
                        PDF 预览
                      </a>
                    )}
                    <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs">
                      <span className="truncate max-w-[150px]">{attachment.filename || '未命名文件'}</span>
                      <span className="text-muted-foreground">({attachment.size ? `${(attachment.size / 1024).toFixed(1)}KB` : '未知大小'})</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        aria-label="下载附件"
                        onClick={() => handleDownload(attachment)}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
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
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(email.body_html ?? email.preview_text ?? "") }}
      />

      {(replyMode || forwardMode) && (
        <div className="p-4 border-t bg-muted/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">
              {replyMode ? "回复邮件" : "转发邮件"}
            </h3>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
              setReplyMode(false);
              setForwardMode(false);
            }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          
          {replyMode && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">收件人:</span>
                <Input
                  value={email.from_address || ""}
                  disabled
                  className="h-8 text-sm flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">主题:</span>
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
                  placeholder="输入回复内容..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setReplyMode(false)}>
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={!replyBody.trim() || sendEmail.isPending}
                >
                  <Send className="h-3 w-3 mr-1" />
                  {sendEmail.isPending ? "发送中..." : "发送"}
                </Button>
              </div>
            </div>
          )}

          {forwardMode && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">收件人:</span>
                <Input
                  value={forwardTo}
                  onChange={(e) => setForwardTo(e.target.value)}
                  className="h-8 text-sm flex-1"
                  placeholder="输入收件人地址"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">主题:</span>
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
                  placeholder="输入转发内容..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setForwardMode(false)}>
                  取消
                </Button>
                <Button size="sm" onClick={handleForward} disabled={!forwardTo.trim() || !forwardBody.trim()}>
                  <Send className="h-3 w-3 mr-1" />
                  发送
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
            编辑草稿
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleReplyClick}>
          <Reply className="h-4 w-4 mr-1" />
          回复
        </Button>
        <Button variant="outline" size="sm" onClick={handleForwardClick}>
          <Forward className="h-4 w-4 mr-1" />
          转发
        </Button>
        {replySent && (
          <span className="ml-2 text-sm text-success">回复已发送</span>
        )}
      </div>
    </div>
  );
}
