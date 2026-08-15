import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, X, ListChecks, FileText, Wallet } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTasks } from "@/features/tasks/useTasks";
import { useNotes } from "@/features/notes/useNotes";
import { useTransactions } from "@/features/finance/useFinance";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

type ResultType = "task" | "note" | "transaction";

const ROUTE_BY_TYPE = {
  task: "/tasks",
  note: "/notes",
  transaction: "/finance",
} as const satisfies Record<ResultType, string>;

interface SearchResult {
  type: ResultType;
  id: string;
  title: string;
  subtitle: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: tasks = [] } = useTasks();
  const { data: notes = [] } = useNotes();
  const { data: transactions = [] } = useTransactions();

  const handleSelect = (r: SearchResult) => {
    // 深链到具体条目（修复 P2 #8：搜索结果可定位到对应任务/笔记/交易）
    navigate({ to: ROUTE_BY_TYPE[r.type], search: { focus: r.id } });
    setQuery("");
    setIsOpen(false);
  };

  const results: SearchResult[] = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const items: SearchResult[] = [];

    tasks
      .filter(
        (task) =>
          task.title.toLowerCase().includes(q) ||
          task.description?.toLowerCase().includes(q)
      )
      .forEach((task) => {
        items.push({
          type: "task",
          id: task.id,
          title: task.title,
          subtitle: task.description?.slice(0, 60) || t("dashboard.noDescription"),
        });
      });

    notes
      .filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content_text?.toLowerCase().includes(q)
      )
      .forEach((n) => {
        items.push({
          type: "note",
          id: n.id,
          title: n.title || t("dashboard.noTitle"),
          subtitle: (n.content_text || "").slice(0, 60) || t("dashboard.noContent"),
        });
      });

    transactions
      .filter((tx) => tx.note?.toLowerCase().includes(q))
      .forEach((tx) => {
        const sign = tx.type === "income" ? "+" : "-";
        items.push({
          type: "transaction",
          id: tx.id,
          title: tx.note || t("dashboard.uncategorized"),
          subtitle: `${sign}${formatMoney(tx.amount)}`,
        });
      });

    return items.slice(0, 10);
  }, [query, tasks, notes, transactions, t]);

  const typeIcon = (type: ResultType) => {
    switch (type) {
      case "task":
        return <ListChecks className="h-4 w-4 text-primary" />;
      case "note":
        return <FileText className="h-4 w-4 text-success" />;
      case "transaction":
        return <Wallet className="h-4 w-4 text-warning" />;
    }
  };

  const typeLabel = (type: ResultType) => {
    switch (type) {
      case "task":
        return t("dashboard.taskLabel");
      case "note":
        return t("dashboard.noteLabel");
      case "transaction":
        return t("dashboard.financeLabel");
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(e.target.value.trim().length > 0);
          }}
          onFocus={() => query.trim() && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          placeholder={t("dashboard.searchPlaceholder")}
          className="w-full rounded-md border bg-background py-2 pl-9 pr-9 text-sm"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-background shadow-lg max-h-64 overflow-auto">
          {results.map((r) => (
            <div
              key={`${r.type}-${r.id}`}
              role="button"
              tabIndex={0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(r);
                }
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
              )}
            >
              {typeIcon(r.type)}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.subtitle}
                </div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {typeLabel(r.type)}
              </span>
            </div>
          ))}
        </div>
      )}

      {isOpen && query.trim() && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-background shadow-lg p-4 text-center text-sm text-muted-foreground">
          {t("dashboard.noResults")}
        </div>
      )}
    </div>
  );
}
