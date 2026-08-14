import { isTauri } from "@/lib/tauri";
import type { Task, Subtask, Tag, TaskStatus, TaskPriority, RecurrenceRule } from "@/types";

/**
 * 懒加载 Tauri invoke 函数。
 * 使用动态导入避免在浏览器环境下因 @tauri-apps/api/core 模块无法加载而崩溃。
 */
async function getInvoke() {
  if (!isTauri()) {
    throw new Error("Tauri runtime not available");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

export const taskApi = {
  // ---------------------------------------------------------------------------
  // Task CRUD
  // ---------------------------------------------------------------------------
  listTasks: async () => {
    const invoke = await getInvoke();
    return invoke<Task[]>("task_list_all");
  },
  getTask: async (id: string) => {
    const invoke = await getInvoke();
    return invoke<Task>("task_get", { id });
  },
  createTask: async (data: {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    due_date?: string;
    tag_ids?: string[];
    recurrence_rule?: RecurrenceRule;
    recurrence_next?: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Task>("task_create", {
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      due_date: data.due_date,
      tag_ids: data.tag_ids,
      recurrence_rule: data.recurrence_rule,
      recurrence_next: data.recurrence_next,
    });
  },
  updateTask: async (
    data: {
      id: string;
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      due_date?: string | null;
      tag_ids?: string[];
      recurrence_rule?: RecurrenceRule | null;
    },
    null_fields?: string[],
  ) => {
    const invoke = await getInvoke();
    return invoke<Task>("task_update", {
      id: data.id,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      due_date: data.due_date ?? undefined,
      tag_ids: data.tag_ids,
      recurrence_rule: data.recurrence_rule ?? undefined,
      null_fields,
    });
  },
  deleteTask: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("task_delete", { id });
  },

  // ---------------------------------------------------------------------------
  // Subtask CRUD
  // ---------------------------------------------------------------------------
  listSubtasks: async (taskId: string) => {
    const invoke = await getInvoke();
    return invoke<Subtask[]>("subtask_list", { task_id: taskId });
  },
  createSubtask: async (data: { task_id: string; title: string }) => {
    const invoke = await getInvoke();
    return invoke<Subtask>("subtask_create", {
      task_id: data.task_id,
      title: data.title,
    });
  },
  updateSubtask: async (data: {
    id: string;
    task_id: string;
    done?: boolean;
    title?: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Subtask>("subtask_update", {
      id: data.id,
      task_id: data.task_id,
      done: data.done,
      title: data.title,
    });
  },
  deleteSubtask: async (data: { id: string; task_id: string }) => {
    const invoke = await getInvoke();
    return invoke("subtask_delete", { id: data.id, task_id: data.task_id });
  },

  // ---------------------------------------------------------------------------
  // Tag CRUD
  // ---------------------------------------------------------------------------
  listTags: async () => {
    const invoke = await getInvoke();
    return invoke<Tag[]>("tag_list_all");
  },
  createTag: async (data: { name: string; color?: string }) => {
    const invoke = await getInvoke();
    return invoke<Tag>("tag_create", {
      name: data.name,
      color: data.color,
    });
  },
  updateTag: async (data: { id: string; name?: string; color?: string }) => {
    const invoke = await getInvoke();
    return invoke<Tag>("tag_update", {
      id: data.id,
      name: data.name,
      color: data.color,
    });
  },
  deleteTag: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("tag_delete", { id });
  },

  // ---------------------------------------------------------------------------
  // Task-Tag Relations
  // ---------------------------------------------------------------------------
  getTaskTags: async (taskId: string) => {
    const invoke = await getInvoke();
    return invoke<Tag[]>("task_tag_list", { task_id: taskId });
  },
  setTaskTags: async (data: { task_id: string; tag_ids: string[] }) => {
    const invoke = await getInvoke();
    return invoke<void>("task_tag_set", {
      task_id: data.task_id,
      tag_ids: data.tag_ids,
    });
  },
};
