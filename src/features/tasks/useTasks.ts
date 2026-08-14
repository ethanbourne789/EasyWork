import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeMutation } from "@/lib/mutation";
import { computeNextOccurrence } from "@/lib/recurrence";
import { taskApi } from "./taskApi";
import type { Task, RecurrenceRule } from "@/types";

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
    queryFn: () => taskApi.listTasks(),
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.task(id ?? ""),
    queryFn: () => taskApi.getTask(id!),
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
      const { tag_ids, recurrence_rule, ...taskData } = data;
      const recurrence_next = recurrence_rule
        ? computeNextOccurrence(recurrence_rule, data.due_date ?? new Date().toISOString())
        : null;
      return taskApi.createTask({
        ...taskData,
        status: data.status ?? "todo",
        priority: data.priority ?? "medium",
        tag_ids,
        recurrence_rule: recurrence_rule ?? undefined,
        recurrence_next: recurrence_next ?? undefined,
      });
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

      // 显式置 NULL 的字段（Tauri IPC 无法区分「未传」与「显式 null」）
      const null_fields: string[] = [];
      if (due_date === null) null_fields.push("due_date");
      if (updates.recurrence_rule === null) null_fields.push("recurrence_rule");

      // 读更新前状态，用于判断「是否刚从非完成变为完成」（本地单写者，无并发竞态）
      const current = await taskApi.getTask(id);

      // 主更新
      const task = await taskApi.updateTask(
        {
          id,
          title: updates.title,
          description: updates.description,
          status: updates.status,
          priority: updates.priority,
          due_date: due_date ?? undefined,
          tag_ids,
          recurrence_rule: updates.recurrence_rule ?? undefined,
        },
        null_fields.length ? null_fields : undefined,
      );

      // 周期任务：刚被标记为完成时，生成下一期实例；超过结束日期则清除规则
      const ruleAfter = (updates.recurrence_rule !== undefined
        ? updates.recurrence_rule
        : (task.recurrence_rule ?? null)) as RecurrenceRule | null;
      const justCompleted =
        task.status === "done" && current?.status !== "done";

      let generatedTaskId: string | null = null;

      if (justCompleted && ruleAfter) {
        const nextDue = computeNextOccurrence(
          ruleAfter,
          task.due_date ?? new Date().toISOString()
        );
        if (nextDue) {
          const newTask = await taskApi.createTask({
            title: task.title,
            description: task.description,
            status: "todo",
            priority: task.priority,
            due_date: nextDue,
            recurrence_rule: ruleAfter,
          });
          generatedTaskId = newTask.id;

          // 子任务复制到下一期实例（原任务）
          const subs = await taskApi.listSubtasks(id);
          for (const s of subs) {
            await taskApi.createSubtask({ task_id: newTask.id, title: s.title });
          }
        } else {
          // 周期结束：清除规则
          await taskApi.updateTask({ id, recurrence_rule: null }, ["recurrence_rule"]);
        }
      }

      // 原任务标签变更
      if (tag_ids !== undefined) {
        await taskApi.setTaskTags({ task_id: id, tag_ids });
      }

      // 复制标签到下一期实例：使用「本次变更后的标签」，而非变更前的旧标签（H4）
      if (generatedTaskId) {
        const tagsToCopy =
          tag_ids !== undefined
            ? tag_ids
            : (await taskApi.getTaskTags(id)).map((t) => t.id);
        if (tagsToCopy.length) {
          await taskApi.setTaskTags({ task_id: generatedTaskId, tag_ids: tagsToCopy });
        }
      }
      return task as Task;
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
      await taskApi.deleteTask(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
  });
}

export function useSubtasks(taskId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.subtasks(taskId ?? ""),
    queryFn: () => taskApi.listSubtasks(taskId!),
    enabled: !!taskId,
  });
}

export function useCreateSubtask() {
  const queryClient = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: { task_id: string; title: string }) => {
      return taskApi.createSubtask({ task_id: data.task_id, title: data.title });
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
      const { id, task_id, ...updates } = data;
      return taskApi.updateSubtask({ id, task_id, ...updates });
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
      await taskApi.deleteSubtask(data);
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
    queryFn: () => taskApi.listTags(),
  });
}

export function useTaskTags(taskId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.taskTags(taskId ?? ""),
    queryFn: () => taskApi.getTaskTags(taskId!),
    enabled: !!taskId,
  });
}
