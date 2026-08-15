import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCreateTask, useUpdateTask, useTags, useTaskTags } from "./useTasks";
import type { Task, TaskPriority, TaskStatus, RecurrenceRule } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";

const createTaskSchema = (t: (key: string) => string) =>
  z.object({
    title: z.string().min(1, t('tasks.titleRequired')),
    description: z.string().optional(),
    status: z.enum(["todo", "in_progress", "done", "cancelled"]),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    due_date: z.string().optional(),
    tag_ids: z.array(z.string()).optional(),
  });

type TaskFormValues = z.infer<ReturnType<typeof createTaskSchema>>;

interface TaskFormProps {
  task?: Task | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function TaskForm({ task, onSuccess, onCancel }: TaskFormProps) {
  const { t } = useTranslation();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { data: tags = [] } = useTags();
  const { data: taskTags = [], isFetched: taskTagsFetched } = useTaskTags(task?.id ?? null);

  const priorityOptions: { value: TaskPriority; label: string }[] = [
    { value: "low", label: t('tasks.low') },
    { value: "medium", label: t('tasks.medium') },
    { value: "high", label: t('tasks.high') },
    { value: "urgent", label: t('tasks.urgent') },
  ];

  const statusOptions: { value: TaskStatus; label: string }[] = [
    { value: "todo", label: t('tasks.todo') },
    { value: "in_progress", label: t('tasks.inProgress') },
    { value: "done", label: t('tasks.done') },
    { value: "cancelled", label: t('tasks.cancelled') },
  ];

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(createTaskSchema(t)),
    defaultValues: {
      title: "",
      description: "",
      status: "todo",
      priority: "medium",
      due_date: "",
      tag_ids: [],
    },
  });

  const selectedTags = watch("tag_ids") ?? [];

  // 周期规则 UI 状态（不进 zod schema，提交时组装为 recurrence_rule）
  const [recur, setRecur] = useState<{
    enabled: boolean;
    frequency: RecurrenceRule["frequency"];
    interval: number;
    end_date: string;
  }>({ enabled: false, frequency: "weekly", interval: 1, end_date: "" });

  // 初始化守卫：用 ref 记录"已为哪个任务/创建态初始化过"，避免：
  // 1) 打开编辑时标签查询尚未返回就把 tag_ids 置空（P0 标签静默丢失）；
  // 2) 用户在表单中输入过程中被 effect 重置。
  const initRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!task) {
      if (initRef.current !== "__create__") {
        initRef.current = "__create__";
        reset({
          title: "",
          description: "",
          status: "todo",
          priority: "medium",
          due_date: "",
          tag_ids: [],
        });
        setRecur({ enabled: false, frequency: "weekly", interval: 1, end_date: "" });
      }
      return;
    }
    // 等标签查询返回后再重置，确保标签回填正确
    if (!taskTagsFetched) return;
    if (initRef.current === task.id) return;
    initRef.current = task.id;
    const r = task.recurrence_rule;
    reset({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      due_date: task.due_date ? task.due_date.slice(0, 10) : "",
      tag_ids: taskTags.map((t) => t.id),
    });
    setRecur({
      enabled: !!r,
      frequency: r?.frequency ?? "weekly",
      interval: r?.interval ?? 1,
      end_date: r?.end_date ? r.end_date.slice(0, 10) : "",
    });
    // 仅在切换任务（task?.id 变化）且标签查询完成时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, taskTagsFetched]);

  const onSubmit = (values: TaskFormValues) => {
    const recurrence_rule: RecurrenceRule | null = recur.enabled
      ? {
          frequency: recur.frequency,
          interval: Math.max(1, Math.floor(recur.interval || 1)),
          end_date: recur.end_date ? new Date(recur.end_date).toISOString() : undefined,
        }
      : null;
    if (task) {
      updateTask.mutate(
        { id: task.id, ...values, recurrence_rule },
        { onSuccess: () => onSuccess?.() }
      );
    } else {
      createTask.mutate({ ...values, recurrence_rule }, { onSuccess: () => onSuccess?.() });
    }
  };

  const toggleTag = (tagId: string) => {
    const current = selectedTags;
    if (current.includes(tagId)) {
      setValue("tag_ids", current.filter((id) => id !== tagId));
    } else {
      setValue("tag_ids", [...current, tagId]);
    }
  };

  const isPending = createTask.isPending || updateTask.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('tasks.taskName')} *</label>
        <Input
          placeholder={t('tasks.titlePlaceholder')}
          {...register("title")}
        />
        {errors.title && (
          <p className="text-xs text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">{t('tasks.description')}</label>
        <textarea
          className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[80px]"
          placeholder={t('tasks.descriptionPlaceholder')}
          {...register("description")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">{t('tasks.status')}</label>
          <Select {...register("status")}>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">{t('tasks.priority')}</label>
          <Select {...register("priority")}>
            {priorityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">{t('tasks.dueDate')}</label>
        <Input type="date" {...register("due_date")} />
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={recur.enabled}
            onCheckedChange={(c) => setRecur((p) => ({ ...p, enabled: c === true }))}
          />
          <label className="text-sm font-medium">{t('tasks.recurring')}</label>
        </div>
        {recur.enabled && (
          <div className="grid grid-cols-2 gap-2 pl-1 sm:grid-cols-3">
            <Select
              value={recur.frequency}
              onChange={(e) =>
                setRecur((p) => ({ ...p, frequency: e.target.value as RecurrenceRule["frequency"] }))
              }
            >
              <option value="daily">{t('tasks.daily')}</option>
              <option value="weekly">{t('tasks.weekly')}</option>
              <option value="monthly">{t('tasks.monthly')}</option>
            </Select>
            <Input
              type="number"
              min={1}
              value={recur.interval}
              onChange={(e) =>
                setRecur((p) => ({ ...p, interval: Math.max(1, Number(e.target.value) || 1) }))
              }
              aria-label={t('tasks.repeatInterval')}
            />
            <Input
              type="date"
              value={recur.end_date}
              onChange={(e) => setRecur((p) => ({ ...p, end_date: e.target.value }))}
              aria-label={t('tasks.endDate')}
            />
          </div>
        )}
        {recur.enabled && (
          <p className="pl-1 text-xs text-muted-foreground">
            {t('tasks.recurHint', {
              interval: recur.interval > 1 ? recur.interval : undefined,
              frequency: recur.frequency === "daily" ? t('tasks.daily') : recur.frequency === "weekly" ? t('tasks.weekly') : t('tasks.monthly'),
            })}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">{t('tasks.tags')}</label>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const isSelected = selectedTags.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent"
                style={isSelected ? { borderColor: tag.color, backgroundColor: tag.color + "20" } : {}}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
                {isSelected && <X size={12} />}
              </button>
            );
          })}
          {tags.length === 0 && (
            <span className="text-xs text-muted-foreground">{t('tasks.noTags')}</span>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? t('tasks.saving') : task ? t('tasks.saveChanges') : t('tasks.createTask')}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
