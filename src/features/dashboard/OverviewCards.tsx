import { ListChecks, Mail, Wallet, NotebookText } from "lucide-react";

const cards = [
  { label: "待办任务", value: "—", icon: ListChecks },
  { label: "未读邮件", value: "—", icon: Mail },
  { label: "本周支出", value: "¥—", icon: Wallet },
  { label: "最近笔记", value: "—", icon: NotebookText },
];

export function OverviewCards() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            <Icon size={16} className="text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}