import { useState } from "react";
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
      toast("模板名称和内容不能为空", "error");
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
          <DialogTitle>邮件模板</DialogTitle>
        </DialogHeader>
        <DialogClose onClose={() => onOpenChange(false)} />

        <div className="space-y-4">
          {/* 模板列表 */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {templates.length === 0 && !creating && !editingId && (
              <p className="text-sm text-muted-foreground text-center py-4">
                暂无模板，点击下方按钮创建
              </p>
            )}
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  {t.subject && (
                    <div className="text-xs text-muted-foreground truncate">
                      主题：{t.subject}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {onSelect && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        onSelect(t);
                        onOpenChange(false);
                      }}
                    >
                      使用
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(t)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(t.id)}
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
                <label className="text-sm font-medium">模板名称</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：会议邀请"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">主题（可选）</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="邮件主题模板"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">正文</label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="邮件正文内容..."
                  className="min-h-[120px]"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                  <X className="h-4 w-4 mr-1" /> 取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={createTemplate.isPending || updateTemplate.isPending}
                >
                  {editingId ? "更新" : "创建"}
                </Button>
              </div>
            </div>
          )}

          {/* 新建按钮 */}
          {!creating && !editingId && (
            <Button variant="outline" className="w-full gap-2" onClick={handleNew}>
              <Plus className="h-4 w-4" /> 新建模板
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
