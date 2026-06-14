import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  listTransactions,
  listCategories,
  listBudgets,
  saveAllBudgets,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  createCategory,
  updateCategory,
  deleteCategory,
  importCsv,
  exportCsv,
} from "@/lib/accounting-ipc"
import type { Transaction, Category, Budget } from "@easywork/shared"
import { TransactionForm, type TransactionFormData } from "@/components/accounting/TransactionForm"
import { CategoryManager, type CategoryFormData } from "@/components/accounting/CategoryManager"
import { BudgetManager, type BudgetFormData } from "@/components/accounting/BudgetManager"
import { Plus, TrendingUp, TrendingDown, Wallet, ChevronLeft, ChevronRight, Settings, Upload, Download, Trash2, Target, X } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"

const PIE_COLORS = [
  "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
]

function AccountingPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [showBudgetManager, setShowBudgetManager] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const monthStr = currentMonth.toString().padStart(2, "0")
      const startDate = `${currentYear}-${monthStr}-01`
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
      const endDate = `${currentYear}-${monthStr}-${daysInMonth}`

      const [txns, cats, bgs] = await Promise.all([
        listTransactions({ startDate, endDate }),
        listCategories(),
        listBudgets(currentYear, currentMonth),
      ])
      setTransactions(txns)
      setCategories(cats)
      setBudgets(bgs)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [currentYear, currentMonth])

  useEffect(() => {
    loadData()
  }, [loadData])

  const totalIncome = useMemo(
    () => transactions.filter((r) => r.type === "income").reduce((sum, r) => sum + r.amount, 0),
    [transactions],
  )
  const totalExpense = useMemo(
    () => transactions.filter((r) => r.type === "expense").reduce((sum, r) => sum + r.amount, 0),
    [transactions],
  )
  const totalBudget = useMemo(
    () => budgets.reduce((sum, b) => sum + b.amount, 0),
    [budgets],
  )
  const budgetRemaining = useMemo(
    () => totalBudget - totalExpense,
    [totalBudget, totalExpense],
  )

  const categoryIconMap = useMemo(() => {
    const map: Record<string, string> = {}
    categories.forEach((c) => { map[c.name] = c.icon })
    return map
  }, [categories])

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    transactions
      .filter((r) => r.type === "expense")
      .forEach((r) => { map[r.category] = (map[r.category] || 0) + r.amount })
    return Object.entries(map).map(([category, amount], i) => ({
      category,
      amount,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }))
  }, [transactions])

  const goPrevMonth = () => {
    if (currentMonth === 1) { setCurrentMonth(12); setCurrentYear(currentYear - 1) }
    else setCurrentMonth(currentMonth - 1)
  }
  const goNextMonth = () => {
    if (currentMonth === 12) { setCurrentMonth(1); setCurrentYear(currentYear + 1) }
    else setCurrentMonth(currentMonth + 1)
  }

  // CRUD handlers
  const handleCreateTransaction = async (data: TransactionFormData) => {
    await createTransaction(data)
    await loadData()
  }

  const handleUpdateTransaction = async (data: TransactionFormData) => {
    if (!editingTransaction) return
    await updateTransaction(editingTransaction.id, data)
    setEditingTransaction(null)
    await loadData()
  }

  const handleDeleteTransaction = async (id: number) => {
    if (!confirm("确定要删除这条记录吗？")) return
    await deleteTransaction(id)
    await loadData()
  }

  // Category handlers
  const handleCreateCategory = async (data: CategoryFormData) => {
    await createCategory(data)
    await loadData()
  }

  const handleUpdateCategory = async (id: number, data: Partial<CategoryFormData>) => {
    await updateCategory(id, data)
    await loadData()
  }

  const handleDeleteCategory = async (id: number) => {
    await deleteCategory(id)
    await loadData()
  }

  // Budget handlers
  const handleSaveBudgets = async (items: BudgetFormData[]) => {
    await saveAllBudgets(currentYear, currentMonth, items)
    await loadData()
  }

  // CSV handlers
  const handleImportCsv = async () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".csv"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      
      // 在 Tauri 环境中，我们需要使用 Tauri 的文件对话框
      // 这里简化处理，实际应该使用 @tauri-apps/api/dialog
      const filePath = file.name
      try {
        const result = await importCsv(filePath)
        alert(`导入完成：成功 ${result.successCount} 条，失败 ${result.failCount} 条`)
        await loadData()
      } catch (err) {
        alert(`导入失败：${err instanceof Error ? err.message : String(err)}`)
      }
    }
    input.click()
  }

  const handleExportCsv = async () => {
    try {
      const filePath = await exportCsv(currentYear, currentMonth)
      alert(`导出成功：${filePath}`)
    } catch (err) {
      alert(`导出失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-6 max-w-[1400px]">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-surface-200 dark:bg-surface-700 rounded w-1/4" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 bg-surface-200 dark:bg-surface-700 rounded" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-64 bg-surface-200 dark:bg-surface-700 rounded" />
            <div className="h-64 bg-surface-200 dark:bg-surface-700 rounded" />
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6 max-w-[1400px]">
        <h1 className="text-2xl font-bold tracking-tight dark:text-white">记账</h1>
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-400 font-medium">加载失败</p>
          <p className="text-red-600 dark:text-red-500 text-sm mt-1">{error}</p>
          <Button onClick={loadData} className="mt-3" variant="outline" size="sm">
            重试
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
        <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight dark:text-white">记账</h1>
          <div className="flex items-center gap-2 mt-1">
            <Button variant="ghost" size="sm" onClick={goPrevMonth}>
              <ChevronLeft size={16} />
            </Button>
            <span className="text-surface-500 text-sm">
              {currentYear}年{currentMonth}月
            </span>
            <Button variant="ghost" size="sm" onClick={goNextMonth}>
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)} title="设置">
            <Settings size={18} className="text-surface-500" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-emerald-50/50 border-emerald-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <TrendingUp size={20} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-emerald-700">本月收入</p>
                <p className="text-xl font-bold text-emerald-800">¥{totalIncome.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-50/50 border-red-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <TrendingDown size={20} className="text-red-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-red-600">本月支出</p>
                <p className="text-xl font-bold text-red-700">¥{totalExpense.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary-50/50 border-primary-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <Target size={20} className="text-primary-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-primary-700">预算剩余</p>
                <p className={`text-xl font-bold ${
                  totalBudget === 0
                    ? "text-surface-400"
                    : budgetRemaining >= 0
                      ? "text-primary-800"
                      : "text-red-600"
                }`}>
                  {totalBudget === 0 ? "--" : `¥${budgetRemaining.toLocaleString()}`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Records list */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>交易记录</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-surface-400">
                <Wallet size={48} className="mx-auto mb-2 opacity-50" />
                <p>暂无交易记录</p>
              </div>
            ) : (
              transactions.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-50 transition-colors"
                >
                  <div 
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => setEditingTransaction(record)}
                  >
                    <span className="text-lg">{categoryIconMap[record.category] || "📌"}</span>
                    <div>
                      <p className="text-sm font-medium">{record.note || record.category}</p>
                      <p className="text-xs text-surface-400">
                        {record.date} · {record.category}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${
                        record.type === "income" ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {record.type === "income" ? "+" : "-"}¥{record.amount.toLocaleString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteTransaction(record.id)
                      }}
                    >
                      <Trash2 size={14} className="text-red-500" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Expense Pie */}
        <Card>
          <CardHeader>
            <CardTitle>支出分类占比</CardTitle>
          </CardHeader>
          <CardContent>
            {expenseByCategory.length === 0 ? (
              <div className="text-center py-8 text-surface-400">
                <p className="text-sm">暂无支出数据</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={expenseByCategory}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    innerRadius={45}
                    paddingAngle={3}
                  >
                    {expenseByCategory.map((entry) => (
                      <Cell key={entry.category} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                    formatter={(v) => `¥${Number(v).toLocaleString()}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transaction Form Dialog */}
      <TransactionForm
        open={showForm}
        onOpenChange={setShowForm}
        categories={categories}
        onSubmit={handleCreateTransaction}
      />

      {/* Edit Transaction Form Dialog */}
      <TransactionForm
        open={!!editingTransaction}
        onOpenChange={() => setEditingTransaction(null)}
        categories={categories}
        onSubmit={handleUpdateTransaction}
        editData={editingTransaction}
      />

      {/* Category Manager Dialog */}
      <CategoryManager
        open={showCategoryManager}
        onOpenChange={setShowCategoryManager}
        categories={categories}
        onCreate={handleCreateCategory}
        onUpdate={handleUpdateCategory}
        onDelete={handleDeleteCategory}
      />

      {/* Budget Manager Dialog */}
      <BudgetManager
        open={showBudgetManager}
        onOpenChange={setShowBudgetManager}
        budgets={budgets}
        totalExpense={totalExpense}
        onSave={handleSaveBudgets}
      />

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowSettings(false)}>
          <div className="w-72 bg-white dark:bg-surface-900 rounded-2xl shadow-2xl p-5 space-y-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm dark:text-white">设置</h3>
              <button onClick={() => setShowSettings(false)} className="text-surface-400 hover:text-surface-600">
                <X size={16} />
              </button>
            </div>
            <button
              onClick={() => { setShowSettings(false); handleImportCsv() }}
              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors text-sm"
            >
              <Upload size={18} className="text-surface-500" />
              <span className="dark:text-surface-200">导入 CSV</span>
            </button>
            <button
              onClick={() => { setShowSettings(false); handleExportCsv() }}
              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors text-sm"
            >
              <Download size={18} className="text-surface-500" />
              <span className="dark:text-surface-200">导出 CSV</span>
            </button>
            <button
              onClick={() => { setShowSettings(false); setShowBudgetManager(true) }}
              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors text-sm"
            >
              <Target size={18} className="text-surface-500" />
              <span className="dark:text-surface-200">预算管理</span>
            </button>
            <button
              onClick={() => { setShowSettings(false); setShowCategoryManager(true) }}
              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors text-sm"
            >
              <Settings size={18} className="text-surface-500" />
              <span className="dark:text-surface-200">管理分类</span>
            </button>
          </div>
        </div>
      )}

      {/* FAB — 记一笔悬浮按钮 */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-primary-600 hover:bg-primary-700 shadow-lg flex items-center justify-center text-white transition-colors"
        title="记一笔"
      >
        <Plus size={24} />
      </button>
    </div>
  )
}

export const Route = createFileRoute("/accounting")({
  component: AccountingPage,
})
