import { useState } from "react";
import { Search } from "lucide-react";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索任务、笔记、记账…"
        className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
      />
    </div>
  );
}