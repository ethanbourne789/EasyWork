import { useState, useMemo, useCallback } from "react";
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      ? t('finance.deleteCategoryWithChildren', { name: cat.name, count: kids.length })
      : t('finance.deleteCategoryConfirm', { name: cat.name });
    const ok = await confirm({
      title: t('finance.deleteCategory'),
      description: msg,
      confirmText: t('common.delete'),
      destructive: true,
    });
    if (ok) deleteCategory.mutate(cat.id);
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">{t('common.loading')}</div>;
  if (isError)
    return (
      <div className="space-y-2 p-8 text-center">
        <p className="text-sm text-destructive">{t('finance.categoryLoadFailed')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button>
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
            {cat.type === "income" ? t('finance.income') : t('finance.expense')}
            {cat.parent_id ? ` · ${t('finance.subcategory')}` : ` · ${t('finance.topLevel')}`}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button type="button" onClick={() => openEdit(cat)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label={t('finance.editCategory')}>
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(cat)}
            disabled={deleteCategory.isPending}
            className="rounded-md p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
            aria-label={t('finance.deleteCategory')}
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
          {(["expense", "income"] as CategoryType[]).map((ct) => (
            <button
              key={ct}
              type="button"
              onClick={() => setFilterType(ct)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                filterType === ct ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {ct === "expense" ? t('finance.expenseCategories') : t('finance.incomeCategories')}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => openCreate(filterType)} className="gap-1">
          <Plus size={16} /> {t('finance.newCategoryBtn')}
        </Button>
      </div>

      {roots.length === 0 ? (
        <EmptyState icon={Tags} title={t('finance.noCategories')} description={t('finance.noCategoriesDesc')} />
      ) : (
        <div className="space-y-1.5">
          {roots.map((cat) => renderCategory(cat, 0))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? t('finance.editCategory') : t('finance.newCategory')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label htmlFor="category-name" className="text-sm font-medium">{t('finance.categoryName')}</label>
              <Input id="category-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('finance.categoryNamePlaceholder')} />
            </div>

            <div className="space-y-1">
              <label htmlFor="category-type" className="text-sm font-medium">{t('finance.categoryType')}</label>
              <Select id="category-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CategoryType })}>
                <option value="expense">{t('finance.expense')}</option>
                <option value="income">{t('finance.income')}</option>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">{t('finance.categoryIcon')}</label>
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
              <label htmlFor="parent-category" className="text-sm font-medium">{t('finance.parentCategory')}</label>
              <Select id="parent-category" value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
                <option value="">{t('finance.noParent')}</option>
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
            <Button variant="outline" onClick={() => setShowDialog(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? t('finance.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
