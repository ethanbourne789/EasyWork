import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  side?: "left" | "right" | "bottom";
  width?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

interface DrawerTitleCtx {
  id: string;
  register: () => void;
}

const DrawerTitleIdContext = React.createContext<DrawerTitleCtx | null>(null);

function Drawer({ open, onOpenChange, children, side = "right", width = "w-full max-w-md", ariaLabel, ariaLabelledBy }: DrawerProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const [hasTitle, setHasTitle] = React.useState(false);
  useFocusTrap(panelRef, open);

  const isBottom = side === "bottom";
  const sideClass = isBottom
    ? "left-0 right-0 bottom-0 rounded-t-2xl max-h-[85vh]"
    : side === "left"
      ? "left-0"
      : "right-0";
  const widthClass = isBottom ? "w-full" : width;

  // 打开时把焦点移入抽屉，避免焦点滞留在背景
  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      (focusable ?? panel).focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onOpenChange]);

  // 打开时锁定背景滚动
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ?? (hasTitle && !ariaLabel ? titleId : undefined)}
        tabIndex={-1}
        className={cn(
          "fixed top-0 bottom-0 bg-background border-border shadow-lg overflow-auto transition-transform outline-none",
          sideClass,
          widthClass
        )}
      >
        <DrawerTitleIdContext.Provider value={{ id: titleId, register: () => setHasTitle(true) }}>
          {children}
        </DrawerTitleIdContext.Provider>
      </div>
    </div>,
    document.body
  );
}

function DrawerHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-between border-b border-border px-4 py-3", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function DrawerTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const ctx = React.useContext(DrawerTitleIdContext);
  React.useEffect(() => {
    ctx?.register();
  }, [ctx]);
  return (
    <h2 id={ctx?.id} className={cn("text-lg font-semibold", className)} {...props}>
      {children}
    </h2>
  );
}

function DrawerClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
    >
      <X size={18} />
    </button>
  );
}

function DrawerBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-4", className)} {...props}>
      {children}
    </div>
  );
}

export { Drawer, DrawerHeader, DrawerTitle, DrawerClose, DrawerBody };
