import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

interface DialogTitleCtx {
  id: string;
  register: () => void;
}

const DialogTitleIdContext = React.createContext<DialogTitleCtx | null>(null);

function Dialog({ open, onOpenChange, children, ariaLabel, ariaLabelledBy }: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const [hasTitle, setHasTitle] = React.useState(false);
  useFocusTrap(panelRef, open);

  React.useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onOpenChange]);

  // 打开时锁定背景滚动，关闭后恢复
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 打开时把焦点移入弹窗，避免焦点滞留在背景
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

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
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
        className="relative z-50 w-full max-w-lg mx-4 outline-none"
      >
        <DialogTitleIdContext.Provider value={{ id: titleId, register: () => setHasTitle(true) }}>
          {children}
        </DialogTitleIdContext.Provider>
      </div>
    </div>,
    document.body
  );
}

function DialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  );
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4", className)} {...props} />;
}

function DialogTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const ctx = React.useContext(DialogTitleIdContext);
  React.useEffect(() => {
    ctx?.register();
  }, [ctx]);
  return (
    <h2 id={ctx?.id} className={cn("text-lg font-semibold", className)} {...props}>
      {children}
    </h2>
  );
}

function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
    >
      <X size={16} />
    </button>
  );
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex justify-end gap-2 mt-4", className)} {...props} />;
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter };
