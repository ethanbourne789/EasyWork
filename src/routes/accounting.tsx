import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { demoAccountingRecords, demoMonthlyExpenseData } from "@/data/demo-data"
import { Plus, TrendingUp, TrendingDown, Wallet } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"

const categoryIcons: Record<string, string> = {
  "工资": "💰",
  "兼职": "💼",
  "理财": "📈",
  "房租": "🏠",
  "餐饮": "🍜",
  "交通": "🚇",
  "购物": "🛍️",
  "娱乐": "🎮",
}

function AccountingPage() {
  const totalIncome = demoAccountingRecords
    .filter((r) => r.type === "income")
    .reduce((sum, r) => sum + r.amount, 0)
  const totalExpense = demoAccountingRecords
    .filter((r) => r.type === "expense")
    .reduce((sum, r) => sum + r.amount, 0)

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">记账</h1>
          <p className="text-surface-500 text-sm mt-1">6月财务概览</p>
        </div>
        <Button><Plus size={16} />记一笔</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
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
                <Wallet size={20} className="text-primary-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-primary-700">本月结余</p>
                <p className="text-xl font-bold text-primary-800">
                  ¥{(totalIncome - totalExpense).toLocaleString()}
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
            {demoAccountingRecords.map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{categoryIcons[record.category] || "📌"}</span>
                  <div>
                    <p className="text-sm font-medium">{record.description}</p>
                    <p className="text-xs text-surface-400">
                      {record.date} · {record.category} · {record.account}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    record.type === "income" ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {record.type === "income" ? "+" : "-"}¥{record.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Expense Pie */}
        <Card>
          <CardHeader>
            <CardTitle>支出分类占比</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={demoMonthlyExpenseData}
                  dataKey="amount"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={45}
                  paddingAngle={3}
                >
                  {demoMonthlyExpenseData.map((entry) => (
                    <Cell key={entry.category} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
                  formatter={(v) => `¥${Number(v).toLocaleString()}`}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/accounting")({
  component: AccountingPage,
})
