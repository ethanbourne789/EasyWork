import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Signature, Plus, Trash2, Edit2, Star, X, Bold, Italic, List, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  useEmailSignatures,
  useCreateEmailSignature,
  useUpdateEmailSignature,
  useDeleteEmailSignature,
} from "./useEmailTemplates";
import { toast } from "@/lib/toast";
import { confirm } from "@/lib/confirm";
import type { EmailSignature } from "@/types";

interface EmailSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmailSignatureDialog({ open, onOpenChange }: EmailSignatureDialogProps) {
  const { t } = useTranslation();
  const { data: signatures = [] } = useEmailSignatures();
  const createSignature = useCreateEmailSignature();
  const updateSignature = useUpdateEmailSignature();
  const deleteSignature = useDeleteEmailSignature();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [creating, setCreating] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // 编辑时填入编辑器内容
  useEffect(() => {
    if (editorRef.current && (creating || editingId)) {
      editorRef.current.innerHTML = htmlContent;
    }
  }, [creating, editingId, htmlContent]);

  const handleEdit = (sig: EmailSignature) => {
    setEditingId(sig.id);
    setName(sig.name);
    setHtmlContent(sig.html);
    setIsDefault(sig.is_default);
    setCreating(false);
  };

  const handleNew = () => {
    setEditingId(null);
    setName("");
    setHtmlContent("");
    setIsDefault(false);
    setCreating(true);
  };

  // 富文本编辑器内容变化时同步到 state
  const handleEditorInput = useCallback(() => {
    if (editorRef.current) {
      setHtmlContent(editorRef.current.innerHTML);
    }
  }, []);

  // 执行富文本命令
  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    handleEditorInput();
    editorRef.current?.focus();
  };

  const execLink = () => {
    const url = prompt(t("mail.linkUrlPlaceholder"), "https://");
    if (url) execCmd("createLink", url);
  };

  const handleSave = async () => {
    if (!name.trim() || !htmlContent.trim() || htmlContent === "<br>") {
      toast(t("mail.signatureAndContentRequired"), "error");
      return;
    }
    try {
      if (editingId) {
        await updateSignature.mutateAsync({
          id: editingId,
          data: { name: name.trim(), html: htmlContent, is_default: isDefault },
        });
      } else {
        await createSignature.mutateAsync({
          name: name.trim(),
          html: htmlContent,
          is_default: isDefault,
        });
      }
      setEditingId(null);
      setCreating(false);
      setName("");
      setHtmlContent("");
      setIsDefault(false);
    } catch {
      // useSafeMutation 已处理错误提示
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t("mail.deleteSignature"),
      description: t("mail.deleteSignatureConfirm"),
      confirmText: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteSignature.mutateAsync(id);
    } catch {
      // useSafeMutation 已处理错误提示
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await updateSignature.mutateAsync({
        id,
        data: { is_default: true },
      });
    } catch {
      // useSafeMutation 已处理错误提示
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setCreating(false);
    setName("");
    setHtmlContent("");
    setIsDefault(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("mail.emailSignatures")}</DialogTitle>
        </DialogHeader>
        <DialogClose onClose={() => onOpenChange(false)} />

        <div className="space-y-4">
          {/* 签名列表 */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {signatures.length === 0 && !creating && !editingId && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("mail.noSignatures")}
              </p>
            )}
            {signatures.map((sig) => (
              <div
                key={sig.id}
                className="flex items-start gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <Signature className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{sig.name}</span>
                    {sig.is_default && (
                      <span className="text-xs text-primary font-medium">{t("mail.defaultLabel")}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-3">
                    <div dangerouslySetInnerHTML={{ __html: sig.html }} />
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!sig.is_default && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleSetDefault(sig.id)}
                      title={t("mail.setDefault")}
                      aria-label={t("mail.setDefault")}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(sig)}
                    aria-label={t("mail.editSignature")}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(sig.id)}
                    aria-label={t("mail.deleteSignature")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* 编辑/新建表单 */}
          {(creating || editingId) && (
            <div className="space-y-3 border-t pt-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">{t("mail.signatureName")}</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("mail.signatureNameExample")}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t("mail.signatureContent")}</label>
                {/* 富文本工具栏 */}
                <div className="flex items-center gap-1 rounded-t-md border border-b-0 bg-muted/30 p-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => execCmd("bold")}
                    title={t("mail.bold")}
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => execCmd("italic")}
                    title={t("mail.italic")}
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => execCmd("insertUnorderedList")}
                    title={t("mail.list")}
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={execLink}
                    title={t("mail.link")}
                  >
                    <Link className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleEditorInput}
                  className="min-h-[120px] rounded-b-md border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary prose prose-sm max-w-none"
                  data-placeholder={t("mail.signatureContentPlaceholder")}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm">{t("mail.setAsDefaultSignature")}</span>
              </label>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                  <X className="h-4 w-4 mr-1" /> {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={createSignature.isPending || updateSignature.isPending}
                >
                  {editingId ? t("mail.update") : t("mail.create")}
                </Button>
              </div>
            </div>
          )}

          {/* 新建按钮 */}
          {!creating && !editingId && (
            <Button variant="outline" className="w-full gap-2" onClick={handleNew}>
              <Plus className="h-4 w-4" /> {t("mail.newSignature")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
