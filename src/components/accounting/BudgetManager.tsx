import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Pencil, Trash2 } from "lucide-react"
import type { Budget, Category } from "@easywork/shared"

interface BudgetManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budgets: Budget[]
  categories: Category[]
  year: number
  month: number
  onCreate: (data: BudgetFormData) => Promise<void>
  onUpdate: (id: number, data: Partial<BudgetFormData>) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

export interface BudgetFormData {
  category: string
  amount: number
  year: number
  month: number
}

export function BudgetManager({
  open,
  onOpenChange,
  budgets,
  categories,
  year,
  month,
  onCreate,
  onUpdate,
  onDelete,
}: BudgetManagerProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [formData, setFormData] = useState<BudgetFormData>({
    category: "",
    amount: 0,
    year,
    month,
  })

  useEffect(() => {
    setFormData({ category: "", amount: 0, year, month })
  }, [year, month, open])

  const resetForm = () => {
    setFormData({ category: "", amount: 0, year, month })
    setEditingBudget(null)
    setShowForm(false)
  }

  const openEditForm = (budget: Budget) => {
    setEditingBudget(budget)
    setFormData({
      category: budget.category,
      amount: budget.amount,
      year: budget.year,
      month: budget.month,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingBudget) {
      await onUpdate(editingBudget.id, formData)
    } else {
      await onCreate(formData)
    }
    resetForm()
  }

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这个预算吗？")) return
    await onDelete(id)
  }

  const expenseCategories = categories.filter((c) => c.type === "expense")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{year}年{month}月 预算管理</span>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus size={16} className="mr-1" />
              添加预算
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Budget List */}
        <div className="space-y-2">
          {budgets.length === 0 ? (
            <div className="text-center py-8 text-surface-400">
              <p>暂无预算</p>
            </div>
          ) : (
            budgets.map((budget) => (
              <div
                key={budget.id}
                className="flex items-center justify-between p-3 rounded-lg border border-surface-200 dark:border-surface-700"
              >
                <div>
                  <p className="text-sm font-medium">
                    {budget.category || "总预算"}
                  </p>
                  <p className="text-lg font-bold text-primary-600">
                    ¥{budget.amount.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEditForm(budget)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(budget.id)}>
                    <Trash2 size={14} className="text-red-500" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold mb-3">
              {editingBudget ? "编辑预算" : "添加预算"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-1 block">分类</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                >
                  <option value="">总预算</option>
                  {expenseCategories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">预算金额</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  取消
                </Button>
                <Button type="submit">
                  {editingBudget ? "保存" : "添加"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
