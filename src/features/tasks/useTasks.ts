import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/features/auth/authStore";
import { useSafeMutation } from "@/lib/mutation";
import { computeNextOccurrence } from "@/lib/recurrence";
import type { Task, Subtask, Tag, RecurrenceRule } from "@/types";
import type { Database } from "@/types/database.types";

const QUERY_KEYS = {
  tasks: ["tasks"] as const,
  task: (id: string) => ["tasks", id] as const,
  subtasks: (taskId: string) => ["subtasks", taskId] as const,
  tags: ["tags"] as const,
  taskTags: (taskId: string) => ["taskTags", taskId] as const,
};

export function useTasks() {
  return useQuery({
    queryKey: QUERY_KEYS.tasks,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Task[];
    },
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.task(id ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Task | null;
    },
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      status?: Task["status"];
      priority?: Task["priority"];
      due_date?: string;
      tag_ids?: string[];
      recurrence_rule?: RecurrenceRule | null;
    }) => {
      const userId = getCurrentUserId();
      const { tag_ids, recurrence_rule, ...taskData } = data;
      const recurrence_next = recurrence_rule
        ? computeNextOccurrence(recurrence_rule, data.due_date ?? new Date().toISOString())
        : null;
      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          ...taskData,
          user_id: userId,
          status: data.status ?? "todo",
          priority: data.priority ?? "medium",
          sort_order: Date.now(),
          recurrence_rule: recurrence_rule ?? null,
          recurrence_next,
        } as unknown as Database["public"]["Tables"]["tasks"]["Insert"])
        .select()
        .single();
      if (error) throw error;
      if (tag_ids?.length) {
        const rows = tag_ids.map((tag_id) => ({ task_id: task.id, tag_id }));
        const { error: tagError } = await supabase.from("task_tags").insert(rows);
        if (tagError) throw tagError;
      }
      return task as unknown as Task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: {
      id: string;
      title?: string;
      description?: string;
      status?: Task["status"];
      priority?: Task["priority"];
      due_date?: string | null;
      tag_ids?: string[];
      recurrence_rule?: RecurrenceRule | null;
    }) => {
      const { id, tag_ids, due_date, ...updates } = data;
      const taskUpdates: Record<string, unknown> = { ...updates };
      if (due_date !== undefined) {
        taskUpdates.due_date = due_date ?? null;
      }

      // 取更新前状态，用于判断"是否刚从非完成变为完成"（避免反复生成）
      const { data: current, error: curErr } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id)
        .eq("user_id", getCurrentUserId())
        .maybeSingle();
      if (curErr) throw curErr;

      // 周期规则 / 截止日期变化时，重算 recurrence_next
      if (updates.recurrence_rule !== undefined || due_date !== undefined) {
        const ruleSource =
          updates.recurrence_rule !== undefined
            ? (updates.recurrence_rule as RecurrenceRule | null | undefined)
            : (current?.recurrence_rule as RecurrenceRule | null | undefined);
        const dueSource =
          due_date !== undefined ? (due_date ?? undefined) : current?.due_date;
        taskUpdates.recurrence_next = ruleSource
          ? computeNextOccurrence(ruleSource, dueSource ?? new Date().toISOString())
          : null;
      }

      const { data: task, error } = await supabase
        .from("tasks")
        .update(taskUpdates as unknown as Database["public"]["Tables"]["tasks"]["Update"])
        .eq("id", id)
        .eq("user_id", getCurrentUserId())
        .select()
        .single();
      if (error) throw error;

      // 周期任务：刚被标记为完成时，生成下一期实例；超过结束日期则清除规则
      const ruleAfter = ((updates.recurrence_rule !== undefined
        ? updates.recurrence_rule
        : (task.recurrence_rule as RecurrenceRule | null | undefined)) ?? null) as RecurrenceRule | null;
      const justCompleted =
        task.status === "done" && current?.status !== "done";
      if (justCompleted && ruleAfter) {
        const nextDue = computeNextOccurrence(
          ruleAfter,
          task.due_date ?? new Date().toISOString()
        );
        if (nextDue) {
          const { data: newTask, error: insErr } = await supabase
            .from("tasks")
            .insert({
              user_id: task.user_id,
              title: task.title,
              description: task.description,
              status: "todo",
              priority: task.priority,
              due_date: nextDue,
              recurrence_rule: ruleAfter,
              recurrence_next: nextDue,
              sort_order: Date.now(),
            } as unknown as Database["public"]["Tables"]["tasks"]["Insert"])
            .select()
            .single();
          if (insErr) throw insErr;

          // 把标签与子任务一并复制到下一期实例，保持周期任务完整性
          const { data: origTags } = await supabase
            .from("task_tags")
            .select("tag_id")
            .eq("task_id", id);
          if (origTags?.length) {
            const { error: tagInsErr } = await supabase
              .from("task_tags")
              .insert(origTags.map((r) => ({ task_id: newTask.id, tag_id: r.tag_id })));
            if (tagInsErr) throw tagInsErr;
          }
          const { data: origSubtasks } = await supabase
            .from("subtasks")
            .select("user_id, title, sort_order")
            .eq("task_id", id);
          if (origSubtasks?.length) {
            const { error: subInsErr } = await supabase
              .from("subtasks")
              .insert(
                origSubtasks.map((s) => ({
                  task_id: newTask.id,
                  user_id: s.user_id,
                  title: s.title,
                  done: false,
                  sort_order: s.sort_order,
                })),
              );
            if (subInsErr) throw subInsErr;
          }
        } else {
          const { error: clrErr } = await supabase
            .from("tasks")
            .update({
              recurrence_rule: null,
              recurrence_next: null,
            } as unknown as Database["public"]["Tables"]["tasks"]["Update"])
            .eq("id", id)
            .eq("user_id", getCurrentUserId());
          if (clrErr) throw clrErr;
        }
      }

      if (tag_ids !== undefined) {
        const { data: existing, error: selErr } = await supabase
          .from("task_tags")
          .select("tag_id")
          .eq("task_id", id);
        if (selErr) throw selErr;
        const existingTagIds = (existing ?? [])
          .map((r) => r.tag_id)
          .sort();
        const nextTagIds = [...tag_ids].sort();
        const unchanged =
          existingTagIds.length === nextTagIds.length &&
          existingTagIds.every((v, i) => v === nextTagIds[i]);
        if (!unchanged) {
          const { error: delErr } = await supabase
            .from("task_tags")
            .delete()
            .eq("task_id", id);
          if (delErr) throw delErr;
          if (tag_ids.length) {
            const { error: insErr } = await supabase
              .from("task_tags")
              .insert(tag_ids.map((tag_id) => ({ task_id: id, tag_id })));
            if (insErr) throw insErr;
          }
        }
      }
      return task as unknown as Task;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.task(variables.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.taskTags(variables.id) });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (id: string) => {
      // 外键 on delete cascade 会自动清理 subtasks / task_tags
      const { error } = await supabase.from("tasks").delete().eq("id", id).eq("user_id", getCurrentUserId());
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
  });
}

export function useSubtasks(taskId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.subtasks(taskId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtasks")
        .select("*")
        .eq("task_id", taskId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Subtask[];
    },
    enabled: !!taskId,
  });
}

export function useCreateSubtask() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: { task_id: string; title: string }) => {
      const { data: subtask, error } = await supabase
        .from("subtasks")
        .insert({
          task_id: data.task_id,
          user_id: getCurrentUserId(),
          title: data.title,
          done: false,
          sort_order: Date.now(),
        })
        .select()
        .single();
      if (error) throw error;
      return subtask as Subtask;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.subtasks(variables.task_id),
      });
    },
  });
}

export function useUpdateSubtask() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: {
      id: string;
      task_id: string;
      done?: boolean;
      title?: string;
    }) => {
      const { id, task_id: _, ...updates } = data;
      const { data: subtask, error } = await supabase
        .from("subtasks")
        .update(updates)
        .eq("id", id)
        .eq("user_id", getCurrentUserId())
        .select()
        .single();
      if (error) throw error;
      return subtask as Subtask;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.subtasks(variables.task_id),
      });
    },
  });
}

export function useDeleteSubtask() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: { id: string; task_id: string }) => {
      const { error } = await supabase
        .from("subtasks")
        .delete()
        .eq("id", data.id)
        .eq("user_id", getCurrentUserId());
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.subtasks(variables.task_id),
      });
    },
  });
}

export function useTags() {
  return useQuery({
    queryKey: QUERY_KEYS.tags,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Tag[];
    },
  });
}

export function useTaskTags(taskId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.taskTags(taskId ?? ""),
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("task_tags")
        .select("tag_id")
        .eq("task_id", taskId!);
      if (error) throw error;
      const ids = (links ?? []).map((l) => l.tag_id);
      if (!ids.length) return [] as Tag[];
      const { data: tags, error: tagErr } = await supabase
        .from("tags")
        .select("*")
        .in("id", ids);
      if (tagErr) throw tagErr;
      return (tags ?? []) as Tag[];
    },
    enabled: !!taskId,
  });
}
