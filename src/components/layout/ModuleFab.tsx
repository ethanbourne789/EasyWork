import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export interface FabAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

interface ModuleFabProps {
  actions: FabAction[];
  mainIcon?: LucideIcon;
  /** 无障碍标签 */
  label?: string;
}

/**
 * 模块级悬浮操作按钮（speed-dial）。
 * 固定在内容区右下角，主按钮展开后列出本模块的新建类操作。
 * 移动端自动上移，避开底部 Tab 栏。
 */
export function ModuleFab({ actions, mainIcon: MainIcon = Plus, label }: ModuleFabProps) {
  const { t } = useTranslation();
  const defaultLabel = label ?? t("layout.new");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (isDesktop) return null;

  return (
    <div ref={ref} className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6">
      <div
        className={cn(
          "mb-3 flex flex-col items-end gap-2 transition-all duration-200 origin-bottom-right",
          open ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-90"
        )}
        aria-hidden={!open}
      >
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                a.onClick();
                setOpen(false);
              }}
              tabIndex={open ? 0 : -1}
              className="flex items-center gap-2 rounded-xl border bg-popover px-3 py-2 text-sm font-medium text-foreground shadow-md ring-1 ring-border transition-colors hover:bg-accent"
            >
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-brand-50 text-brand-700">
                <Icon size={16} />
              </span>
              {a.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-label={defaultLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5",
          open && "rotate-45"
        )}
      >
        <MainIcon size={26} />
      </button>
    </div>
  );
}
