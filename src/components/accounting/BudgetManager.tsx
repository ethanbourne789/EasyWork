import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, Target } from "lucide-react"
import type { Budget } from "@easywork/shared"

interface BudgetManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  budgets: Budget[]
  totalExpense: number
  onSave: (budgets: BudgetFormData[]) => Promise<void>
}

export interface BudgetFormData {
  id?: number
  category: string
  amount: number
}

const PRESET_CATEGORIES = [
  { name: "水费", icon: "💧" },
  { name: "电费", icon: "⚡" },
  { name: "网费", icon: "🌐" },
  { name: "油费", icon: "" },
  { name: "话费", icon: "📱" },
  { name: "房租", icon: "🏠" },
  { name: "餐费", icon: "️" },
]

export function BudgetManager({
  open,
  onOpenChange,
  budgets,
  totalExpense,
  onSave,
}: BudgetManagerProps) {
  const [items, setItems] = useState<BudgetFormData[]>([])
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customName, setCustomName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setItems(budgets.map((b) => ({ id: b.id, category: b.category, amount: b.amount })))
      setShowCustomInput(false)
      setCustomName("")
    }
  }, [open, budgets])

  const totalBudget = items.reduce((sum, item) => sum + item.amount, 0)
  const budgetRemaining = totalBudget - totalExpense

  const addItem = (category: string) => {
    setItems([...items, { category, amount: 0 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateAmount = (index: number, amount: number) => {
    const newItems = [...items]
    newItems[index].amount = amount
    setItems(newItems)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(items)
      onOpenChange(false)
    } catch (error) {
      console.error("保存失败:", error)
    } finally {
      setSaving(false)
    }
  }

  const getIcon = (category: string) => {
    const preset = PRESET_CATEGORIES.find((p) => p.name === category)
    return preset?.icon || "📌"
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target size={20} />
            预算管理
          </DialogTitle>
        </DialogHeader>

        {/* 预算总额显示 */}
        <div className="bg-primary-50 dark:bg-primary-950/30 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-primary-700 dark:text-primary-400">
              预算总额
            </span>
            <span className="text-2xl font-bold text-primary-800 dark:text-primary-300">
              ¥{totalBudget.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-surface-600 dark:text-surface-400">当月已花费</span>
            <span className="text-red-600 font-medium">¥{totalExpense.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-surface-600 dark:text-surface-400">预算剩余</span>
            <span className={`font-bold ${budgetRemaining >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              ¥{budgetRemaining.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 预算分项列表 */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto mb-4">
          {items.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 rounded-lg border border-surface-200 dark:border-surface-700"
            >
              <span className="text-xl w-8 text-center">{getIcon(item.category)}</span>
              <span className="flex-1 text-sm font-medium">{item.category}</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={item.amount || ""}
                onChange={(e) => updateAmount(index, parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-24 h-8 text-right"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeItem(index)}
              >
                <Trash2 size={14} className="text-red-500" />
              </Button>
            </div>
          ))}

          {showCustomInput && (
            <div className="flex items-center gap-2 p-2 rounded-lg border border-surface-200 dark:border-surface-700">
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="自定义分类名称"
                className="flex-1 h-8"
              />
              <Button
                size="sm"
                onClick={() => {
                  if (customName.trim()) {
                    addItem(customName.trim())
                    setCustomName("")
                    setShowCustomInput(false)
                  }
                }}
              >
                添加
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCustomInput(false)
                  setCustomName("")
                }}
              >
                取消
              </Button>
            </div>
          )}
        </div>

        {/* 添加预算项按钮 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESET_CATEGORIES
            .filter((p) => !items.some((i) => i.category === p.name))
            .map((preset) => (
              <Button
                key={preset.name}
                variant="outline"
                size="sm"
                onClick={() => addItem(preset.name)}
              >
                {preset.icon} {preset.name}
              </Button>
            ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCustomInput(true)}
          >
            <Plus size={14} className="mr-1" />
            自定义
          </Button>
        </div>

        {/* 保存按钮 */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
