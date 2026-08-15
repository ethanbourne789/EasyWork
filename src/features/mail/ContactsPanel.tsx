import { useEffect, useMemo, useRef, useState } from "react";
import {
  Users, UserPlus, Upload, Download, Search, Trash2, Pencil, Plus, X, Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { mailApi } from "./mailApi";
import {
  useContacts, useContactGroups, useSaveContact, useDeleteContact,
  useSaveContactGroup, useDeleteContactGroup, useImportVcf,
} from "./useContacts";
import type { Contact } from "@/types";

const EMPTY_CONTACT: Contact = {
  id: "", name: "", emails: [], phones: [], company: null, title: null,
  notes: null, group_ids: [], created_at: "", updated_at: "",
};

/** 联系人管理面板：增删改查 + 分组 + VCF 导入导出 */
export function ContactsPanel() {
  const [activeGroupId, setActiveGroupId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contact | null>(null);
  const [groupDialog, setGroupDialog] = useState<{ id?: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: groups = [] } = useContactGroups();
  const { data: contacts = [], isLoading } = useContacts(activeGroupId, search || undefined);
  const saveContact = useSaveContact();
  const deleteContact = useDeleteContact();
  const saveGroup = useSaveContactGroup();
  const deleteGroup = useDeleteContactGroup();
  const importVcf = useImportVcf();

  const groupName = useMemo(
    () => groups.find((g) => g.id === activeGroupId)?.name,
    [groups, activeGroupId],
  );

  const handleExport = async () => {
    try {
      const vcf = await mailApi.contactExportVcf(activeGroupId);
      const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `联系人${groupName ? `-${groupName}` : ""}-${new Date().toISOString().slice(0, 10)}.vcf`;
      a.click();
      URL.revokeObjectURL(url);
      toast("导出成功", "success");
    } catch (e) {
      toast(`导出失败：${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const count = await importVcf.mutateAsync(text);
      toast(`成功导入 ${count} 个联系人`, "success");
    } catch (e) {
      toast(`导入失败：${e instanceof Error ? e.message : String(e)}`, "error");
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* 分组侧栏：桌面固定，移动端隐藏（用顶部横向 chips 代替） */}
      <aside className="hidden w-[180px] shrink-0 flex-col border-r md:flex">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">分组</span>
          <Button
            variant="ghost" size="icon" className="h-7 w-7" aria-label="新建分组"
            onClick={() => setGroupDialog({ name: "" })}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          <GroupItem
            label="全部联系人" count={contacts.length} active={!activeGroupId}
            onClick={() => setActiveGroupId(undefined)}
          />
          {groups.map((g) => (
            <GroupItem
              key={g.id} label={g.name} count={g.member_count}
              active={activeGroupId === g.id}
              onClick={() => setActiveGroupId(g.id)}
              onEdit={() => setGroupDialog({ id: g.id, name: g.name })}
              onDelete={() => {
                if (confirm(`删除分组「${g.name}」？（不会删除联系人）`)) {
                  deleteGroup.mutate(g.id, {
                    onSuccess: () => {
                      if (activeGroupId === g.id) setActiveGroupId(undefined);
                      toast("分组已删除", "success");
                    },
                  });
                }
              }}
            />
          ))}
        </nav>
      </aside>

      {/* 主区域 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <div className="relative min-w-[180px] flex-1 md:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索姓名 / 邮箱 / 公司"
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">导入 VCF</span>
            </Button>
            <Button variant="ghost" size="sm" className="gap-1" onClick={handleExport}>
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">导出 VCF</span>
            </Button>
            <Button size="sm" className="gap-1" onClick={() => setEditing({ ...EMPTY_CONTACT })}>
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">新建联系人</span>
            </Button>
          </div>
          <input
            ref={fileInputRef} type="file" accept=".vcf,text/vcard" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.target.value = "";
            }}
          />
        </div>

        {/* 移动端分组 chips */}
        <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2 md:hidden">
          <Badge
            variant={!activeGroupId ? "default" : "outline"}
            className="cursor-pointer shrink-0"
            onClick={() => setActiveGroupId(undefined)}
          >
            全部
          </Badge>
          {groups.map((g) => (
            <Badge
              key={g.id}
              variant={activeGroupId === g.id ? "default" : "outline"}
              className="cursor-pointer shrink-0"
              onClick={() => setActiveGroupId(g.id)}
            >
              {g.name}
            </Badge>
          ))}
        </div>

        {/* 联系人列表 */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">加载中…</div>
          ) : contacts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <Users className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">暂无联系人</p>
              <p className="text-sm text-muted-foreground">
                点击「新建联系人」或「导入 VCF」开始管理你的联系人
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-accent"
                  onClick={() => setEditing(c)}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                    {(c.name || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      {c.company && (
                        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                          {c.company}{c.title ? ` · ${c.title}` : ""}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">
                      {c.emails[0] ?? c.phones[0] ?? "—"}
                    </div>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="删除联系人"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`删除联系人「${c.name}」？`)) {
                        deleteContact.mutate(c.id, {
                          onSuccess: () => toast("联系人已删除", "success"),
                        });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 新建/编辑联系人对话框 */}
      <ContactEditDialog
        contact={editing}
        groups={groups}
        onClose={() => setEditing(null)}
        onSave={(c) => {
          saveContact.mutate(c, {
            onSuccess: () => {
              setEditing(null);
              toast("联系人已保存", "success");
            },
          });
        }}
        saving={saveContact.isPending}
      />

      {/* 新建/重命名分组对话框 */}
      <Dialog open={!!groupDialog} onOpenChange={(open) => !open && setGroupDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{groupDialog?.id ? "重命名分组" : "新建分组"}</DialogTitle>
          </DialogHeader>
          <DialogClose onClose={() => setGroupDialog(null)} />
          <div className="space-y-3">
            <Input
              value={groupDialog?.name ?? ""}
              onChange={(e) => setGroupDialog((d) => d && { ...d, name: e.target.value })}
              placeholder="分组名称，如：家人、同事"
              onKeyDown={(e) => {
                if (e.key === "Enter" && groupDialog?.name.trim()) {
                  saveGroup.mutate(
                    { id: groupDialog.id, name: groupDialog.name.trim() },
                    { onSuccess: () => setGroupDialog(null) },
                  );
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGroupDialog(null)}>取消</Button>
              <Button
                disabled={!groupDialog?.name.trim() || saveGroup.isPending}
                onClick={() => {
                  if (!groupDialog?.name.trim()) return;
                  saveGroup.mutate(
                    { id: groupDialog.id, name: groupDialog.name.trim() },
                    { onSuccess: () => setGroupDialog(null) },
                  );
                }}
              >
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupItem(props: {
  label: string; count: number; active: boolean;
  onClick: () => void; onEdit?: () => void; onDelete?: () => void;
}) {
  return (
    <div
      className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
        props.active ? "bg-brand-50 font-medium text-brand-700" : "hover:bg-accent"
      }`}
      onClick={props.onClick}
    >
      <Folder className={`h-4 w-4 shrink-0 ${props.active ? "text-brand-500" : "text-muted-foreground"}`} />
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      <span className="text-xs text-muted-foreground">{props.count}</span>
      {props.onEdit && (
        <span className="hidden shrink-0 items-center group-hover:flex">
          <button
            className="rounded p-0.5 hover:bg-accent" aria-label="重命名分组"
            onClick={(e) => { e.stopPropagation(); props.onEdit?.(); }}
          >
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
          <button
            className="rounded p-0.5 hover:bg-accent" aria-label="删除分组"
            onClick={(e) => { e.stopPropagation(); props.onDelete?.(); }}
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </span>
      )}
    </div>
  );
}

/** 多值字段（邮箱/电话）编辑：动态行 */
function MultiValueEditor(props: {
  label: string; values: string[]; placeholder: string; type?: string;
  onChange: (values: string[]) => void;
}) {
  const rows = props.values.length > 0 ? props.values : [""];
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{props.label}</label>
      {rows.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={v}
            type={props.type ?? "text"}
            placeholder={props.placeholder}
            onChange={(e) => {
              const next = [...rows];
              next[i] = e.target.value;
              props.onChange(next.filter((x, j) => x.trim() || j === rows.length - 1));
            }}
          />
          {rows.length > 1 && (
            <Button
              variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="移除"
              onClick={() => props.onChange(rows.filter((_, j) => j !== i))}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <Button
        variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs"
        onClick={() => props.onChange([...rows, ""])}
      >
        <Plus className="h-3 w-3" /> 添加{props.label}
      </Button>
    </div>
  );
}

function ContactEditDialog(props: {
  contact: Contact | null;
  groups: { id: string; name: string }[];
  onClose: () => void;
  onSave: (c: Contact) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<Contact | null>(null);

  // 打开/切换联系人时用传入值初始化本地草稿
  useEffect(() => {
    setDraft(props.contact ? { ...props.contact } : null);
  }, [props.contact]);

  const current = draft;
  const update = (patch: Partial<Contact>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const close = () => {
    setDraft(null);
    props.onClose();
  };

  const canSave = !!current?.name.trim() && !props.saving;

  return (
    <Dialog open={!!props.contact} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{props.contact?.id ? "编辑联系人" : "新建联系人"}</DialogTitle>
        </DialogHeader>
        <DialogClose onClose={close} />
        {current && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">姓名 *</label>
              <Input
                value={current.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="联系人姓名"
              />
            </div>
            <MultiValueEditor
              label="邮箱" values={current.emails} type="email"
              placeholder="name@example.com"
              onChange={(emails) => update({ emails })}
            />
            <MultiValueEditor
              label="电话" values={current.phones} type="tel"
              placeholder="138 0000 0000"
              onChange={(phones) => update({ phones })}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">公司</label>
                <Input
                  value={current.company ?? ""}
                  onChange={(e) => update({ company: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">职位</label>
                <Input
                  value={current.title ?? ""}
                  onChange={(e) => update({ title: e.target.value || null })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">备注</label>
              <Textarea
                value={current.notes ?? ""}
                rows={2}
                onChange={(e) => update({ notes: e.target.value || null })}
              />
            </div>
            {props.groups.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">所属分组</label>
                <div className="flex flex-wrap gap-3">
                  {props.groups.map((g) => (
                    <label key={g.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={current.group_ids.includes(g.id)}
                        onCheckedChange={(checked) => {
                          const ids = checked
                            ? [...current.group_ids, g.id]
                            : current.group_ids.filter((x) => x !== g.id);
                          update({ group_ids: ids });
                        }}
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => { setDraft(null); props.onClose(); }}>
                取消
              </Button>
              <Button disabled={!canSave} onClick={() => props.onSave(current)}>
                {props.saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
