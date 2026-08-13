import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlobalSearch } from "@/features/dashboard/GlobalSearch";

/**
 * 全局搜索弹窗：由侧边栏「搜索」按钮派发的 `ew:search` 事件触发打开。
 * 复用已有的 GlobalSearch 组件（任务 / 笔记 / 记账 跨模块检索）。
 */
export function GlobalSearchDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("ew:search", handler);
    return () => window.removeEventListener("ew:search", handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-0 p-3">
        <DialogHeader className="sr-only">
          <DialogTitle>全局搜索</DialogTitle>
        </DialogHeader>
        <GlobalSearch />
      </DialogContent>
    </Dialog>
  );
}
