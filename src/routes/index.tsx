import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  demoDashboardStats,
  demoKanbanTasks,
  demoCalendarEvents,
  demoWeeklyFocusData,
  demoMonthlyExpenseData,
} from "@/data/demo-data"
import {
  CheckCircle2,
  CalendarDays,
  Mail,
  Clock,
  TrendingUp,
  TrendingDown,
  Target,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"

function DashboardPage() {
  const stats = demoDashboardStats

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">仪表盘</h1>
        <p className="text-surface-500 text-sm mt-1">
          欢迎回来，Ethan。今日概述一览。
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">任务进度</p>
                <p className="text-2xl font-bold mt-1">
                  {stats.tasksCompleted}/{stats.tasksTotal}
                </p>
                <p className="text-xs text-surface-400 mt-0.5">已完成</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <CheckCircle2 size={20} className="text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">日历事件</p>
                <p className="text-2xl font-bold mt-1">{stats.calendarEvents}</p>
                <p className="text-xs text-surface-400 mt-0.5">本周安排</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <CalendarDays size={20} className="text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">未读邮件</p>
                <p className="text-2xl font-bold mt-1">{stats.unreadEmails}</p>
                <p className="text-xs text-surface-400 mt-0.5">共 6 封</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Mail size={20} className="text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">专注时长</p>
                <p className="text-2xl font-bold mt-1">{stats.weeklyFocus}h</p>
                <p className="text-xs text-surface-400 mt-0.5">本周累计</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                <Clock size={20} className="text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">本月收入</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">
                  ¥{stats.monthlyIncome.toLocaleString()}
                </p>
                <p className="text-xs text-emerald-500 mt-0.5 flex items-center gap-0.5">
                  <TrendingUp size={12} /> +8.5%
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <TrendingUp size={20} className="text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">本月支出</p>
                <p className="text-2xl font-bold mt-1 text-red-500">
                  ¥{stats.monthlyExpense.toLocaleString()}
                </p>
                <p className="text-xs text-red-400 mt-0.5 flex items-center gap-0.5">
                  <TrendingDown size={12} /> -2.3%
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <TrendingDown size={20} className="text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">运动时长</p>
                <p className="text-2xl font-bold mt-1">{stats.sportMinutes}min</p>
                <p className="text-xs text-surface-400 mt-0.5">本周累计</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <Target size={20} className="text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-surface-500">结余</p>
                <p className="text-2xl font-bold mt-1 text-primary-600">
                  ¥{(stats.monthlyIncome - stats.monthlyExpense).toLocaleString()}
                </p>
                <p className="text-xs text-surface-400 mt-0.5">收支差额</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <ArrowUpRight size={20} className="text-primary-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts + List Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Focus Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>本周专注时长</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={demoWeeklyFocusData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} unit="h" />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                    fontSize: 13,
                  }}
                  formatter={(value) => [`${value}h`, "专注时长"] as [string, string]}
                />
                <Bar dataKey="hours" fill="#3b82f6" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Expense Pie */}
        <Card>
          <CardHeader>
            <CardTitle>支出分类</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={demoMonthlyExpenseData}
                  dataKey="amount"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={50}
                  paddingAngle={3}
                >
                  {demoMonthlyExpenseData.map((entry) => (
                    <Cell key={entry.category} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                    fontSize: 13,
                  }}
                  formatter={(value) => [`¥${Number(value).toLocaleString()}`, ""] as [string, string]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {demoMonthlyExpenseData.slice(0, 6).map((item) => (
                <div key={item.category} className="flex items-center gap-1.5 text-xs text-surface-600">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  {item.category}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Tasks & Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgent Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>紧急任务</CardTitle>
            <Badge variant="danger">{demoKanbanTasks.filter(t => t.priority === "urgent").length} 项</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {demoKanbanTasks
              .filter((t) => t.priority === "urgent" || t.priority === "high")
              .slice(0, 4)
              .map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-surface-50 hover:bg-surface-100 transition-colors cursor-pointer"
                >
                  <div className="w-2 h-2 rounded-full mt-2 shrink-0"
                    style={{ backgroundColor: task.priority === "urgent" ? "#ef4444" : "#f59e0b" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-surface-400 mt-0.5">
                      {task.dueDate} · {task.assignee}
                    </p>
                  </div>
                  <Badge variant={task.status === "done" ? "success" : task.status === "in_progress" ? "info" : "default"}>
                    {task.status === "in_progress" ? "进行中" : task.status === "review" ? "评审中" : "待办"}
                  </Badge>
                </div>
              ))}
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>即将到来</CardTitle>
            <Badge variant="info">{demoCalendarEvents.length} 项</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {demoCalendarEvents.slice(0, 4).map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface-50 hover:bg-surface-100 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                  <CalendarDays size={16} className="text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    {event.date} · {event.time} · {event.duration}分钟
                  </p>
                </div>
                <Badge variant={event.type === "meeting" ? "primary" : event.type === "task" ? "warning" : "default"}>
                  {event.type === "meeting" ? "会议" : event.type === "task" ? "任务" : event.type === "reminder" ? "提醒" : "个人"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* System Warnings */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">演示模式</p>
            <p className="text-xs text-amber-600">
              当前使用演示数据。连接数据库后将启用真实数据存储和同步功能。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export const Route = createFileRoute("/")({
  component: DashboardPage,
})
