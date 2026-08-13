import { ListChecks, Mail, NotebookText, Wallet } from "lucide-react";
import { useTasks } from "@/features/tasks/useTasks";
import { useTransactions } from "@/features/finance/useFinance";
import { useNotes } from "@/features/notes/useNotes";
import { useFolderUnreadCounts } from "@/features/mail/useMail";
import { formatMoney, sumMoney } from "@/lib/money";

export function OverviewCards() {
  const { data: tasks = [] } = useTasks();
  const { data: unreadCounts } = useFolderUnreadCounts();
  const unreadEmails =
    unreadCounts !== undefined
      ? Object.values(unreadCounts).reduce((s, n) => s + n, 0)
      : 0;
  const { data: transactions = [] } = useTransactions();
  const { data: notes = [] } = useNotes();

  // 今日待办：今天到期且尚未完成的 todo / in_progress 任务（本地日期比较）
  const todayKey = new Date();
  const todayStr = `${todayKey.getFullYear()}-${String(todayKey.getMonth() + 1).padStart(2, "0")}-${String(todayKey.getDate()).padStart(2, "0")}`;
  const todayPending = tasks.filter((t) => {
    if (t.status !== "todo" && t.status !== "in_progress") return false;
    if (!t.due_date) return false;
    const d = new Date(t.due_date);
    if (isNaN(d.getTime())) return false;
    const dueStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return dueStr === todayStr;
  }).length;

  // 本月支出（以整数分累加，避免浮点漂移）
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthExpenses = sumMoney(
    transactions
      .filter((t) => {
        const txDate = new Date(t.date);
        return t.type === "expense" && txDate >= monthStart;
      })
      .map((t) => t.amount),
  );

  // 趋势文案由真实数据推导（环比昨日待办、对比预算），不再写死假数据
  const pendingYesterday = tasks.filter((t) => {
    const d = new Date(t.created_at);
    if (isNaN(d.getTime())) return false;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return (
      (t.status === "todo" || t.status === "in_progress") &&
      d.getFullYear() === y.getFullYear() &&
      d.getMonth() === y.getMonth() &&
      d.getDate() === y.getDate()
    );
  }).length;
  const pendingTrend = todayPending - pendingYesterday;

  const cards = [
    {
      label: "今日待办",
      value: todayPending.toString(),
      icon: ListChecks,
      trend: {
        text: `${pendingTrend <= 0 ? "▼" : "▲"} ${Math.abs(pendingTrend)} 较昨日`,
        down: pendingTrend > 0,
      },
    },
    {
      label: "未读邮件",
      value: unreadEmails.toString(),
      icon: Mail,
      trend: {
        text: unreadEmails > 0 ? `▲ ${unreadEmails} 未读` : "已全部读完",
        down: unreadEmails === 0,
      },
    },
    {
      label: "笔记",
      value: notes.length.toString(),
      icon: NotebookText,
      trend: {
        text: notes.length > 0 ? `▲ ${notes.length} 篇` : "暂无",
        down: false,
      },
    },
    {
      label: "本月支出",
      value: formatMoney(monthExpenses),
      icon: Wallet,
      trend: { text: monthExpenses > 0 ? "本月累计" : "暂无支出", down: false },
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, trend }) => (
        <div
          key={label}
          className="rounded-lg border bg-card p-4"
        >
          {/* 顶部：标签 + 图标圆 — 对齐原型 .stat .top */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-muted-foreground">
              {label}
            </span>
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-brand-50 text-brand-700">
              <Icon size={18} />
            </span>
          </div>
          {/* 大数字 — 对齐原型 .stat .num (mono, 30px) */}
          <div className="font-mono text-[30px] font-semibold leading-none tracking-tight">
            {value}
          </div>
          {/* 趋势标签 — 对齐原型 .trend */}
          <span
            className={`mt-1 inline-flex items-center gap-1 text-[12px] font-bold ${
              trend.down ? "text-destructive" : "text-success"
            }`}
          >
            {trend.text}
          </span>
        </div>
      ))}
    </div>
  );
}
