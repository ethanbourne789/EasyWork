import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Category, Transaction } from "@easywork/shared"

export interface TransactionFormData {
  type: string
  amount: number
  category: string
  subcategory: string
  note: string
  date: string
}

interface TransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  onSubmit: (data: TransactionFormData) => Promise<void>
  editData?: Transaction | null
}

export function TransactionForm({
  open,
  onOpenChange,
  categories,
  onSubmit,
  editData,
}: TransactionFormProps) {
  const [formData, setFormData] = useState<TransactionFormData>({
    type: "expense",
    amount: 0,
    category: "",
    subcategory: "",
    note: "",
    date: new Date().toISOString().split("T")[0],
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (editData) {
      setFormData({
        type: editData.type,
        amount: editData.amount,
        category: editData.category,
        subcategory: editData.subcategory || "",
        note: editData.note || "",
        date: editData.date,
      })
    } else {
      setFormData({
        type: "expense",
        amount: 0,
        category: "",
        subcategory: "",
        note: "",
        date: new Date().toISOString().split("T")[0],
      })
    }
  }, [editData, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.amount <= 0 || !formData.category) return
    setSubmitting(true)
    try {
      await onSubmit(formData)
      onOpenChange(false)
    } catch (error) {
      console.error("提交失败:", error)
    } finally {
      setSubmitting(false)
    }
  }

  const filteredCategories = categories.filter((c) => c.type === formData.type)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editData ? "编辑交易" : "记一笔"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 类型选择 */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">类型</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value, category: "" })
              }
            >
              <option value="expense">支出</option>
              <option value="income">收入</option>
              <option value="investment">投资</option>
              <option value="transfer">转账</option>
            </select>
          </div>

          {/* 金额 */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">金额</label>
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

          {/* 分类 */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">分类</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              required
            >
              <option value="">选择分类</option>
              {filteredCategories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* 日期 */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">日期</label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          {/* 备注 */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">备注</label>
            <Input
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="可选"
            />
          </div>

          {/* 提交按钮 */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "提交中..." : editData ? "保存" : "添加"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
