import { useState, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { useTransactions, useCategories, useAccounts } from "./useFinance";
import { Button } from "@/components/ui/button";
import { Download, BarChart3, PieChart as PieIcon, TrendingUp } from "lucide-react";
import { sumMoney } from "@/lib/money";
import { getDaysInMonth } from "date-fns";
import { CHART_COLORS, INCOME_COLOR, EXPENSE_COLOR } from "./constants";

export function FinanceReport() {
  const { t } = useTranslation();
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
        ? transactions.filter((tr) => tr.date.startsWith(selectedMonth))
        : [],
    [transactions, selectedMonth],
  );

  const monthlyData = useMemo(
    () => [
      { name: t('finance.income'), amount: sumMoney(monthTransactions.filter((tr) => tr.type === "income").map((tr) => tr.amount)) },
      { name: t('finance.expense'), amount: sumMoney(monthTransactions.filter((tr) => tr.type === "expense").map((tr) => tr.amount)) },
    ],
    [monthTransactions, t],
  );

  const categoryData = useMemo(
    () =>
      categories
        .filter((c) => c.type === "expense")
        .map((cat) => ({
          name: cat.name,
          value: sumMoney(
            monthTransactions.filter((tr) => tr.type === "expense" && tr.category_id === cat.id).map((tr) => tr.amount),
          ),
        }))
        .filter((d) => d.value > 0),
    [categories, monthTransactions],
  );

  const trendData = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return [];
    const dayCount = getDaysInMonth(new Date(year, month - 1, 1));
    return Array.from({ length: dayCount }, (_, i) => {
      const day = i + 1;
      const dateStr = `${selectedMonth}-${String(day).padStart(2, "0")}`;
      const dayTransactions = monthTransactions.filter((tr) => tr.date === dateStr);
      return {
        date: `${month}/${day}`,
        income: sumMoney(dayTransactions.filter((tr) => tr.type === "income").map((tr) => tr.amount)),
        expense: sumMoney(dayTransactions.filter((tr) => tr.type === "expense").map((tr) => tr.amount)),
      };
    });
  }, [monthTransactions, selectedMonth]);

  const exportCsv = () => {
    const typeLabel: Record<string, string> = { income: t('finance.income'), expense: t('finance.expense'), transfer: t('finance.transfer') };
    const header = [t('finance.date'), t('finance.type'), t('finance.category'), t('finance.account'), t('finance.amount'), t('finance.note')];
    const rows = monthTransactions.map((tr) => {
      const cat = categories.find((c) => c.id === tr.category_id);
      const acc = accounts.find((a) => a.id === tr.account_id);
      return [tr.date, typeLabel[tr.type] ?? tr.type, cat?.name ?? "", acc?.name ?? "", String(tr.amount), tr.note ?? ""];
    });
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const neutral = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);
    const csv = [header, ...rows].map((r) => r.map((c) => esc(neutral(c))).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t('finance.title')}-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* 顶部控制 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-sm">
        <label className="text-sm font-medium text-muted-foreground">{t('finance.month')}</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="h-9 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {!selectedMonth && (
          <span className="text-xs text-muted-foreground">{t('finance.selectMonth')}</span>
        )}
        <Button variant="outline" size="sm" onClick={exportCsv} className="ml-auto gap-1">
          <Download size={14} /> {t('finance.exportCSV')}
        </Button>
        {isError && (
          <button type="button" onClick={() => refetch()} className="text-xs text-destructive underline">
            {t('finance.loadFailed')}
          </button>
        )}
      </div>

      {/* 收支对比 */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 font-medium">
          <BarChart3 size={16} className="text-brand-500" /> {t('finance.monthlyComparison')}
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
          <PieIcon size={16} className="text-brand-500" /> {t('finance.expenseByCategory')}
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
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('finance.noExpenseData')}</div>
          )}
        </div>
      </div>

      {/* 趋势 */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 font-medium">
          <TrendingUp size={16} className="text-brand-500" /> {t('finance.incomeExpenseTrend', { month: selectedMonth })}
        </div>
        <div className="h-40 sm:h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="income" stroke={INCOME_COLOR} strokeWidth={2} dot={{ r: 3 }} name={t('finance.income')} />
              <Line type="monotone" dataKey="expense" stroke={EXPENSE_COLOR} strokeWidth={2} dot={{ r: 3 }} name={t('finance.expense')} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
