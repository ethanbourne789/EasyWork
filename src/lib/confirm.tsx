import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import i18n from "@/lib/i18n";

export interface ConfirmOptions {
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作：确认按钮使用 destructive 样式（红） */
  destructive?: boolean;
  /** 确认/取消按钮处于加载态（禁用点击） */
  loading?: boolean;
}

function ConfirmDialogImpl({
  title,
  description,
  confirmText = i18n.t("common.confirm"),
  cancelText = i18n.t("common.cancel"),
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  const [open, setOpen] = React.useState(true);

  const finish = (result: boolean) => {
    setOpen(false);
    if (result) onConfirm();
    else onCancel();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) finish(false);
      }}
      ariaLabel={title ?? i18n.t("common.confirmAction")}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? i18n.t("common.pleaseConfirm")}</DialogTitle>
        </DialogHeader>
        {description && (
          <div className="text-sm text-muted-foreground">{description}</div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => finish(false)}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={() => finish(true)}
            disabled={loading}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 命令式确认弹窗：替换散落的 `window.confirm`，返回 Promise<boolean>。
 * 内部自挂载独立 React 根，无需在应用根部注入 Provider，可在任意组件的事件处理器中调用。
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    container.setAttribute("data-confirm-root", "");
    document.body.appendChild(container);
    const root = createRoot(container);

    const cleanup = () => {
      root.unmount();
      if (container.parentNode) container.parentNode.removeChild(container);
    };

    root.render(
      <ConfirmDialogImpl
        {...options}
        onConfirm={() => {
          resolve(true);
          cleanup();
        }}
        onCancel={() => {
          resolve(false);
          cleanup();
        }}
      />
    );
  });
}
