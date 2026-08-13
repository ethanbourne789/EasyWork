import { useState, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { useTransactions, useCategories, useAccounts } from "./useFinance";
import { Button } from "@/components/ui/button";
import { Download, BarChart3, PieChart as PieIcon, TrendingUp } from "lucide-react";
import { sumMoney } from "@/lib/money";
import { getDaysInMonth } from "date-fns";
import { CHART_COLORS, INCOME_COLOR, EXPENSE_COLOR } from "./constants";

export function FinanceReport() {
  const { data: transactions = [], isError, refetch } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const monthTransactions = useMemo(
    () =>
      selectedMonth
        ? transactions.filter((t) => t.date.startsWith(selectedMonth))
        : [],
    [transactions, selectedMonth],
  );

  const monthlyData = useMemo(
    () => [
      { name: "收入", amount: sumMoney(monthTransactions.filter((t) => t.type === "income").map((t) => t.amount)) },
      { name: "支出", amount: sumMoney(monthTransactions.filter((t) => t.type === "expense").map((t) => t.amount)) },
    ],
    [monthTransactions],
  );

  const categoryData = useMemo(
    () =>
      categories
        .filter((c) => c.type === "expense")
        .map((cat) => ({
          name: cat.name,
          value: sumMoney(
            monthTransactions.filter((t) => t.type === "expense" && t.category_id === cat.id).map((t) => t.amount),
          ),
        }))
        .filter((d) => d.value > 0),
    [categories, monthTransactions],
  );

  // 趋势覆盖「所选月份」的每一天，而非固定的最近 7 天（与 monthTransactions 口径一致）
  const trendData = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr); // 1-12
    if (!year || !month) return [];
    const dayCount = getDaysInMonth(new Date(year, month - 1, 1));
    return Array.from({ length: dayCount }, (_, i) => {
      const day = i + 1;
      const dateStr = `${selectedMonth}-${String(day).padStart(2, "0")}`;
      const dayTransactions = monthTransactions.filter((t) => t.date === dateStr);
      return {
        date: `${month}/${day}`,
        income: sumMoney(dayTransactions.filter((t) => t.type === "income").map((t) => t.amount)),
        expense: sumMoney(dayTransactions.filter((t) => t.type === "expense").map((t) => t.amount)),
      };
    });
  }, [monthTransactions, selectedMonth]);

  const exportCsv = () => {
    const typeLabel: Record<string, string> = { income: "收入", expense: "支出", transfer: "转账" };
    const header = ["日期", "类型", "分类", "账户", "金额", "备注"];
    const rows = monthTransactions.map((t) => {
      const cat = categories.find((c) => c.id === t.category_id);
      const acc = accounts.find((a) => a.id === t.account_id);
      return [t.date, typeLabel[t.type] ?? t.type, cat?.name ?? "", acc?.name ?? "", String(t.amount), t.note ?? ""];
    });
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    // CSV 注入防护：以 = + - @ 开头的单元格加单引号前缀，避免被 Excel 当作公式执行
    const neutral = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);
    const csv = [header, ...rows].map((r) => r.map((c) => esc(neutral(c))).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `记账-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* 顶部控制 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-sm">
        <label className="text-sm font-medium text-muted-foreground">月份</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="h-9 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {!selectedMonth && (
          <span className="text-xs text-muted-foreground">请选择月份以查看报表</span>
        )}
        <Button variant="outline" size="sm" onClick={exportCsv} className="ml-auto gap-1">
          <Download size={14} /> 导出 CSV
        </Button>
        {isError && (
          <button type="button" onClick={() => refetch()} className="text-xs text-destructive underline">
            数据加载失败，点击重试
          </button>
        )}
      </div>

      {/* 收支对比 */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 font-medium">
          <BarChart3 size={16} className="text-brand-500" /> 月度收支对比
        </div>
        <div className="h-40 sm:h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: number) => `¥${v.toFixed(2)}`}
                contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
              />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                <Cell fill={INCOME_COLOR} />
                <Cell fill={EXPENSE_COLOR} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 分类占比 */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 font-medium">
          <PieIcon size={16} className="text-brand-500" /> 支出分类占比
        </div>
        <div className="h-40 sm:h-52">
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                </Pie>
                <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">本月暂无支出数据</div>
          )}
        </div>
      </div>

      {/* 趋势 */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 font-medium">
          <TrendingUp size={16} className="text-brand-500" /> 收支趋势（{selectedMonth}）
        </div>
        <div className="h-40 sm:h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="income" stroke={INCOME_COLOR} strokeWidth={2} dot={{ r: 3 }} name="收入" />
              <Line type="monotone" dataKey="expense" stroke={EXPENSE_COLOR} strokeWidth={2} dot={{ r: 3 }} name="支出" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
