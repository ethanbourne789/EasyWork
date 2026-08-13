import { useState, useMemo, useCallback } from "react";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "./useFinance";
import { EmptyState } from "./EmptyState";
import type { Category, CategoryType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Tags } from "lucide-react";
import { cn } from "@/lib/utils";
import { confirm } from "@/lib/confirm";

const ICON_CHOICES = [
  "🍜", "🍱", "🍲", "🥐", "🚇", "🚉", "🚕", "🛍️", "🧴", "👕",
  "🏠", "🔑", "🎮", "💼", "🧰", "📈", "📌", "☕", "🍔", "🚗",
  "📚", "💊", "🐱", "✈️", "🎁", "💡", "📱", "🍎", "🍷", "🏀",
];

interface FormState {
  id: string | null;
  name: string;
  type: CategoryType;
  icon: string;
  parent_id: string;
}

const emptyForm = (type: CategoryType): FormState => ({
  id: null,
  name: "",
  type,
  icon: ICON_CHOICES[0],
  parent_id: "",
});

export function CategoryManager() {
  const { data: categories = [], isLoading, isError, refetch } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm("expense"));
  const [filterType, setFilterType] = useState<CategoryType>("expense");

  const descendantIds = useCallback(
    (rootId: string): Set<string> => {
      const result = new Set<string>();
      const stack = [rootId];
      while (stack.length) {
        const cur = stack.pop()!;
        categories
          .filter((c) => c.parent_id === cur)
          .forEach((child) => {
            result.add(child.id);
            stack.push(child.id);
          });
      }
      return result;
    },
    [categories],
  );

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.type === filterType),
    [categories, filterType],
  );

  const roots = useMemo(() => visibleCategories.filter((c) => !c.parent_id), [visibleCategories]);
  const childrenOf = (id: string) => visibleCategories.filter((c) => c.parent_id === id);

  const parentOptions = useMemo(() => {
    if (!form.id) return visibleCategories;
    const banned = descendantIds(form.id);
    banned.add(form.id);
    return visibleCategories.filter((c) => !banned.has(c.id));
  }, [form.id, visibleCategories, descendantIds]);

  const openCreate = (type: CategoryType) => {
    setForm(emptyForm(type));
    setShowDialog(true);
  };

  const openEdit = (cat: Category) => {
    setForm({
      id: cat.id,
      name: cat.name,
      type: cat.type,
      icon: cat.icon ?? ICON_CHOICES[0],
      parent_id: cat.parent_id ?? "",
    });
    setShowDialog(true);
  };

  const isSaving = createCategory.isPending || updateCategory.isPending;

  const handleSave = () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      type: form.type,
      icon: form.icon,
      parent_id: form.parent_id || null,
    };
    if (form.id) {
      updateCategory.mutate({ id: form.id, data: payload }, { onSuccess: () => setShowDialog(false) });
    } else {
      createCategory.mutate(payload, { onSuccess: () => setShowDialog(false) });
    }
  };

  const handleDelete = async (cat: Category) => {
    const kids = childrenOf(cat.id);
    const msg = kids.length
      ? `确定删除「${cat.name}」吗？其 ${kids.length} 个子分类将变为顶级分类。`
      : `确定删除「${cat.name}」吗？`;
    const ok = await confirm({
      title: "删除分类",
      description: msg,
      confirmText: "删除",
      destructive: true,
    });
    if (ok) deleteCategory.mutate(cat.id);
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;
  if (isError)
    return (
      <div className="space-y-2 p-8 text-center">
        <p className="text-sm text-destructive">分类加载失败</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>重试</Button>
      </div>
    );

  const renderCategory = (cat: Category, depth: number) => (
    <div key={cat.id}>
      <div
        className="group flex items-center gap-2.5 rounded-lg border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md"
        style={{ marginLeft: depth * 16 }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-base">
          {cat.icon || "📌"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">{cat.name}</div>
          <div className="text-xs text-muted-foreground leading-tight">
            {cat.type === "income" ? "收入" : "支出"}
            {cat.parent_id ? " · 子分类" : " · 顶级"}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={() => openEdit(cat)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="编辑分类">
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(cat)}
            disabled={deleteCategory.isPending}
            className="rounded-md p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
            aria-label="删除分类"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {childrenOf(cat.id).map((child) => renderCategory(child, depth + 1))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(["expense", "income"] as CategoryType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(t)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                filterType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "expense" ? "支出分类" : "收入分类"}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => openCreate(filterType)} className="gap-1">
          <Plus size={16} /> 新建
        </Button>
      </div>

      {roots.length === 0 ? (
        <EmptyState icon={Tags} title="暂无分类" description="点击「新建」添加" />
      ) : (
        <div className="space-y-1.5">
          {roots.map((cat) => renderCategory(cat, 0))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑分类" : "新建分类"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">名称</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：餐饮" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">类型</label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CategoryType })}>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">图标</label>
              <div className="grid grid-cols-8 gap-1.5">
                {ICON_CHOICES.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setForm({ ...form, icon: ic })}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-md text-xl transition-all",
                      form.icon === ic ? "bg-brand-50 ring-1 ring-brand-300" : "hover:bg-muted",
                    )}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">父级分类（可选，支持多级）</label>
              <Select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
                <option value="">无（顶级分类）</option>
                {parentOptions
                  .filter((c) => c.id !== form.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parent_id ? "— " : ""}
                      {c.icon} {c.name}
                    </option>
                  ))}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>取消</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
