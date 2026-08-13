import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Trash2, Plus, CheckCircle2, AlertCircle, Link2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/dateUtils";
import type { CalendarSubscription, CalendarProvider } from "@/types";

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptions: CalendarSubscription[];
  /** 编辑模式：传入则预填表单 */
  subscription?: CalendarSubscription | null;
  onCreate: (data: Partial<CalendarSubscription>) => void;
  onUpdate?: (id: string, data: Partial<CalendarSubscription>) => void;
  onDelete: (id: string) => void;
  onSync: (id?: string) => void;
  syncing: boolean;
  creating: boolean;
  updating?: boolean;
}

const PROVIDER_OPTIONS: { value: CalendarProvider; label: string; hint: string }[] = [
  { value: "ics", label: "ICS 订阅链接", hint: "钉钉「分享日历」生成的 .ics 链接，或任意 CalDAV/Google/Outlook 的 ICS 分享地址" },
  { value: "dingtalk_caldav", label: "钉钉 CalDAV", hint: "钉钉日历设置 → 同步 → 生成专用密码，服务器 calendar.dingtalk.com" },
  { value: "caldav", label: "其他 CalDAV", hint: "如飞书、企业微信等 CalDAV 服务地址" },
];

const PRESET_COLORS = ["#6366f1", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#a855f7"];

export function SubscriptionDialog({
  open,
  onOpenChange,
  subscriptions,
  subscription,
  onCreate,
  onUpdate,
  onDelete,
  onSync,
  syncing,
  creating,
  updating,
}: SubscriptionDialogProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingSub, setEditingSub] = useState<CalendarSubscription | null>(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<CalendarProvider>("ics");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const fillForm = (sub: CalendarSubscription) => {
    setName(sub.name);
    setProvider(sub.provider);
    setUrl(sub.url);
    setUsername(sub.username ?? "");
    setPassword(sub.password ?? "");
    setColor(sub.color);
  };

  const resetForm = () => {
    setName("");
    setProvider("ics");
    setUrl("");
    setUsername("");
    setPassword("");
    setColor(PRESET_COLORS[0]);
    setShowForm(false);
    setEditingSub(null);
  };

  // 外部传入 subscription 时进入编辑模式
  useEffect(() => {
    if (open && subscription) {
      setEditingSub(subscription);
      fillForm(subscription);
      setShowForm(true);
    }
  }, [open, subscription]);

  const openEdit = (sub: CalendarSubscription) => {
    setEditingSub(sub);
    fillForm(sub);
    setShowForm(true);
  };

  const openCreate = () => {
    setEditingSub(null);
    setName("");
    setProvider("ics");
    setUrl("");
    setUsername("");
    setPassword("");
    setColor(PRESET_COLORS[0]);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!name.trim() || !url.trim()) return;
    const data: Partial<CalendarSubscription> = {
      name: name.trim(),
      provider,
      url: url.trim(),
      username: username.trim() || null,
      password: password || null,
      color,
    };
    if (editingSub && onUpdate) {
      onUpdate(editingSub.id, data);
    } else {
      onCreate(data);
    }
    resetForm();
  };

  const needsAuth = provider === "dingtalk_caldav" || provider === "caldav";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogClose onClose={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>日历订阅</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* 订阅源列表 */}
          {subscriptions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              还没有订阅，点击下方「添加订阅」接入钉钉日历或其他 ICS 日历
            </div>
          ) : (
            <ul className="space-y-2">
              {subscriptions.map((sub) => (
                <li key={sub.id} className="flex items-center gap-2 rounded-lg border bg-card p-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: sub.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{sub.name}</span>
                      {!sub.enabled && (
                        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">已禁用</span>
                      )}
                      {sub.last_error ? (
                        <AlertCircle size={14} className="shrink-0 text-destructive" />
                      ) : sub.last_synced_at ? (
                        <CheckCircle2 size={14} className="shrink-0 text-success" />
                      ) : null}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {sub.provider === "dingtalk_caldav"
                        ? "钉钉 CalDAV"
                        : sub.provider === "caldav"
                          ? "CalDAV"
                          : "ICS 订阅"}
                      {sub.last_synced_at
                        ? ` · ${formatDateTime(new Date(sub.last_synced_at))}`
                        : " · 未同步"}
                      {sub.event_count ? ` · ${sub.event_count} 条` : ""}
                    </div>
                    {sub.last_error && (
                      <div className="mt-0.5 truncate text-[11px] text-destructive" title={sub.last_error}>
                        {sub.last_error}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2 text-[11px]"
                    onClick={() => onUpdate?.(sub.id, { enabled: !sub.enabled })}
                    disabled={updating}
                    aria-label={sub.enabled ? "禁用订阅" : "启用订阅"}
                  >
                    {sub.enabled ? "禁用" : "启用"}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(sub)} aria-label="编辑订阅">
                    <Pencil size={14} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onSync(sub.id)} disabled={syncing} aria-label="同步">
                    <RefreshCw size={15} className={cn(syncing && "animate-spin")} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(sub.id)}
                    aria-label="删除订阅"
                  >
                    <Trash2 size={15} />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {/* 添加表单 */}
          {showForm ? (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label>订阅类型</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {PROVIDER_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setProvider(o.value)}
                      className={cn(
                        "rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                        provider === o.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {PROVIDER_OPTIONS.find((o) => o.value === provider)?.hint}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sub-name">名称</Label>
                <Input
                  id="sub-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：钉钉工作日历"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sub-url">
                  {provider === "ics" ? "ICS 订阅链接" : "服务器地址"}
                </Label>
                <Input
                  id="sub-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={provider === "ics" ? "https://.../calendar.ics 或 webcal://..." : "https://calendar.dingtalk.com"}
                />
              </div>

              {needsAuth && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sub-user">用户名</Label>
                    <Input id="sub-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="钉钉账号" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sub-pass">专用密码</Label>
                    <Input
                      id="sub-pass"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="CalDAV 专用密码"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>颜色</Label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn(
                        "h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition",
                        color === c ? "ring-2 ring-foreground" : "ring-1 ring-border",
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`颜色 ${c}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={resetForm}>
                  取消
                </Button>
                <Button onClick={handleSave} disabled={!name.trim() || !url.trim() || creating || updating}>
                  {editingSub ? (updating ? "保存中…" : "保存修改") : creating ? "添加中…" : "添加"}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={openCreate}>
              <Plus size={16} /> 添加订阅
            </Button>
          )}

          {subscriptions.length > 0 && (
            <Button variant="outline" className="w-full" onClick={() => onSync()} disabled={syncing}>
              <RefreshCw size={16} className={cn(syncing && "animate-spin")} /> 同步全部
            </Button>
          )}

          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Link2 size={13} className="mt-0.5 shrink-0" />
            订阅为只读——钉钉/外部日历的增改请在其原平台进行，同步后此处只做展示。同步在服务器完成以规避跨域限制。
          </p>
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
