import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import { useTransactions } from "@/features/finance/useFinance";
import { sumMoney } from "@/lib/money";

export function RecentFinance() {
  const navigate = useNavigate();
  const { data: transactions = [] } = useTransactions();

  // 近 7 天支出趋势数据
  const data = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayTotal = sumMoney(
      transactions
        .filter((t) => {
          const txDate = new Date(t.date);
          const txStr = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, "0")}-${String(txDate.getDate()).padStart(2, "0")}`;
          return t.type === "expense" && txStr === dayStr;
        })
        .map((t) => t.amount),
    );
    return { day: ["日","一","二","三","四","五","六"][d.getDay()], amt: dayTotal };
  });

  const hasData = data.some((d) => d.amt > 0);

  return (
    <div>
      <strong className="text-[15px] font-semibold">近期记账</strong>

      {/* 迷你面积图 — 对齐原型 .chart-wrap > svg */}
      <div className="mt-2.5" style={{ height: 90 }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="recentFinanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(56% 0.17 264)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="oklch(56% 0.17 264)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="amt"
                stroke="oklch(56% 0.17 264)"
                strokeWidth={2.5}
                fill="url(#recentFinanceGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            暂无数据
          </div>
        )}
      </div>

      {/* 图例 — 对齐原型 .legend */}
      <div className="mt-3 flex flex-wrap gap-4">
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground">
          <span className="inline-block h-[9px] w-[9px] rounded-full bg-brand-500" />
          近 7 日支出趋势
        </span>
      </div>

      {/* 记一笔按钮 — 对齐原型 .btn.secondary.sm */}
      <button
        onClick={() => navigate({ to: "/finance", search: { focus: undefined } })}
        className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[11px] border bg-card py-2 text-sm font-semibold transition-colors hover:bg-muted/60"
      >
        <Plus size={15} />
        记一笔
      </button>
    </div>
  );
}
