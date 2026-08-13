import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { toLocalInputValue, fromDateKey } from "./calendarUtils";
import type { CalendarEvent } from "@/types";

const PRESET_COLORS = [
  "#6366f1", // 品牌靛
  "#ef4444", // 红
  "#f59e0b", // 橙
  "#10b981", // 绿
  "#3b82f6", // 蓝
  "#a855f7", // 紫
  "#ec4899", // 粉
];

interface EventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 编辑已有事件；为空表示新建 */
  event?: CalendarEvent | null;
  /** 新建时预填的日期（YYYY-MM-DD） */
  defaultDate?: string;
  onCreate: (data: Partial<CalendarEvent>) => void;
  onUpdate: (id: string, data: Partial<CalendarEvent>) => void;
  onDelete?: (id: string) => void;
}

function combine(dateKey: string, time: string): string {
  // dateKey: YYYY-MM-DD, time: HH:mm → 本地时间 ISO
  const d = fromDateKey(dateKey);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

export function EventFormDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
  onCreate,
  onUpdate,
  onDelete,
}: EventFormDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!event;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [reminder, setReminder] = useState("0");

  useEffect(() => {
    if (!open) return;
    if (event) {
      const start = new Date(event.start_at);
      const end = new Date(event.end_at);
      setTitle(event.title);
      setDescription(event.description ?? "");
      setLocation(event.location ?? "");
      setDate(toLocalInputValue(start).slice(0, 10));
      setEndDate(toLocalInputValue(end).slice(0, 10));
      setStartTime(`${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`);
      setEndTime(`${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`);
      setAllDay(event.all_day);
      setColor(event.color ?? PRESET_COLORS[0]);
      setReminder(event.reminder_minutes != null ? String(event.reminder_minutes) : "0");
    } else {
      const base = defaultDate ? fromDateKey(defaultDate) : new Date();
      setTitle("");
      setDescription("");
      setLocation("");
      setDate(toLocalInputValue(base).slice(0, 10));
      setEndDate(toLocalInputValue(base).slice(0, 10));
      setStartTime("09:00");
      setEndTime("10:00");
      setAllDay(false);
      setColor(PRESET_COLORS[0]);
      setReminder("0");
    }
  }, [open, event, defaultDate]);

  const handleSave = () => {
    if (!title.trim()) return;

    let startIso: string;
    let endIso: string;
    if (allDay) {
      // 全天：start=当日 0 点，end=当日 23:59:59（含当天）
      const start = fromDateKey(date);
      startIso = start.toISOString();
      const endOfDay = new Date(start);
      endOfDay.setHours(23, 59, 59, 0);
      endIso = endOfDay.toISOString();
    } else {
      startIso = combine(date, startTime);
      endIso = combine(endDate || date, endTime);
      if (new Date(endIso) <= new Date(startIso)) {
        // 结束早于开始：默认顺延 1 小时
        endIso = new Date(new Date(startIso).getTime() + 3600000).toISOString();
      }
    }

    const payload = {
      title: title.trim(),
      description: description || null,
      location: location || null,
      start_at: startIso,
      end_at: endIso,
      all_day: allDay,
      color,
      reminder_minutes: reminder === "" ? null : Number(reminder),
    };

    if (isEdit && event) {
      onUpdate(event.id, payload);
    } else {
      onCreate(payload);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogClose onClose={() => onOpenChange(false)} />
        <DialogHeader>
          <DialogTitle>{isEdit ? t("calendar.editEvent") : t("calendar.newEvent")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">{t("calendar.title")}</Label>
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("calendar.titlePlaceholder")}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-date">{t("calendar.date")}</Label>
              <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-1.5 text-sm">
                <Checkbox checked={allDay} onCheckedChange={(c) => setAllDay(!!c)} />
                {t("calendar.allDay")}
              </label>
            </div>
          </div>

          {!allDay && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-start">{t("calendar.start")}</Label>
                  <Input id="ev-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-end">{t("calendar.end")}</Label>
                  <Input id="ev-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-end-date">{t("calendar.endDate")}</Label>
                <Input
                  id="ev-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ev-loc">{t("calendar.locationOptional")}</Label>
            <Input id="ev-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("calendar.locationPlaceholder")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">{t("calendar.descriptionOptional")}</Label>
            <Textarea
              id="ev-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("calendar.descriptionPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("calendar.color")}</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`${t("calendar.color")} ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition",
                    color === c ? "ring-2 ring-foreground" : "ring-1 ring-border",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* TODO: 提醒功能待实现 — 需在 notifications.ts 中接入日历事件提醒 */}
          <div className="space-y-1.5">
            <Label htmlFor="ev-rem">{t("calendar.reminder")}</Label>
            <select
              id="ev-rem"
              value={reminder}
              onChange={(e) => setReminder(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="0">{t("calendar.reminderOnTime")}</option>
              <option value="5">{t("calendar.reminder5min")}</option>
              <option value="10">{t("calendar.reminder10min")}</option>
              <option value="30">{t("calendar.reminder30min")}</option>
              <option value="60">{t("calendar.reminder1hour")}</option>
              <option value="">{t("calendar.reminderNone")}</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          {isEdit && onDelete && event ? (
            <Button variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => { onDelete(event.id); onOpenChange(false); }}>
              {t("common.delete")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!title.trim()}>{t("common.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
