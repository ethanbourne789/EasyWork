import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Category, Transaction } from "@easywork/shared"

export interface TransactionFormData {
  txnType: string
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
    txnType: "expense",
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
        txnType: editData.type,
        amount: editData.amount,
        category: editData.category,
        subcategory: editData.subcategory || "",
        note: editData.note || "",
        date: editData.date,
      })
    } else {
      setFormData({
        txnType: "expense",
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

  const filteredCategories = categories.filter((c) => c.type === formData.txnType)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] flex flex-col p-0">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>{editData ? "编辑交易" : "记一笔"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 px-6">
            {/* 类型选择 */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">类型</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={formData.txnType}
                onChange={(e) =>
                  setFormData({ ...formData, txnType: e.target.value, category: "" })
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
              <label className="text-sm font-medium mb-2 block">分类</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {filteredCategories.map((cat) => {
                  const isSelected = formData.category === cat.name
                  return (
                    <label
                      key={cat.id}
                      className={`
                        relative flex flex-col items-center justify-center gap-1 p-3 rounded-lg border-2 cursor-pointer
                        transition-all duration-200 hover:shadow-md
                        ${isSelected
                          ? "border-primary-500 bg-primary-50 dark:bg-primary-950/30 shadow-sm"
                          : "border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-surface-300 dark:hover:border-surface-600"
                        }
                      `}
                    >
                      <input
                        type="radio"
                        name="category"
                        value={cat.name}
                        checked={isSelected}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="sr-only"
                        required
                      />
                      <span className="text-2xl">{cat.icon}</span>
                      <span className="text-xs font-medium text-center leading-tight">{cat.name}</span>
                      {isSelected && (
                        <div className="absolute top-1 right-1">
                          <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </label>
                  )
                })}
              </div>
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
          </div>

          {/* 按钮固定在底部 */}
          <div className="shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-surface-200 dark:border-surface-700">
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
