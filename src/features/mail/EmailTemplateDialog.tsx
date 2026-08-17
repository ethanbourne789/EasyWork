import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Plus, Trash2, Edit2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  useEmailTemplates,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
} from "./useEmailTemplates";
import { toast } from "@/lib/toast";
import { confirm } from "@/lib/confirm";
import type { EmailTemplate } from "@/types";

interface EmailTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (template: EmailTemplate) => void;
}

export function EmailTemplateDialog({ open, onOpenChange, onSelect }: EmailTemplateDialogProps) {
  const { t } = useTranslation();
  const { data: templates = [] } = useEmailTemplates();
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();
  const deleteTemplate = useDeleteEmailTemplate();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);

  const handleEdit = (template: EmailTemplate) => {
    setEditingId(template.id);
    setName(template.name);
    setSubject(template.subject ?? "");
    setBody(template.body ?? "");
    setCreating(false);
  };

  const handleNew = () => {
    setEditingId(null);
    setName("");
    setSubject("");
    setBody("");
    setCreating(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) {
      toast(t("mail.templateAndContentRequired"), "error");
      return;
    }
    try {
      if (editingId) {
        await updateTemplate.mutateAsync({
          id: editingId,
          data: { name: name.trim(), subject: subject.trim() || undefined, body },
        });
      } else {
        await createTemplate.mutateAsync({
          name: name.trim(),
          subject: subject.trim() || undefined,
          body,
        });
      }
      setEditingId(null);
      setCreating(false);
      setName("");
      setSubject("");
      setBody("");
    } catch {
      // useSafeMutation 已处理错误提示
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "删除模板",
      description: "确定要删除这个邮件模板吗？",
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteTemplate.mutateAsync(id);
    } catch {
      // useSafeMutation 已处理错误提示
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setCreating(false);
    setName("");
    setSubject("");
    setBody("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("mail.emailTemplates")}</DialogTitle>
        </DialogHeader>
        <DialogClose onClose={() => onOpenChange(false)} />

        <div className="space-y-4">
          {/* 模板列表 */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {templates.length === 0 && !creating && !editingId && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("mail.noTemplates")}
              </p>
            )}
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{template.name}</div>
                  {template.subject && (
                    <div className="text-xs text-muted-foreground truncate">
                      {t("mail.subjectLabel")}{template.subject}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {onSelect && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onSelect(template);
                        onOpenChange(false);
                      }}
                    >
                      {t("mail.useTemplate")}
                    </Button>
                  )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(template)}
                      aria-label={t("mail.editTemplate")}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(template.id)}
                      aria-label={t("mail.deleteTemplate")}
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
                <label className="text-sm font-medium">{t("mail.templateName")}</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("mail.templateNameExample")}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t("mail.subjectOptional")}</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t("mail.subjectTemplatePlaceholder")}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">{t("mail.body")}</label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t("mail.templateBodyPlaceholder")}
                  className="min-h-[120px]"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                  <X className="h-4 w-4 mr-1" /> {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={createTemplate.isPending || updateTemplate.isPending}
                >
                  {editingId ? t("mail.update") : t("mail.create")}
                </Button>
              </div>
            </div>
          )}

          {/* 新建按钮 */}
          {!creating && !editingId && (
            <Button variant="outline" className="w-full gap-2" onClick={handleNew}>
              <Plus className="h-4 w-4" /> {t("mail.newTemplate")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
