import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Pencil, Trash2 } from "lucide-react"
import type { Category } from "@easywork/shared"

interface CategoryManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  onCreate: (data: CategoryFormData) => Promise<void>
  onUpdate: (id: number, data: Partial<CategoryFormData>) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export interface CategoryFormData {
  name: string
  type: string
  icon: string
  color: string
  parentId: number
  sortOrder: number
}

const TYPE_LABELS: Record<string, string> = {
  income: "收入",
  expense: "支出",
  investment: "投资",
  transfer: "转账",
}

export function CategoryManager({
  open,
  onOpenChange,
  categories,
  onCreate,
  onUpdate,
  onDelete,
}: CategoryManagerProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [formData, setFormData] = useState<CategoryFormData>({
    name: "",
    type: "expense",
    icon: "",
    color: "",
    parentId: 0,
    sortOrder: 0,
  })

  const resetForm = () => {
    setFormData({
      name: "",
      type: "expense",
      icon: "",
      color: "",
      parentId: 0,
      sortOrder: 0,
    })
    setEditingCategory(null)
    setShowForm(false)
  }

  const openEditForm = (category: Category) => {
    setEditingCategory(category)
    setFormData({
      name: category.name,
      type: category.type,
      icon: category.icon,
      color: category.color,
      parentId: category.parentId,
      sortOrder: category.sortOrder,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingCategory) {
      await onUpdate(editingCategory.id, formData)
    } else {
      await onCreate(formData)
    }
    resetForm()
  }

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这个分类吗？")) return
    await onDelete(id)
  }

  // Group categories by type
  const groupedCategories = categories.reduce((acc, cat) => {
    if (!acc[cat.type]) acc[cat.type] = []
    acc[cat.type].push(cat)
    return acc
  }, {} as Record<string, Category[]>)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>分类管理</span>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus size={16} className="mr-1" />
              添加分类
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Category List */}
        <div className="space-y-6">
          {Object.entries(groupedCategories).map(([type, cats]) => (
            <div key={type}>
              <h3 className="text-sm font-semibold mb-2 text-surface-700 dark:text-surface-300">
                {TYPE_LABELS[type] || type}
              </h3>
              <div className="space-y-1">
                {(cats as Category[]).map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-2 rounded hover:bg-surface-50 dark:hover:bg-surface-800"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cat.icon || "📌"}</span>
                      <span className="text-sm">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditForm(cat)}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(cat.id)}
                      >
                        <Trash2 size={14} className="text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold mb-3">
              {editingCategory ? "编辑分类" : "添加分类"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">名称</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="分类名称"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">类型</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  disabled={!!editingCategory}
                >
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                  <option value="investment">投资</option>
                  <option value="transfer">转账</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">图标</label>
                <Input
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="Emoji 图标，如 🍔"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">排序</label>
                <Input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) =>
                    setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })
                  }
                  placeholder="数字越小越靠前"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  取消
                </Button>
                <Button type="submit">
                  {editingCategory ? "保存" : "添加"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
