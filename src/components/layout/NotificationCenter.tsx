import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, Mail, Bell, CheckCheck } from "lucide-react";
import { Drawer, DrawerHeader, DrawerTitle, DrawerClose, DrawerBody } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { NotificationItem, NotificationType } from "@/lib/notifications";

interface NotificationCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NotificationItem[];
  onDismiss: (id: string) => void;
  onMarkAllRead: () => void;
}

const TYPE_META: Record<
  NotificationType,
  { icon: typeof Bell; tint: string; iconColor: string }
> = {
  budget: { icon: AlertTriangle, tint: "bg-warning/10", iconColor: "text-warning" },
  task: { icon: Clock, tint: "bg-brand-50", iconColor: "text-brand-700" },
  mail: { icon: Mail, tint: "bg-success/10", iconColor: "text-success" },
};

export function NotificationCenter({
  open,
  onOpenChange,
  items,
  onDismiss,
  onMarkAllRead,
}: NotificationCenterProps) {
  const { t } = useTranslation();
  return (
    <Drawer open={open} onOpenChange={onOpenChange} width="w-full max-w-sm">
      <DrawerHeader>
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-brand-700" />
          <DrawerTitle>{t("layout.notificationCenter")}</DrawerTitle>
          {items.length > 0 && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
              {items.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <CheckCheck size={14} />
              {t("layout.markAllRead")}
            </button>
          )}
          <DrawerClose onClose={() => onOpenChange(false)} />
        </div>
      </DrawerHeader>

      <DrawerBody className="p-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Bell size={32} className="opacity-30" />
            <span>{t("layout.noNotifications")}</span>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const meta = TYPE_META[item.type];
              const Icon = meta.icon;
              const content = (
                <>
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      meta.tint
                    )}
                  >
                    <Icon size={17} className={meta.iconColor} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
                      {item.body}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDismiss(item.id);
                    }}
                    className="shrink-0 self-start rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    aria-label={t("layout.markAsRead")}
                  >
                    {t("layout.read")}
                  </button>
                </>
              );
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      to={item.href}
                      onClick={() => {
                        onDismiss(item.id);
                        onOpenChange(false);
                      }}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 px-4 py-3">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DrawerBody>
    </Drawer>
  );
}
