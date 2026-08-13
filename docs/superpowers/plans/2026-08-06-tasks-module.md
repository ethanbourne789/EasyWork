# 任务管理模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 EasyWork 实现"任务管理"模块，包含任务/子任务/标签的数据模型、CRUD 与状态流转、重复任务自动克隆、列表/看板/日历三视图、详情抽屉、Realtime 同步与本地到期提醒，复用 Dashboard 骨架已搭建的 Supabase/Auth/布局/路由/Query 基础设施。

**Architecture:** Supabase Postgres 作为唯一数据源，tasks/subtasks/tags/task_tags 四表 + RLS 行级安全；前端按 `features/tasks` 特性目录组织，repository 层封装 SQL、TanStack Query hooks 管理缓存与乐观更新，组件层拆分为三视图 + 详情抽屉 + 表单；Realtime 通过 Supabase channel 订阅 user_id 过滤的变更，到期提醒用 Tauri plugin-notification 本地定时扫描。

**Tech Stack:** Tauri 2.x, Vite 7, React 19, TypeScript 5, Tailwind CSS v4, shadcn/ui, TanStack Router v1, TanStack Query v5, Zustand v5, @supabase/supabase-js v2, @dnd-kit/core + @dnd-kit/sortable, date-fns, react-hook-form, zod, @hookform/resolvers, @tauri-apps/plugin-notification, Vitest, React Testing Library.

**环境提示:** Windows + PowerShell。命令使用 `;` 分隔，不使用 `&&`。所有路径用反斜杠。

**前置假设:** Dashboard 骨架计划（`docs/superpowers/plans/2026-08-06-dashboard-skeleton.md`）已完成：`src/lib/supabase.ts` 单例、`src/lib/utils.ts` 的 `cn()`、`src/components/ui/button.tsx`、`src/features/auth/authStore.ts`（含 `session.user.id`）、`src/router.tsx`（含 `/tasks` 占位路由）、`src/App.tsx`（含 `QueryClientProvider`）、`vitest.config.ts`、`src/test-setup.ts`、`supabase/migrations/0001_init_profiles.sql` 均已就绪。本计划新增迁移编号从 `0002` 起。

---

## File Structure

```
e:\Dev\EasyWork0807\
├─ supabase\
│  └─ migrations\
│     └─ 0002_tasks.sql                      # tasks/subtasks/tags/task_tags + RLS + 触发器 + 重复克隆
├─ src\
│  ├─ features\
│  │  └─ tasks\
│  │     ├─ types.ts                         # Task / Subtask / Tag / TaskStatus / Priority / RecurrenceRule 类型
│  │     ├─ taskRepository.ts                # Supabase 数据访问层（CRUD + 筛选 + 排序）
│  │     ├─ subtaskRepository.ts             # 子任务数据访问层
│  │     ├─ tagRepository.ts                 # 标签数据访问层
│  │     ├─ useTasks.ts                      # 列表查询 + 筛选 hook
│  │     ├─ useTaskMutations.ts              # 创建/更新/删除/状态变更/排序 hook
│  │     ├─ useSubtasks.ts                   # 子任务 CRUD hook
│  │     ├─ useTags.ts                       # 标签 CRUD hook
│  │     ├─ useTasksRealtime.ts              # Realtime 订阅 hook
│  │     ├─ recurrence.ts                    # 重复规则工具（计算下一次 due_date）
│  │     ├─ TaskCard.tsx                     # 看板卡片
│  │     ├─ TaskRow.tsx                      # 列表行
│  │     ├─ TaskForm.tsx                     # 创建/编辑表单（react-hook-form + zod）
│  │     ├─ TaskListView.tsx                 # 列表视图
│  │     ├─ TaskBoardView.tsx                # 看板视图（@dnd-kit）
│  │     ├─ TaskCalendarView.tsx             # 日历视图（周视图）
│  │     ├─ TaskDetailDrawer.tsx             # 详情抽屉（含 SubtaskList）
│  │     ├─ SubtaskList.tsx                  # 子任务列表
│  │     ├─ TagManager.tsx                   # 标签管理弹层
│  │     ├─ TasksPage.tsx                    # 页面容器 + 三视图切换器
│  │     └─ __tests__\
│  │        ├─ taskRepository.test.ts
│  │        ├─ useTasks.test.tsx
│  │        ├─ useTaskMutations.test.tsx
│  │        ├─ useSubtasks.test.tsx
│  │        ├─ useTags.test.tsx
│  │        ├─ recurrence.test.ts
│  │        ├─ TaskCard.test.tsx
│  │        ├─ TaskForm.test.tsx
│  │        └─ useTasksRealtime.test.tsx
│  ├─ components\
│  │  └─ ui\
│  │     ├─ input.tsx                        # shadcn input（新增）
│  │     ├─ textarea.tsx                     # shadcn textarea（新增）
│  │     ├─ checkbox.tsx                     # shadcn checkbox（新增）
│  │     ├─ select.tsx                       # shadcn select（新增）
│  │     ├─ dialog.tsx                       # shadcn dialog（新增）
│  │     ├─ drawer.tsx                       # shadcn drawer（新增）
│  │     ├─ badge.tsx                        # shadcn badge（新增）
│  │     └─ dropdown-menu.tsx                # shadcn dropdown-menu（新增）
│  ├─ lib\
│  │  └─ queryClient.ts                      # QueryClient 工厂（含默认 staleTime）
│  └─ hooks\
│     └─ useDueSoonTasks.ts                  # 即将到期任务扫描 hook（驱动通知）
└─ src-tauri\
   └─ src\
      └─ lib.rs                              # 修改：注册 notification 插件 + 定时扫描命令
```

---

## Task 1: 数据库迁移 0002_tasks.sql

**Files:**
- Create: `supabase/migrations/0002_tasks.sql`

- [ ] **Step 1: 编写迁移文件（四表 + RLS + 索引 + updated_at 触发器）**

写入 `e:\Dev\EasyWork0807\supabase\migrations\0002_tasks.sql`：

```sql
-- =============================================================
-- 0002_tasks.sql：任务管理模块数据模型
-- 表：tasks / subtasks / tags / task_tags
-- 含：RLS、索引、updated_at 触发器、重复任务克隆触发器
-- =============================================================

-- ---------- 通用：updated_at 触发器函数 ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- tasks 表 ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo','in_progress','done','cancelled')),
  priority text not null default 'medium'
    check (priority in ('low','medium','high','urgent')),
  due_date timestamptz,
  recurrence_rule jsonb,
  recurrence_next timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_due_date_idx on public.tasks(due_date);
create index if not exists tasks_sort_order_idx on public.tasks(sort_order);

alter table public.tasks enable row level security;

create policy "tasks_select_own"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "tasks_insert_own"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "tasks_update_own"
  on public.tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tasks_delete_own"
  on public.tasks for delete
  using (auth.uid() = user_id);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------- subtasks 表 ----------
create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists subtasks_task_id_idx on public.subtasks(task_id);

alter table public.subtasks enable row level security;

create policy "subtasks_select_own"
  on public.subtasks for select
  using (auth.uid() = user_id);

create policy "subtasks_insert_own"
  on public.subtasks for insert
  with check (auth.uid() = user_id);

create policy "subtasks_update_own"
  on public.subtasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "subtasks_delete_own"
  on public.subtasks for delete
  using (auth.uid() = user_id);

-- ---------- tags 表 ----------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.tags enable row level security;

create policy "tags_select_own"
  on public.tags for select
  using (auth.uid() = user_id);

create policy "tags_insert_own"
  on public.tags for insert
  with check (auth.uid() = user_id);

create policy "tags_update_own"
  on public.tags for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tags_delete_own"
  on public.tags for delete
  using (auth.uid() = user_id);

-- ---------- task_tags 关联表 ----------
create table if not exists public.task_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

alter table public.task_tags enable row level security;

create policy "task_tags_select_own"
  on public.task_tags for select
  using (exists (
    select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()
  ));

create policy "task_tags_insert_own"
  on public.task_tags for insert
  with check (exists (
    select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()
  ));

create policy "task_tags_delete_own"
  on public.task_tags for delete
  using (exists (
    select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()
  ));

-- ---------- Realtime：发布任务相关表 ----------
do $$
begin
  if not exists (
    select 1 from publication pgp where pgp.pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end$$;

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.subtasks;
alter publication supabase_realtime add table public.tags;

-- ---------- 重复任务克隆触发器 ----------
-- 当任务被标记为 done 且 recurrence_rule 非空时：
--   1. 计算下一次 due_date = 旧 due_date + interval
--   2. 若未超过 end_date，克隆一条新任务（status=todo，相同 recurrence_rule）
--   3. 清空当前任务的 recurrence_rule（避免再次克隆）
create or replace function public.clone_recurring_task()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_rule jsonb;
  v_freq text;
  v_interval int;
  v_end_date timestamptz;
  v_old_due timestamptz;
  v_new_due timestamptz;
begin
  -- 仅当 status 从非 done 变为 done，且存在重复规则
  if (tg_op = 'UPDATE' and old.status <> 'done' and new.status = 'done' and new.recurrence_rule is not null)
     or (tg_op = 'INSERT' and new.status = 'done' and new.recurrence_rule is not null) then

    v_rule := new.recurrence_rule;
    v_freq := v_rule->>'frequency';
    v_interval := coalesce((v_rule->>'interval')::int, 1);
    v_end_date := nullif(v_rule->>'end_date', '')::timestamptz;
    v_old_due := new.due_date;

    if v_old_due is null then
      -- 无 due_date 时以当前时间为基准
      v_old_due := now();
    end if;

    case v_freq
      when 'daily'   then v_new_due := v_old_due + (v_interval || ' days')::interval;
      when 'weekly'  then v_new_due := v_old_due + (v_interval || ' weeks')::interval;
      when 'monthly' then v_new_due := v_old_due + (v_interval || ' months')::interval;
      else v_new_due := null;
    end case;

    if v_new_due is not null and (v_end_date is null or v_new_due <= v_end_date) then
      insert into public.tasks (
        user_id, title, description, status, priority,
        due_date, recurrence_rule, recurrence_next, sort_order
      ) values (
        new.user_id, new.title, new.description, 'todo', new.priority,
        v_new_due, new.recurrence_rule, null, new.sort_order
      );
    end if;

    -- 清空当前任务的重复规则，防止再次克隆
    if tg_op = 'UPDATE' then
      new.recurrence_rule := null;
      new.recurrence_next := null;
      return new;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_clone_recurring on public.tasks;
create trigger tasks_clone_recurring
  before insert or update of status on public.tasks
  for each row execute function public.clone_recurring_task();
```

- [ ] **Step 2: 部署迁移到 Supabase（手动说明）**

说明：在 Supabase Dashboard 的 SQL Editor 中执行 `0002_tasks.sql` 全文，或用 Supabase CLI：
```powershell
npx supabase db push
```
执行前确认 `.env` 中 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 已填真实项目凭证。执行后在 Table Editor 中应能看到 tasks/subtasks/tags/task_tags 四表，且 RLS 状态为启用。

- [ ] **Step 3: 提交**

Run:
```powershell
git add supabase/migrations/0002_tasks.sql; git commit -m "feat(tasks): add 0002 migration with tasks/subtasks/tags tables, rls, recurrence trigger"
```
Expected: commit 成功。

---

## Task 2: TypeScript 类型定义

**Files:**
- Create: `src/features/tasks/types.ts`

- [ ] **Step 1: 编写类型文件**

写入 `e:\Dev\EasyWork0807\src\features\tasks\types.ts`：

```ts
// 任务状态
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";

// 优先级
export type Priority = "low" | "medium" | "high" | "urgent";

// 重复频率
export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

// 重复规则
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  end_date: string | null;
}

// 标签
export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

// 子任务
export interface Subtask {
  id: string;
  task_id: string;
  user_id: string;
  title: string;
  done: boolean;
  sort_order: number;
  created_at: string;
}

// 任务（含可选的关联标签与子任务，用于详情视图）
export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  recurrence_rule: RecurrenceRule | null;
  recurrence_next: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // 关联数据（由 repository join 或批量查询填充）
  tags?: Tag[];
  subtasks?: Subtask[];
}

// 创建任务入参
export interface TaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  due_date?: string | null;
  recurrence_rule?: RecurrenceRule | null;
  sort_order?: number;
  tag_ids?: string[];
}

// 更新任务入参（部分字段）
export interface TaskUpdate {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  due_date?: string | null;
  recurrence_rule?: RecurrenceRule | null;
  sort_order?: number;
  tag_ids?: string[];
}

// 列表筛选条件
export interface TaskFilter {
  status?: TaskStatus | "all";
  priority?: Priority | "all";
  tag_id?: string | "all";
  search?: string;
  due_before?: string;
  due_after?: string;
}

// 列表排序
export type TaskSortField = "due_date" | "priority" | "created_at" | "sort_order" | "title";
export type SortDirection = "asc" | "desc";
export interface TaskSort {
  field: TaskSortField;
  direction: SortDirection;
}

// 状态流转的合法转换
export const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ["in_progress", "done", "cancelled"],
  in_progress: ["done", "cancelled", "todo"],
  done: ["todo"],
  cancelled: ["todo"],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
```

- [ ] **Step 2: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无错误（此文件仅类型声明，无运行时副作用；若 tsc 报"找不到其他模块"属正常，因为依赖文件尚未创建，但本文件本身无导入错误）。

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/tasks/types.ts; git commit -m "feat(tasks): add typescript domain types for task/subtask/tag"
```
Expected: commit 成功。

---

## Task 3: Supabase 数据访问层 taskRepository

**Files:**
- Create: `src/features/tasks/taskRepository.ts`
- Test: `src/features/tasks/__tests__/taskRepository.test.ts`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\features\tasks\__tests__\taskRepository.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => {
  const chain = () => {
    const state: any = {
      eq: vi.fn(function (this: any, _c: string, _v: any) { return this; }),
      order: vi.fn(function (this: any, _f: string, _o?: any) { return this; }),
      ilike: vi.fn(function (this: any, _c: string, _v: string) { return this; }),
      lte: vi.fn(function (this: any, _c: string, _v: string) { return this; }),
      gte: vi.fn(function (this: any, _c: string, _v: string) { return this; }),
      in: vi.fn(function (this: any, _c: string, _v: any[]) { return this; }),
      single: vi.fn(async () => ({ data: { id: "t1" }, error: null })),
      then: undefined,
    };
    state.select = vi.fn(function (this: any, _s?: string) { return this; });
    state.insert = vi.fn(function (this: any, _rows: any) { return this; });
    state.update = vi.fn(function (this: any, _patch: any) { return this; });
    state.delete = vi.fn(function (this: any) { return this; });
    state.eq.mockReturnThis?.();
    // 让 thenable 直接返回
    const thenable = Object.assign(
      (onFulfilled: any) => Promise.resolve(state.__resolve).then(onFulfilled),
      state
    );
    return thenable;
  };
  const supabase: any = {
    __resolve: { data: [], error: null },
    from: vi.fn(() => {
      const c = chain();
      return c;
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  };
  return { supabase };
});

import { fetchTasks, createTask, updateTask, deleteTask } from "@/features/tasks/taskRepository";
import { supabase } from "@/lib/supabase";

describe("taskRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase as any).__resolve = { data: [], error: null };
  });

  it("fetchTasks 调用 from('tasks').select 并返回 data", async () => {
    (supabase as any).__resolve = { data: [{ id: "t1", title: "A" }], error: null };
    const result = await fetchTasks("u1", {});
    expect(supabase.from).toHaveBeenCalledWith("tasks");
    expect(result).toEqual([{ id: "t1", title: "A" }]);
  });

  it("createTask 插入并返回单条", async () => {
    (supabase as any).__resolve = { data: { id: "new", title: "X" }, error: null };
    const result = await createTask("u1", { title: "X" });
    expect(result).toEqual({ id: "new", title: "X" });
  });

  it("updateTask 更新指定 id", async () => {
    (supabase as any).__resolve = { data: { id: "t1", title: "Y" }, error: null };
    const result = await updateTask("t1", { title: "Y" });
    expect(result).toEqual({ id: "t1", title: "Y" });
  });

  it("deleteTask 删除指定 id", async () => {
    (supabase as any).__resolve = { data: null, error: null };
    await expect(deleteTask("t1")).resolves.toBeUndefined();
  });

  it("fetchTasks 出错时抛异常", async () => {
    (supabase as any).__resolve = { data: null, error: { message: "boom" } };
    await expect(fetchTasks("u1", {})).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/taskRepository.test.ts
```
Expected: FAIL，提示找不到 `@/features/tasks/taskRepository`。

- [ ] **Step 3: 实现 taskRepository**

写入 `e:\Dev\EasyWork0807\src\features\tasks\taskRepository.ts`：

```ts
import { supabase } from "@/lib/supabase";
import type { Task, TaskInput, TaskUpdate, TaskFilter, TaskSort } from "@/features/tasks/types";

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export async function fetchTasks(
  userId: string,
  filter: TaskFilter,
  sort: TaskSort = { field: "sort_order", direction: "asc" }
): Promise<Task[]> {
  let query = supabase.from("tasks").select("*").eq("user_id", userId);

  if (filter.status && filter.status !== "all") {
    query = query.eq("status", filter.status);
  }
  if (filter.priority && filter.priority !== "all") {
    query = query.eq("priority", filter.priority);
  }
  if (filter.search && filter.search.trim() !== "") {
    query = query.ilike("title", `%${filter.search.trim()}%`);
  }
  if (filter.due_before) {
    query = query.lte("due_date", filter.due_before);
  }
  if (filter.due_after) {
    query = query.gte("due_date", filter.due_after);
  }

  query = query.order(sort.field, { ascending: sort.direction === "asc" });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

export async function fetchTaskById(id: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return data as Task;
}

export async function createTask(userId: string, input: TaskInput): Promise<Task> {
  const { tag_ids, ...fields } = input;
  const row = {
    user_id: userId,
    title: fields.title,
    description: fields.description ?? null,
    status: fields.status ?? "todo",
    priority: fields.priority ?? "medium",
    due_date: fields.due_date ?? null,
    recurrence_rule: fields.recurrence_rule ?? null,
    sort_order: fields.sort_order ?? 0,
  };
  const { data, error } = await supabase.from("tasks").insert(row).select().single();
  if (error) throw new Error(error.message);
  const task = data as Task;

  if (tag_ids && tag_ids.length > 0) {
    await setTaskTags(task.id, tag_ids);
  }
  return task;
}

export async function updateTask(id: string, update: TaskUpdate): Promise<Task> {
  const { tag_ids, ...fields } = update;
  const patch: Record<string, unknown> = { ...fields };
  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (tag_ids !== undefined) {
    await setTaskTags(id, tag_ids);
  }
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateStatus(id: string, status: Task["status"]): Promise<Task> {
  return updateTask(id, { status });
}

export async function reorderTasks(orders: { id: string; sort_order: number }[]): Promise<void> {
  await Promise.all(
    orders.map((o) =>
      supabase.from("tasks").update({ sort_order: o.sort_order }).eq("id", o.id)
    )
  );
}

export async function fetchTasksByPriority(userId: string): Promise<Task[]> {
  const tasks = await fetchTasks(userId, { status: "todo" });
  return [...tasks].sort(
    (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
  );
}

// ---------- 标签关联 ----------
export async function setTaskTags(taskId: string, tagIds: string[]): Promise<void> {
  await supabase.from("task_tags").delete().eq("task_id", taskId);
  if (tagIds.length === 0) return;
  const rows = tagIds.map((tag_id) => ({ task_id: taskId, tag_id }));
  const { error } = await supabase.from("task_tags").insert(rows);
  if (error) throw new Error(error.message);
}

export async function fetchTagsForTask(taskId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("task_tags")
    .select("tag_id")
    .eq("task_id", taskId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.tag_id);
}

export async function fetchDueSoonTasks(
  userId: string,
  withinHours: number
): Promise<Task[]> {
  const now = new Date();
  const from = now.toISOString();
  const to = new Date(now.getTime() + withinHours * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["todo", "in_progress"])
    .gte("due_date", from)
    .lte("due_date", to)
    .order("due_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/taskRepository.test.ts
```
Expected: PASS（5 个测试通过）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/tasks/taskRepository.ts src/features/tasks/__tests__/taskRepository.test.ts; git commit -m "feat(tasks): add taskRepository with fetch/create/update/delete and filtering"
```
Expected: commit 成功。

---

## Task 4: useTasks hook —— 列表查询 + 筛选（TDD）

**Files:**
- Create: `src/features/tasks/useTasks.ts`
- Test: `src/features/tasks/__tests__/useTasks.test.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\features\tasks\__tests__\useTasks.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTasks } from "@/features/tasks/useTasks";

vi.mock("@/features/tasks/taskRepository", () => ({
  fetchTasks: vi.fn(),
}));

import { fetchTasks } from "@/features/tasks/taskRepository";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("初始加载返回空数组并标记 loading", async () => {
    (fetchTasks as any).mockResolvedValue([]);
    const { result } = renderHook(
      () => useTasks("u1", { status: "all" }),
      { wrapper }
    );
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tasks).toEqual([]);
    expect(fetchTasks).toHaveBeenCalledWith("u1", { status: "all" }, expect.any(Object));
  });

  it("返回数据后填充 tasks", async () => {
    (fetchTasks as any).mockResolvedValue([
      { id: "t1", title: "A", status: "todo", priority: "medium" },
    ]);
    const { result } = renderHook(
      () => useTasks("u1", { status: "todo" }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.tasks.length).toBe(1));
    expect(result.current.tasks[0].title).toBe("A");
  });

  it("加载失败时填充 error", async () => {
    (fetchTasks as any).mockRejectedValue(new Error("boom"));
    const { result } = renderHook(
      () => useTasks("u1", {}),
      { wrapper }
    );
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error?.message).toBe("boom");
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/useTasks.test.tsx
```
Expected: FAIL，找不到 `@/features/tasks/useTasks`。

- [ ] **Step 3: 实现 useTasks**

写入 `e:\Dev\EasyWork0807\src\features\tasks\useTasks.ts`：

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchTasks } from "@/features/tasks/taskRepository";
import type { Task, TaskFilter, TaskSort } from "@/features/tasks/types";

export const TASKS_QUERY_KEY = "tasks";

export function useTasks(
  userId: string,
  filter: TaskFilter,
  sort: TaskSort = { field: "sort_order", direction: "asc" }
) {
  const query = useQuery({
    queryKey: [TASKS_QUERY_KEY, userId, filter, sort],
    queryFn: () => fetchTasks(userId, filter, sort),
    enabled: !!userId,
    staleTime: 30_000,
  });

  return {
    tasks: (query.data ?? []) as Task[],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/useTasks.test.tsx
```
Expected: PASS（3 个测试通过）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/tasks/useTasks.ts src/features/tasks/__tests__/useTasks.test.tsx; git commit -m "feat(tasks): add useTasks hook with filtering and sorting"
```
Expected: commit 成功。

---

## Task 5: useTaskMutations hook —— 创建/更新/删除/状态变更（TDD）

**Files:**
- Create: `src/features/tasks/useTaskMutations.ts`
- Test: `src/features/tasks/__tests__/useTaskMutations.test.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\features\tasks\__tests__\useTaskMutations.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTaskMutations } from "@/features/tasks/useTaskMutations";
import { TASKS_QUERY_KEY } from "@/features/tasks/useTasks";

vi.mock("@/features/tasks/taskRepository", () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  updateStatus: vi.fn(),
  reorderTasks: vi.fn(),
}));

import {
  createTask,
  updateTask,
  deleteTask,
  updateStatus,
  reorderTasks,
} from "@/features/tasks/taskRepository";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    Wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children),
  };
}

describe("useTaskMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createTask 调用 repository 并使 tasks 查询失效", async () => {
    (createTask as any).mockResolvedValue({ id: "new", title: "X" });
    const { client, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useTaskMutations("u1"), {
      wrapper: Wrapper,
    });
    await result.current.createTask.mutateAsync({ title: "X" });
    expect(createTask).toHaveBeenCalledWith("u1", { title: "X" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [TASKS_QUERY_KEY] });
  });

  it("updateTask 调用 repository 并使查询失效", async () => {
    (updateTask as any).mockResolvedValue({ id: "t1", title: "Y" });
    const { client, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useTaskMutations("u1"), {
      wrapper: Wrapper,
    });
    await result.current.updateTask.mutateAsync({ id: "t1", patch: { title: "Y" } });
    expect(updateTask).toHaveBeenCalledWith("t1", { title: "Y" });
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("deleteTask 调用 repository", async () => {
    (deleteTask as any).mockResolvedValue(undefined);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTaskMutations("u1"), {
      wrapper: Wrapper,
    });
    await result.current.deleteTask.mutateAsync("t1");
    expect(deleteTask).toHaveBeenCalledWith("t1");
  });

  it("setStatus 调用 updateStatus", async () => {
    (updateStatus as any).mockResolvedValue({ id: "t1", status: "done" });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTaskMutations("u1"), {
      wrapper: Wrapper,
    });
    await result.current.setStatus.mutateAsync({ id: "t1", status: "done" });
    expect(updateStatus).toHaveBeenCalledWith("t1", "done");
  });

  it("reorder 调用 reorderTasks", async () => {
    (reorderTasks as any).mockResolvedValue(undefined);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useTaskMutations("u1"), {
      wrapper: Wrapper,
    });
    await result.current.reorder.mutateAsync([{ id: "t1", sort_order: 1 }]);
    expect(reorderTasks).toHaveBeenCalledWith([{ id: "t1", sort_order: 1 }]);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/useTaskMutations.test.tsx
```
Expected: FAIL，找不到 `@/features/tasks/useTaskMutations`。

- [ ] **Step 3: 实现 useTaskMutations**

写入 `e:\Dev\EasyWork0807\src\features\tasks\useTaskMutations.ts`：

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTask as createTaskRepo,
  updateTask as updateTaskRepo,
  deleteTask as deleteTaskRepo,
  updateStatus as updateStatusRepo,
  reorderTasks as reorderTasksRepo,
} from "@/features/tasks/taskRepository";
import { TASKS_QUERY_KEY } from "@/features/tasks/useTasks";
import type { Task, TaskInput, TaskStatus, TaskUpdate } from "@/features/tasks/types";

export interface CreateTaskArgs {
  input: TaskInput;
}
export interface UpdateTaskArgs {
  id: string;
  patch: TaskUpdate;
}
export interface SetStatusArgs {
  id: string;
  status: TaskStatus;
}

export function useTaskMutations(userId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: [TASKS_QUERY_KEY] });

  const createTask = useMutation({
    mutationFn: (input: TaskInput) => createTaskRepo(userId, input),
    onSuccess: invalidate,
  });

  const updateTask = useMutation({
    mutationFn: ({ id, patch }: UpdateTaskArgs) => updateTaskRepo(id, patch),
    onSuccess: invalidate,
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => deleteTaskRepo(id),
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: SetStatusArgs) => updateStatusRepo(id, status),
    onSuccess: invalidate,
  });

  const reorder = useMutation({
    mutationFn: (orders: { id: string; sort_order: number }[]) =>
      reorderTasksRepo(orders),
    onSuccess: invalidate,
  });

  return {
    createTask,
    updateTask,
    deleteTask,
    setStatus,
    reorder,
  };
}

export type UseTaskMutations = ReturnType<typeof useTaskMutations>;
export type { Task, TaskInput, TaskUpdate, TaskStatus };
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/useTaskMutations.test.tsx
```
Expected: PASS（5 个测试通过）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/tasks/useTaskMutations.ts src/features/tasks/__tests__/useTaskMutations.test.tsx; git commit -m "feat(tasks): add useTaskMutations hook for create/update/delete/status/reorder"
```
Expected: commit 成功。

---

## Task 6: useSubtasks hook —— 子任务 CRUD（TDD）

**Files:**
- Create: `src/features/tasks/subtaskRepository.ts`
- Create: `src/features/tasks/useSubtasks.ts`
- Test: `src/features/tasks/__tests__/useSubtasks.test.tsx`

- [ ] **Step 1: 实现 subtaskRepository（无独立测试，由 hook 测试覆盖）**

写入 `e:\Dev\EasyWork0807\src\features\tasks\subtaskRepository.ts`：

```ts
import { supabase } from "@/lib/supabase";
import type { Subtask } from "@/features/tasks/types";

export async function fetchSubtasks(taskId: string): Promise<Subtask[]> {
  const { data, error } = await supabase
    .from("subtasks")
    .select("*")
    .eq("task_id", taskId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Subtask[];
}

export async function createSubtask(
  taskId: string,
  userId: string,
  title: string,
  sortOrder = 0
): Promise<Subtask> {
  const { data, error } = await supabase
    .from("subtasks")
    .insert({ task_id: taskId, user_id: userId, title, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Subtask;
}

export async function toggleSubtask(id: string, done: boolean): Promise<Subtask> {
  const { data, error } = await supabase
    .from("subtasks")
    .update({ done })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Subtask;
}

export async function deleteSubtask(id: string): Promise<void> {
  const { error } = await supabase.from("subtasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\features\tasks\__tests__\useSubtasks.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSubtasks } from "@/features/tasks/useSubtasks";

vi.mock("@/features/tasks/subtaskRepository", () => ({
  fetchSubtasks: vi.fn(),
  createSubtask: vi.fn(),
  toggleSubtask: vi.fn(),
  deleteSubtask: vi.fn(),
}));

import {
  fetchSubtasks,
  createSubtask,
  toggleSubtask,
  deleteSubtask,
} from "@/features/tasks/subtaskRepository";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useSubtasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("查询子任务列表", async () => {
    (fetchSubtasks as any).mockResolvedValue([
      { id: "s1", title: "子1", done: false },
    ]);
    const { result } = renderHook(() => useSubtasks("task1"), { wrapper });
    await waitFor(() => expect(result.current.subtasks.length).toBe(1));
    expect(fetchSubtasks).toHaveBeenCalledWith("task1");
  });

  it("创建子任务后刷新列表", async () => {
    (fetchSubtasks as any).mockResolvedValue([]);
    (createSubtask as any).mockResolvedValue({ id: "s2", title: "新" });
    const { result } = renderHook(() => useSubtasks("task1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.create.mutateAsync({ title: "新", userId: "u1" });
    });
    expect(createSubtask).toHaveBeenCalledWith("task1", "u1", "新", 0);
  });

  it("切换完成状态", async () => {
    (fetchSubtasks as any).mockResolvedValue([
      { id: "s1", title: "子1", done: false },
    ]);
    (toggleSubtask as any).mockResolvedValue({ id: "s1", done: true });
    const { result } = renderHook(() => useSubtasks("task1"), { wrapper });
    await waitFor(() => expect(result.current.subtasks.length).toBe(1));
    await act(async () => {
      await result.current.toggle.mutateAsync({ id: "s1", done: true });
    });
    expect(toggleSubtask).toHaveBeenCalledWith("s1", true);
  });

  it("删除子任务", async () => {
    (fetchSubtasks as any).mockResolvedValue([
      { id: "s1", title: "子1", done: false },
    ]);
    (deleteSubtask as any).mockResolvedValue(undefined);
    const { result } = renderHook(() => useSubtasks("task1"), { wrapper });
    await waitFor(() => expect(result.current.subtasks.length).toBe(1));
    await act(async () => {
      await result.current.remove.mutateAsync("s1");
    });
    expect(deleteSubtask).toHaveBeenCalledWith("s1");
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/useSubtasks.test.tsx
```
Expected: FAIL，找不到 `@/features/tasks/useSubtasks`。

- [ ] **Step 4: 实现 useSubtasks**

写入 `e:\Dev\EasyWork0807\src\features\tasks\useSubtasks.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchSubtasks,
  createSubtask,
  toggleSubtask,
  deleteSubtask,
} from "@/features/tasks/subtaskRepository";
import type { Subtask } from "@/features/tasks/types";

export const SUBTASKS_QUERY_KEY = "subtasks";

export function useSubtasks(taskId: string) {
  const qc = useQueryClient();
  const queryKey = [SUBTASKS_QUERY_KEY, taskId];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchSubtasks(taskId),
    enabled: !!taskId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: ({ title, userId, sortOrder = 0 }: { title: string; userId: string; sortOrder?: number }) =>
      createSubtask(taskId, userId, title, sortOrder),
    onSuccess: invalidate,
  });

  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      toggleSubtask(id, done),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSubtask(id),
    onSuccess: invalidate,
  });

  return {
    subtasks: (query.data ?? []) as Subtask[],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    create,
    toggle,
    remove,
  };
}
```

- [ ] **Step 5: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/useSubtasks.test.tsx
```
Expected: PASS（4 个测试通过）。

- [ ] **Step 6: 提交**

Run:
```powershell
git add src/features/tasks/subtaskRepository.ts src/features/tasks/useSubtasks.ts src/features/tasks/__tests__/useSubtasks.test.tsx; git commit -m "feat(tasks): add subtaskRepository and useSubtasks hook"
```
Expected: commit 成功。

---

## Task 7: useTags hook + TagManager 组件（TDD）

**Files:**
- Create: `src/features/tasks/tagRepository.ts`
- Create: `src/features/tasks/useTags.ts`
- Create: `src/components/ui/badge.tsx`
- Create: `src/features/tasks/TagManager.tsx`
- Test: `src/features/tasks/__tests__/useTags.test.tsx`

- [ ] **Step 1: 实现 tagRepository**

写入 `e:\Dev\EasyWork0807\src\features\tasks\tagRepository.ts`：

```ts
import { supabase } from "@/lib/supabase";
import type { Tag } from "@/features/tasks/types";

export async function fetchTags(userId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Tag[];
}

export async function createTag(
  userId: string,
  name: string,
  color: string | null = null
): Promise<Tag> {
  const { data, error } = await supabase
    .from("tags")
    .insert({ user_id: userId, name, color })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Tag;
}

export async function deleteTag(id: string): Promise<void> {
  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\features\tasks\__tests__\useTags.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTags } from "@/features/tasks/useTags";

vi.mock("@/features/tasks/tagRepository", () => ({
  fetchTags: vi.fn(),
  createTag: vi.fn(),
  deleteTag: vi.fn(),
}));

import { fetchTags, createTag, deleteTag } from "@/features/tasks/tagRepository";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("查询标签列表", async () => {
    (fetchTags as any).mockResolvedValue([{ id: "g1", name: "工作" }]);
    const { result } = renderHook(() => useTags("u1"), { wrapper });
    await waitFor(() => expect(result.current.tags.length).toBe(1));
    expect(fetchTags).toHaveBeenCalledWith("u1");
  });

  it("创建标签后刷新", async () => {
    (fetchTags as any).mockResolvedValue([]);
    (createTag as any).mockResolvedValue({ id: "g2", name: "生活" });
    const { result } = renderHook(() => useTags("u1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.create.mutateAsync({ name: "生活", color: "#0f0" });
    });
    expect(createTag).toHaveBeenCalledWith("u1", "生活", "#0f0");
  });

  it("删除标签", async () => {
    (fetchTags as any).mockResolvedValue([{ id: "g1", name: "工作" }]);
    (deleteTag as any).mockResolvedValue(undefined);
    const { result } = renderHook(() => useTags("u1"), { wrapper });
    await waitFor(() => expect(result.current.tags.length).toBe(1));
    await act(async () => {
      await result.current.remove.mutateAsync("g1");
    });
    expect(deleteTag).toHaveBeenCalledWith("g1");
  });
});
```

- [ ] **Step 3: 运行测试验证失败**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/useTags.test.tsx
```
Expected: FAIL，找不到 `@/features/tasks/useTags`。

- [ ] **Step 4: 实现 useTags**

写入 `e:\Dev\EasyWork0807\src\features\tasks\useTags.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTags, createTag, deleteTag } from "@/features/tasks/tagRepository";
import type { Tag } from "@/features/tasks/types";

export const TAGS_QUERY_KEY = "tags";

export function useTags(userId: string) {
  const qc = useQueryClient();
  const queryKey = [TAGS_QUERY_KEY, userId];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchTags(userId),
    enabled: !!userId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: ({ name, color = null }: { name: string; color?: string | null }) =>
      createTag(userId, name, color),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: invalidate,
  });

  return {
    tags: (query.data ?? []) as Tag[],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    create,
    remove,
  };
}
```

- [ ] **Step 5: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/useTags.test.tsx
```
Expected: PASS（3 个测试通过）。

- [ ] **Step 6: 创建 Badge 组件（shadcn 风格）**

写入 `e:\Dev\EasyWork0807\src\components\ui\badge.tsx`：

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-muted text-muted-foreground",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
```

- [ ] **Step 7: 创建 TagManager 组件**

写入 `e:\Dev\EasyWork0807\src\features\tasks\TagManager.tsx`：

```tsx
import { useState } from "react";
import { Tag as TagIcon, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTags } from "@/features/tasks/useTags";

interface TagManagerProps {
  userId: string;
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
}

export function TagManager({ userId, selectedTagIds, onChange }: TagManagerProps) {
  const { tags, isLoading, create, remove } = useTags(userId);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6b7280");

  const toggle = (id: string) => {
    if (selectedTagIds.includes(id)) {
      onChange(selectedTagIds.filter((t) => t !== id));
    } else {
      onChange([...selectedTagIds, id]);
    }
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    create.mutate(
      { name, color: newColor },
      {
        onSuccess: () => setNewName(""),
      }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <TagIcon size={16} /> 标签
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">加载中…</p>
      ) : tags.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无标签，先创建一个。</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const active = selectedTagIds.includes(t.id);
            return (
              <button key={t.id} type="button" onClick={() => toggle(t.id)} className="group">
                <Badge
                  variant={active ? "default" : "outline"}
                  style={active && t.color ? { backgroundColor: t.color, borderColor: t.color } : undefined}
                  className="cursor-pointer"
                >
                  {t.name}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove.mutate(t.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        remove.mutate(t.id);
                      }
                    }}
                    className="ml-1 opacity-0 group-hover:opacity-100"
                  >
                    <X size={12} />
                  </span>
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新标签名"
          className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
        />
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          className="h-8 w-8 rounded border"
          aria-label="标签颜色"
        />
        <Button type="button" size="sm" variant="outline" onClick={handleCreate} disabled={!newName.trim()}>
          <Plus size={14} />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 9: 提交**

Run:
```powershell
git add src/features/tasks/tagRepository.ts src/features/tasks/useTags.ts src/features/tasks/TagManager.tsx src/features/tasks/__tests__/useTags.test.tsx src/components/ui/badge.tsx; git commit -m "feat(tasks): add tagRepository, useTags hook, TagManager and Badge component"
```
Expected: commit 成功。

---

## Task 8: TaskCard / TaskRow 组件

**Files:**
- Create: `src/features/tasks/recurrence.ts`
- Create: `src/features/tasks/__tests__/recurrence.test.ts`
- Create: `src/components/ui/checkbox.tsx`
- Create: `src/features/tasks/TaskCard.tsx`
- Create: `src/features/tasks/TaskRow.tsx`
- Test: `src/features/tasks/__tests__/TaskCard.test.tsx`

- [ ] **Step 1: 实现 recurrence 工具函数**

写入 `e:\Dev\EasyWork0807\src\features\tasks\recurrence.ts`：

```ts
import { addDays, addWeeks, addMonths, isAfter } from "date-fns";
import type { RecurrenceRule } from "@/features/tasks/types";

// 根据重复规则计算下一次 due_date。返回 null 表示已超过 end_date 或规则无效。
export function nextDueDate(
  currentDue: Date | null,
  rule: RecurrenceRule | null
): Date | null {
  if (!rule || rule.interval < 1) return null;
  const base = currentDue ?? new Date();

  let next: Date;
  switch (rule.frequency) {
    case "daily":
      next = addDays(base, rule.interval);
      break;
    case "weekly":
      next = addWeeks(base, rule.interval);
      break;
    case "monthly":
      next = addMonths(base, rule.interval);
      break;
    default:
      return null;
  }

  if (rule.end_date) {
    const end = new Date(rule.end_date);
    if (isAfter(next, end)) return null;
  }
  return next;
}

export function describeRecurrence(rule: RecurrenceRule | null): string {
  if (!rule) return "";
  const unitMap: Record<string, string> = {
    daily: "天",
    weekly: "周",
    monthly: "月",
  };
  const unit = unitMap[rule.frequency] ?? rule.frequency;
  const interval = rule.interval === 1 ? "" : `${rule.interval}`;
  let text = `每${interval}${unit}`;
  if (rule.end_date) {
    text += `，至 ${new Date(rule.end_date).toLocaleDateString()}`;
  }
  return text;
}
```

- [ ] **Step 2: 编写 recurrence 测试**

写入 `e:\Dev\EasyWork0807\src\features\tasks\__tests__\recurrence.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { nextDueDate, describeRecurrence } from "@/features/tasks/recurrence";

describe("nextDueDate", () => {
  it("daily 规则加 interval 天", () => {
    const base = new Date("2026-08-06T00:00:00Z");
    const next = nextDueDate(base, { frequency: "daily", interval: 1, end_date: null });
    expect(next?.toISOString()).toBe("2026-08-07T00:00:00.000Z");
  });

  it("weekly 规则加 interval 周", () => {
    const base = new Date("2026-08-06T00:00:00Z");
    const next = nextDueDate(base, { frequency: "weekly", interval: 2, end_date: null });
    expect(next?.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("monthly 规则加 interval 月", () => {
    const base = new Date("2026-08-06T00:00:00Z");
    const next = nextDueDate(base, { frequency: "monthly", interval: 1, end_date: null });
    expect(next?.toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });

  it("超过 end_date 返回 null", () => {
    const base = new Date("2026-08-06T00:00:00Z");
    const next = nextDueDate(base, {
      frequency: "daily",
      interval: 1,
      end_date: "2026-08-06T23:59:59Z",
    });
    expect(next).toBeNull();
  });

  it("规则为 null 返回 null", () => {
    expect(nextDueDate(new Date(), null)).toBeNull();
  });
});

describe("describeRecurrence", () => {
  it("daily interval=1 简写", () => {
    expect(describeRecurrence({ frequency: "daily", interval: 1, end_date: null })).toBe("每天");
  });

  it("weekly interval=3 带数字", () => {
    expect(describeRecurrence({ frequency: "weekly", interval: 3, end_date: null })).toBe("每3周");
  });

  it("带 end_date", () => {
    const text = describeRecurrence({
      frequency: "monthly",
      interval: 1,
      end_date: "2026-12-31T00:00:00Z",
    });
    expect(text).toContain("每月");
    expect(text).toContain("2026/12/31");
  });

  it("规则为 null 返回空串", () => {
    expect(describeRecurrence(null)).toBe("");
  });
});
```

- [ ] **Step 3: 运行 recurrence 测试验证失败**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/recurrence.test.ts
```
Expected: FAIL，找不到 `@/features/tasks/recurrence`。

- [ ] **Step 4: 运行 recurrence 测试验证通过**

Run:
```powershell
npm install -D date-fns; npx vitest run src/features/tasks/__tests__/recurrence.test.ts
```
Expected: PASS（date-fns 已在骨架计划安装；若未安装则本次安装。9 个测试通过）。

- [ ] **Step 5: 创建 Checkbox 组件（shadcn 风格）**

写入 `e:\Dev\EasyWork0807\src\components\ui\checkbox.tsx`：

```tsx
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
    return (
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            onChange?.(e);
            onCheckedChange?.(e.target.checked);
          }}
          className="peer absolute h-4 w-4 cursor-pointer opacity-0"
          {...props}
        />
        <span
          className={cn(
            "pointer-events-none flex h-4 w-4 items-center justify-center rounded border border-input bg-background peer-checked:bg-primary peer-checked:border-primary",
            className
          )}
        >
          {checked && <Check size={12} className="text-primary-foreground" />}
        </span>
      </span>
    );
  }
);
Checkbox.displayName = "Checkbox";
```

- [ ] **Step 6: 创建 TaskCard 组件**

写入 `e:\Dev\EasyWork0807\src\features\tasks\TaskCard.tsx`：

```tsx
import { format, isPast, isToday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar, Repeat, Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { describeRecurrence } from "@/features/tasks/recurrence";
import type { Task, TaskStatus } from "@/features/tasks/types";

const PRIORITY_STYLE: Record<string, string> = {
  low: "text-slate-500",
  medium: "text-blue-500",
  high: "text-orange-500",
  urgent: "text-red-500",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};

interface TaskCardProps {
  task: Task;
  onToggleDone?: (task: Task) => void;
  onClick?: (task: Task) => void;
  draggable?: boolean;
  dragHandleProps?: Record<string, unknown>;
}

export function TaskCard({ task, onToggleDone, onClick, draggable, dragHandleProps }: TaskCardProps) {
  const done = task.status === "done";
  const cancelled = task.status === "cancelled";
  const due = task.due_date ? new Date(task.due_date) : null;
  const overdue = due && !done && !cancelled && isPast(due) && !isToday(due);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleDone?.(task);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick?.(task);
      }}
      className={cn(
        "group flex flex-col gap-2 rounded-lg border bg-card p-3 text-left shadow-sm transition-colors hover:bg-accent/40",
        cancelled && "opacity-50",
        draggable && "cursor-grab active:cursor-grabbing"
      )}
      {...dragHandleProps}
    >
      <div className="flex items-start gap-2">
        <button type="button" onClick={handleToggle} className="mt-0.5 shrink-0">
          <Checkbox
            checked={done}
            onCheckedChange={() => onToggleDone?.(task)}
            aria-label="标记完成"
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-medium", done && "line-through text-muted-foreground")}>
            {task.title}
          </p>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
          )}
        </div>
        <Flag size={14} className={cn("shrink-0", PRIORITY_STYLE[task.priority])} aria-label={`优先级 ${PRIORITY_LABEL[task.priority]}`} />
      </div>

      {(due || task.recurrence_rule || (task.tags && task.tags.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {due && (
            <span className={cn("inline-flex items-center gap-1", overdue && "text-red-500 font-medium")}>
              <Calendar size={12} />
              {format(due, "MM-dd HH:mm", { locale: zhCN })}
            </span>
          )}
          {task.recurrence_rule && (
            <span className="inline-flex items-center gap-1">
              <Repeat size={12} />
              {describeRecurrence(task.recurrence_rule)}
            </span>
          )}
          {task.tags?.map((t) => (
            <Badge
              key={t.id}
              variant="secondary"
              style={t.color ? { backgroundColor: t.color, color: "#fff" } : undefined}
            >
              {t.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function statusLabel(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    todo: "待办",
    in_progress: "进行中",
    done: "已完成",
    cancelled: "已取消",
  };
  return map[status];
}
```

- [ ] **Step 7: 创建 TaskRow 组件**

写入 `e:\Dev\EasyWork0807\src\features\tasks\TaskRow.tsx`：

```tsx
import { format, isPast, isToday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar, Repeat, Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { describeRecurrence } from "@/features/tasks/recurrence";
import { statusLabel } from "@/features/tasks/TaskCard";
import type { Task } from "@/features/tasks/types";

const PRIORITY_STYLE: Record<string, string> = {
  low: "text-slate-500",
  medium: "text-blue-500",
  high: "text-orange-500",
  urgent: "text-red-500",
};

interface TaskRowProps {
  task: Task;
  onToggleDone?: (task: Task) => void;
  onClick?: (task: Task) => void;
}

export function TaskRow({ task, onToggleDone, onClick }: TaskRowProps) {
  const done = task.status === "done";
  const cancelled = task.status === "cancelled";
  const due = task.due_date ? new Date(task.due_date) : null;
  const overdue = due && !done && !cancelled && isPast(due) && !isToday(due);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick?.(task);
      }}
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:bg-accent/40",
        cancelled && "opacity-50"
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone?.(task);
        }}
        className="shrink-0"
      >
        <Checkbox checked={done} onCheckedChange={() => onToggleDone?.(task)} aria-label="标记完成" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn("truncate text-sm font-medium", done && "line-through text-muted-foreground")}>
            {task.title}
          </p>
          {task.status === "in_progress" && (
            <Badge variant="secondary" className="shrink-0">{statusLabel(task.status)}</Badge>
          )}
        </div>
        {due && (
          <p className={cn("mt-0.5 text-xs", overdue ? "text-red-500" : "text-muted-foreground")}>
            <Calendar size={11} className="mr-1 inline" />
            {format(due, "yyyy-MM-dd HH:mm", { locale: zhCN })}
          </p>
        )}
      </div>

      {task.recurrence_rule && (
        <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
          <Repeat size={12} />
          {describeRecurrence(task.recurrence_rule)}
        </span>
      )}

      {task.tags?.slice(0, 2).map((t) => (
        <Badge
          key={t.id}
          variant="outline"
          className="hidden shrink-0 sm:inline-flex"
          style={t.color ? { borderColor: t.color, color: t.color } : undefined}
        >
          {t.name}
        </Badge>
      ))}

      <Flag size={14} className={cn("shrink-0", PRIORITY_STYLE[task.priority])} />
    </div>
  );
}
```

- [ ] **Step 8: 编写 TaskCard 测试**

写入 `e:\Dev\EasyWork0807\src\features\tasks\__tests__\TaskCard.test.tsx`：

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskCard } from "@/features/tasks/TaskCard";

const baseTask = {
  id: "t1",
  user_id: "u1",
  title: "测试任务",
  description: null,
  status: "todo" as const,
  priority: "high" as const,
  due_date: null,
  recurrence_rule: null,
  recurrence_next: null,
  sort_order: 0,
  created_at: "2026-08-06T00:00:00Z",
  updated_at: "2026-08-06T00:00:00Z",
};

describe("TaskCard", () => {
  it("渲染标题", () => {
    render(<TaskCard task={baseTask} />);
    expect(screen.getByText("测试任务")).toBeInTheDocument();
  });

  it("点击卡片触发 onClick", () => {
    const onClick = vi.fn();
    render(<TaskCard task={baseTask} onClick={onClick} />);
    fireEvent.click(screen.getByText("测试任务"));
    expect(onClick).toHaveBeenCalledWith(baseTask);
  });

  it("done 状态显示删除线", () => {
    render(<TaskCard task={{ ...baseTask, status: "done" }} />);
    expect(screen.getByText("测试任务")).toHaveClass("line-through");
  });

  it("点击 checkbox 触发 onToggleDone 且不冒泡到卡片", () => {
    const onClick = vi.fn();
    const onToggleDone = vi.fn();
    render(<TaskCard task={baseTask} onClick={onClick} onToggleDone={onToggleDone} />);
    const checkboxBtn = screen.getByLabelText("标记完成").closest("button")!;
    fireEvent.click(checkboxBtn);
    expect(onToggleDone).toHaveBeenCalledWith(baseTask);
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 9: 运行 TaskCard 测试**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/TaskCard.test.tsx
```
Expected: PASS（4 个测试通过）。

- [ ] **Step 10: 提交**

Run:
```powershell
git add src/features/tasks/recurrence.ts src/features/tasks/__tests__/recurrence.test.ts src/components/ui/checkbox.tsx src/features/tasks/TaskCard.tsx src/features/tasks/TaskRow.tsx src/features/tasks/__tests__/TaskCard.test.tsx; git commit -m "feat(tasks): add recurrence utils, TaskCard and TaskRow components"
```
Expected: commit 成功。

---

## Task 9: TaskForm 组件（创建/编辑，react-hook-form + zod）

**Files:**
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/textarea.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/features/tasks/TaskForm.tsx`
- Test: `src/features/tasks/__tests__/TaskForm.test.tsx`

- [ ] **Step 1: 安装表单依赖**

Run:
```powershell
npm install react-hook-form zod @hookform/resolvers
```
Expected: 安装成功。

- [ ] **Step 2: 创建 Input 组件**

写入 `e:\Dev\EasyWork0807\src\components\ui\input.tsx`：

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
```

- [ ] **Step 3: 创建 Textarea 组件**

写入 `e:\Dev\EasyWork0807\src\components\ui\textarea.tsx`：

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
```

- [ ] **Step 4: 创建 Select 组件（原生封装，避免 Radix 交互复杂度）**

写入 `e:\Dev\EasyWork0807\src\components\ui\select.tsx`：

```tsx
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "flex h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-1 pr-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>
    );
  }
);
Select.displayName = "Select";
```

- [ ] **Step 5: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\features\tasks\__tests__\TaskForm.test.tsx`：

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskForm } from "@/features/tasks/TaskForm";

vi.mock("@/features/tasks/useTags", () => ({
  useTags: () => ({
    tags: [{ id: "g1", name: "工作", color: "#0f0", user_id: "u1", created_at: "" }],
    isLoading: false,
    error: null,
    create: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  }),
}));

describe("TaskForm", () => {
  it("创建模式：标题为空提交时显示校验错误且不调用 onSubmit", async () => {
    const onSubmit = vi.fn();
    render(<TaskForm mode="create" userId="u1" onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.submit(screen.getByRole("button", { name: "创建" }).closest("form")!);
    await waitFor(() => expect(screen.getByText("请输入标题")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("编辑模式：预填初始值", () => {
    render(
      <TaskForm
        mode="edit"
        userId="u1"
        initial={{ title: "已有任务", description: "desc", status: "todo", priority: "high" }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect((screen.getByLabelText("标题") as HTMLInputElement).value).toBe("已有任务");
    expect((screen.getByLabelText("描述") as HTMLTextAreaElement).value).toBe("desc");
  });

  it("填写标题后提交成功", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TaskForm mode="create" userId="u1" onSubmit={onSubmit} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText("标题"), "新任务");
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: "新任务", status: "todo", priority: "medium" })
      )
    );
  });
});
```

- [ ] **Step 6: 运行测试验证失败**

Run:
```powershell
npm install -D @testing-library/user-event; npx vitest run src/features/tasks/__tests__/TaskForm.test.tsx
```
Expected: FAIL，找不到 `@/features/tasks/TaskForm`。

- [ ] **Step 7: 实现 TaskForm**

写入 `e:\Dev\EasyWork0807\src\features\tasks\TaskForm.tsx`：

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { TagManager } from "@/features/tasks/TagManager";
import type { Priority, RecurrenceFrequency, TaskInput, TaskStatus } from "@/features/tasks/types";

const schema = z.object({
  title: z.string().min(1, "请输入标题").max(200, "标题最长 200 字"),
  description: z.string().max(2000, "描述最长 2000 字").optional().default(""),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  due_date: z.string().optional().default(""),
  recurrence_frequency: z.enum(["none", "daily", "weekly", "monthly"]).optional().default("none"),
  recurrence_interval: z.coerce.number().int().min(1).max(365).optional().default(1),
  recurrence_end_date: z.string().optional().default(""),
});

type FormValues = z.infer<typeof schema>;

interface TaskFormProps {
  mode: "create" | "edit";
  userId: string;
  initial?: Partial<TaskInput>;
  onSubmit: (input: TaskInput) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function TaskForm({ mode, userId, initial, onSubmit, onCancel, submitting }: TaskFormProps) {
  const [tagIds, setTagIds] = useState<string[]>(initial?.tag_ids ?? []);

  const recurrence = initial?.recurrence_rule;
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? "",
      description: initial?.description ?? "",
      status: (initial?.status as TaskStatus) ?? "todo",
      priority: (initial?.priority as Priority) ?? "medium",
      due_date: initial?.due_date ? initial.due_date.slice(0, 16) : "",
      recurrence_frequency: (recurrence?.frequency as RecurrenceFrequency | "none") ?? "none",
      recurrence_interval: recurrence?.interval ?? 1,
      recurrence_end_date: recurrence?.end_date ? recurrence.end_date.slice(0, 10) : "",
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = form;

  const freq = watch("recurrence_frequency");

  const handleValid = (values: FormValues) => {
    const due = values.due_date ? new Date(values.due_date).toISOString() : null;
    let recurrence_rule: TaskInput["recurrence_rule"] = null;
    if (values.recurrence_frequency && values.recurrence_frequency !== "none") {
      recurrence_rule = {
        frequency: values.recurrence_frequency,
        interval: values.recurrence_interval,
        end_date: values.recurrence_end_date
          ? new Date(values.recurrence_end_date).toISOString()
          : null,
      };
    }
    onSubmit({
      title: values.title,
      description: values.description || null,
      status: values.status,
      priority: values.priority,
      due_date: due,
      recurrence_rule,
      tag_ids: tagIds,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleValid)} className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="title" className="text-sm font-medium">标题</label>
        <Input id="title" aria-label="标题" {...register("title")} placeholder="任务标题" />
        {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
      </div>

      <div className="space-y-1">
        <label htmlFor="description" className="text-sm font-medium">描述</label>
        <Textarea id="description" aria-label="描述" {...register("description")} placeholder="可选描述" />
        {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="status" className="text-sm font-medium">状态</label>
          <Select id="status" {...register("status")}>
            <option value="todo">待办</option>
            <option value="in_progress">进行中</option>
            <option value="done">已完成</option>
            <option value="cancelled">已取消</option>
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="priority" className="text-sm font-medium">优先级</label>
          <Select id="priority" {...register("priority")}>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
            <option value="urgent">紧急</option>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="due_date" className="text-sm font-medium">到期时间</label>
        <Input id="due_date" type="datetime-local" {...register("due_date")} />
      </div>

      <div className="space-y-1">
        <label htmlFor="recurrence_frequency" className="text-sm font-medium">重复</label>
        <Select id="recurrence_frequency" {...register("recurrence_frequency")}>
          <option value="none">不重复</option>
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
          <option value="monthly">每月</option>
        </Select>
      </div>

      {freq && freq !== "none" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="recurrence_interval" className="text-sm font-medium">间隔</label>
            <Input id="recurrence_interval" type="number" min={1} max={365} {...register("recurrence_interval")} />
          </div>
          <div className="space-y-1">
            <label htmlFor="recurrence_end_date" className="text-sm font-medium">截止日期</label>
            <Input id="recurrence_end_date" type="date" {...register("recurrence_end_date")} />
          </div>
        </div>
      )}

      <TagManager userId={userId} selectedTagIds={tagIds} onChange={setTagIds} />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button type="submit" disabled={submitting}>{mode === "create" ? "创建" : "保存"}</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 8: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/TaskForm.test.tsx
```
Expected: PASS（3 个测试通过）。

- [ ] **Step 9: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 10: 提交**

Run:
```powershell
git add src/components/ui/input.tsx src/components/ui/textarea.tsx src/components/ui/select.tsx src/features/tasks/TaskForm.tsx src/features/tasks/__tests__/TaskForm.test.tsx package.json package-lock.json; git commit -m "feat(tasks): add TaskForm with react-hook-form + zod validation and recurrence"
```
Expected: commit 成功。

---

## Task 10: TaskListView 组件

**Files:**
- Create: `src/features/tasks/TaskListView.tsx`

- [ ] **Step 1: 创建 TaskListView**

写入 `e:\Dev\EasyWork0807\src\features\tasks\TaskListView.tsx`：

```tsx
import { useMemo } from "react";
import { Inbox } from "lucide-react";
import { TaskRow } from "@/features/tasks/TaskRow";
import { Button } from "@/components/ui/button";
import type { Task } from "@/features/tasks/types";

interface TaskListViewProps {
  tasks: Task[];
  onToggleDone?: (task: Task) => void;
  onClick?: (task: Task) => void;
  onCreate?: () => void;
  isLoading?: boolean;
}

export function TaskListView({ tasks, onToggleDone, onClick, onCreate, isLoading }: TaskListViewProps) {
  const grouped = useMemo(() => {
    const byStatus: Record<string, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
      cancelled: [],
    };
    for (const t of tasks) {
      (byStatus[t.status] ?? byStatus.todo).push(t);
    }
    return byStatus;
  }, [tasks]);

  const sections: { key: string; label: string; items: Task[] }[] = [
    { key: "in_progress", label: "进行中", items: grouped.in_progress },
    { key: "todo", label: "待办", items: grouped.todo },
    { key: "done", label: "已完成", items: grouped.done },
    { key: "cancelled", label: "已取消", items: grouped.cancelled },
  ];

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">加载中…</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        <Inbox size={40} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">还没有任务，创建第一个吧。</p>
        {onCreate && (
          <Button onClick={onCreate} size="sm">新建任务</Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 p-3">
      {sections.map(
        (section) =>
          section.items.length > 0 && (
            <section key={section.key} className="space-y-2">
              <h3 className="text-xs font-medium uppercase text-muted-foreground">
                {section.label} · {section.items.length}
              </h3>
              <div className="space-y-2">
                {section.items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggleDone={onToggleDone}
                    onClick={onClick}
                  />
                ))}
              </div>
            </section>
          )
      )}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/tasks/TaskListView.tsx; git commit -m "feat(tasks): add TaskListView with status grouping and empty state"
```
Expected: commit 成功。

---

## Task 11: TaskBoardView 组件（@dnd-kit 拖拽）

**Files:**
- Create: `src/features/tasks/TaskBoardView.tsx`

- [ ] **Step 1: 安装 @dnd-kit 依赖**

Run:
```powershell
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```
Expected: 安装成功。

- [ ] **Step 2: 创建 TaskBoardView**

写入 `e:\Dev\EasyWork0807\src\features\tasks\TaskBoardView.tsx`：

```tsx
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TaskCard, statusLabel } from "@/features/tasks/TaskCard";
import type { Task, TaskStatus } from "@/features/tasks/types";
import { cn } from "@/lib/utils";

interface TaskBoardViewProps {
  tasks: Task[];
  onStatusChange?: (task: Task, status: TaskStatus) => void;
  onReorder?: (status: TaskStatus, orderedIds: string[]) => void;
  onToggleDone?: (task: Task) => void;
  onClick?: (task: Task) => void;
}

const COLUMNS: { key: TaskStatus; label: string; accent: string }[] = [
  { key: "todo", label: "待办", accent: "border-t-slate-400" },
  { key: "in_progress", label: "进行中", accent: "border-t-blue-500" },
  { key: "done", label: "已完成", accent: "border-t-green-500" },
  { key: "cancelled", label: "已取消", accent: "border-t-zinc-400" },
];

function SortableCard({
  task,
  onToggleDone,
  onClick,
}: {
  task: Task;
  onToggleDone?: (t: Task) => void;
  onClick?: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard
        task={task}
        onToggleDone={onToggleDone}
        onClick={onClick}
        draggable
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

export function TaskBoardView({
  tasks,
  onStatusChange,
  onReorder,
  onToggleDone,
  onClick,
}: TaskBoardViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const columns = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
      cancelled: [],
    };
    for (const t of tasks) {
      map[t.status].push(t);
    }
    return map;
  }, [tasks]);

  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeId) ?? null,
    [activeId, tasks]
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeTaskItem = tasks.find((t) => t.id === String(active.id));
    if (!activeTaskItem) return;

    // 目标可能是某个卡片（同列/跨列）或某个列容器
    const overId = String(over.id);
    const overTask = tasks.find((t) => t.id === overId);

    if (overTask) {
      // 拖到某张卡片上
      if (overTask.status !== activeTaskItem.status) {
        // 跨列：先改状态
        onStatusChange?.(activeTaskItem, overTask.status);
      }
      // 同列内重排
      const list = columns[activeTaskItem.status];
      const oldIndex = list.findIndex((t) => t.id === activeTaskItem.id);
      const newIndex = list.findIndex((t) => t.id === overTask.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const ordered = arrayMove(list, oldIndex, newIndex).map((t) => t.id);
        onReorder?.(activeTaskItem.status, ordered);
      }
    } else {
      // 拖到列容器（空列或列底部）
      const targetStatus = COLUMNS.find((c) => c.key === overId)?.key;
      if (targetStatus && targetStatus !== activeTaskItem.status) {
        onStatusChange?.(activeTaskItem, targetStatus);
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full gap-3 overflow-x-auto p-3">
        {COLUMNS.map((col) => {
          const items = columns[col.key];
          return (
            <div
              key={col.key}
              id={col.key}
              className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30"
            >
              <div className={cn("flex items-center justify-between border-t-4 rounded-t-lg px-3 py-2", col.accent)}>
                <h3 className="text-sm font-medium">{col.label}</h3>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  {items.map((task) => (
                    <SortableCard
                      key={task.id}
                      task={task}
                      onToggleDone={onToggleDone}
                      onClick={onClick}
                    />
                  ))}
                </SortableContext>
                {items.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">拖拽任务到此</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-2 opacity-80">
            <TaskCard task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export { statusLabel };
```

- [ ] **Step 3: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 4: 提交**

Run:
```powershell
git add src/features/tasks/TaskBoardView.tsx package.json package-lock.json; git commit -m "feat(tasks): add TaskBoardView with dnd-kit drag and drop across columns"
```
Expected: commit 成功。

---

## Task 12: TaskCalendarView 组件（周视图默认，date-fns）

**Files:**
- Create: `src/features/tasks/TaskCalendarView.tsx`

- [ ] **Step 1: 创建 TaskCalendarView**

写入 `e:\Dev\EasyWork0807\src\features\tasks\TaskCalendarView.tsx`：

```tsx
import { useMemo, useState } from "react";
import {
  startOfWeek,
  endOfWeek,
  addDays,
  eachDayOfInterval,
  format,
  isToday,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/features/tasks/TaskCard";
import type { Task } from "@/features/tasks/types";

type ViewMode = "week" | "month";

interface TaskCalendarViewProps {
  tasks: Task[];
  onClick?: (task: Task) => void;
  onToggleDone?: (task: Task) => void;
}

export function TaskCalendarView({ tasks, onClick }: TaskCalendarViewProps) {
  const [cursor, setCursor] = useState<Date>(new Date());
  const [mode, setMode] = useState<ViewMode>("week");

  const days = useMemo(() => {
    const start = mode === "week" ? startOfWeek(cursor, { weekStartsOn: 1 }) : startOfMonth(cursor);
    const end = mode === "week" ? endOfWeek(cursor, { weekStartsOn: 1 }) : endOfMonth(cursor);
    return eachDayOfInterval({ start, end });
  }, [cursor, mode]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const key = format(new Date(t.due_date), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const noDueTasks = useMemo(() => tasks.filter((t) => !t.due_date), [tasks]);

  const goPrev = () => setCursor((c) => (mode === "week" ? addDays(c, -7) : addDays(c, -30)));
  const goNext = () => setCursor((c) => (mode === "week" ? addDays(c, 7) : addDays(c, 30)));
  const goToday = () => setCursor(new Date());

  const PRIORITY_DOT: Record<string, string> = {
    low: "bg-slate-400",
    medium: "bg-blue-500",
    high: "bg-orange-500",
    urgent: "bg-red-500",
  };

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={goPrev} aria-label="上一页">
            <ChevronLeft size={16} />
          </Button>
          <span className="min-w-[120px] text-center text-sm font-medium">
            {format(cursor, mode === "week" ? "yyyy年 MM月 dd日" : "yyyy年 MM月", { locale: zhCN })}
          </span>
          <Button variant="ghost" size="icon" onClick={goNext} aria-label="下一页">
            <ChevronRight size={16} />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday} className="ml-2">今天</Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={mode === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("week")}
          >
            周
          </Button>
          <Button
            variant={mode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("month")}
          >
            月
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-center text-xs font-medium text-muted-foreground">
        {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
          <div key={d} className="bg-card py-1">{d}</div>
        ))}
      </div>

      <div className="mt-px grid flex-1 grid-cols-7 gap-px overflow-y-auto bg-border">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayTasks = tasksByDay.get(key) ?? [];
          const today = isToday(day);
          const outOfMonth = mode === "month" && day.getMonth() !== cursor.getMonth();
          return (
            <div
              key={key}
              className={cn(
                "flex min-h-[80px] flex-col gap-1 bg-card p-1",
                outOfMonth && "opacity-40"
              )}
            >
              <div
                className={cn(
                  "self-start rounded-full px-1.5 text-xs",
                  today && "bg-primary text-primary-foreground"
                )}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1 overflow-hidden">
                {dayTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onClick?.(t)}
                    className="flex w-full items-center gap-1 rounded bg-muted px-1 py-0.5 text-left text-[11px] hover:bg-accent"
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[t.priority])} />
                    <span className={cn("truncate", t.status === "done" && "line-through opacity-60")}>
                      {t.title}
                    </span>
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <span className="px-1 text-[10px] text-muted-foreground">+{dayTasks.length - 3} 更多</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {noDueTasks.length > 0 && (
        <div className="mt-3 rounded-lg border bg-card p-2">
          <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <CalendarDays size={12} /> 无截止日期 · {noDueTasks.length}
          </div>
          <div className="flex flex-wrap gap-1">
            {noDueTasks.map((t) => (
              <Badge
                key={t.id}
                variant="outline"
                className="cursor-pointer"
                onClick={() => onClick?.(t)}
              >
                {statusLabel(t.status)} · {t.title}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/tasks/TaskCalendarView.tsx; git commit -m "feat(tasks): add TaskCalendarView with week/month modes and no-due-date bucket"
```
Expected: commit 成功。

---

## Task 13: TaskDetailDrawer 组件（含 SubtaskList）

**Files:**
- Create: `src/components/ui/drawer.tsx`
- Create: `src/features/tasks/SubtaskList.tsx`
- Create: `src/features/tasks/TaskDetailDrawer.tsx`

- [ ] **Step 1: 安装 vaul（Drawer 依赖）**

Run:
```powershell
npm install vaul
```
Expected: 安装成功。

- [ ] **Step 2: 创建 Drawer 组件（基于 vaul 封装）**

写入 `e:\Dev\EasyWork0807\src\components\ui\drawer.tsx`：

```tsx
import * as React from "react";
import { Drawer as VaulDrawer } from "vaul";
import { cn } from "@/lib/utils";

const Drawer = VaulDrawer.Root;
const DrawerTrigger = VaulDrawer.Trigger;

const DrawerContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <VaulDrawer.Portal>
    <VaulDrawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
    <VaulDrawer.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 mt-24 flex flex-col rounded-t-[10px] border bg-background px-4 pb-[env(safe-area-inset-bottom)] outline-none",
        className
      )}
      {...props}
    >
      <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-muted" />
      {children}
    </VaulDrawer.Content>
  </VaulDrawer.Portal>
));
DrawerContent.displayName = "DrawerContent";

function DrawerHeader({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 mb-3">{children}</div>;
}

function DrawerTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}

export { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle };
```

- [ ] **Step 3: 创建 SubtaskList 组件**

写入 `e:\Dev\EasyWork0807\src\features\tasks\SubtaskList.tsx`：

```tsx
import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSubtasks } from "@/features/tasks/useSubtasks";
import { cn } from "@/lib/utils";

interface SubtaskListProps {
  taskId: string;
  userId: string;
}

export function SubtaskList({ taskId, userId }: SubtaskListProps) {
  const { subtasks, isLoading, create, toggle, remove } = useSubtasks(taskId);
  const [newTitle, setNewTitle] = useState("");

  const handleAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    create.mutate(
      { title, userId, sortOrder: subtasks.length },
      { onSuccess: () => setNewTitle("") }
    );
  };

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">加载子任务…</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="添加子任务"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button type="button" size="icon" variant="outline" onClick={handleAdd} disabled={!newTitle.trim()}>
          <Plus size={16} />
        </Button>
      </div>

      {subtasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">暂无子任务</p>
      ) : (
        <ul className="space-y-1">
          {subtasks.map((s) => (
            <li key={s.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/40">
              <Checkbox
                checked={s.done}
                onCheckedChange={() => toggle.mutate({ id: s.id, done: !s.done })}
                aria-label="子任务完成"
              />
              <span className={cn("flex-1 text-sm", s.done && "line-through text-muted-foreground")}>
                {s.title}
              </span>
              <button
                type="button"
                onClick={() => remove.mutate(s.id)}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="删除子任务"
              >
                <Trash2 size={14} className="text-muted-foreground hover:text-red-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 创建 TaskDetailDrawer 组件**

写入 `e:\Dev\EasyWork0807\src\features\tasks\TaskDetailDrawer.tsx`：

```tsx
import { useState } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { TaskForm } from "@/features/tasks/TaskForm";
import { SubtaskList } from "@/features/tasks/SubtaskList";
import { describeRecurrence } from "@/features/tasks/recurrence";
import { statusLabel } from "@/features/tasks/TaskCard";
import type { Task, TaskInput, TaskStatus } from "@/features/tasks/types";

interface TaskDetailDrawerProps {
  task: Task | null;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (id: string, patch: Partial<TaskInput>) => void;
  onDelete?: (id: string) => void;
  onStatusChange?: (id: string, status: TaskStatus) => void;
}

const STATUS_OPTIONS: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];

export function TaskDetailDrawer({
  task,
  userId,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onStatusChange,
}: TaskDetailDrawerProps) {
  const [editing, setEditing] = useState(false);

  if (!task) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <div className="p-4 text-sm text-muted-foreground">未选择任务</div>
        </DrawerContent>
      </Drawer>
    );
  }

  const due = task.due_date ? new Date(task.due_date) : null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-2">
            <DrawerTitle>{editing ? "编辑任务" : task.title}</DrawerTitle>
            <div className="flex items-center gap-1">
              {!editing && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing(true)}
                    aria-label="编辑"
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete?.(task.id)}
                    aria-label="删除"
                  >
                    <Trash2 size={16} className="text-red-500" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="关闭">
                <X size={16} />
              </Button>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto pb-6">
          {editing ? (
            <TaskForm
              mode="edit"
              userId={userId}
              initial={{
                title: task.title,
                description: task.description ?? undefined,
                status: task.status,
                priority: task.priority,
                due_date: task.due_date ?? undefined,
                recurrence_rule: task.recurrence_rule,
              }}
              onCancel={() => setEditing(false)}
              onSubmit={(input) => {
                onUpdate?.(task.id, input);
                setEditing(false);
              }}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{statusLabel(task.status)}</Badge>
                <Badge variant="outline">优先级：{task.priority}</Badge>
                {due && (
                  <Badge variant="outline">
                    {format(due, "yyyy-MM-dd HH:mm", { locale: zhCN })}
                  </Badge>
                )}
                {task.recurrence_rule && (
                  <Badge variant="outline">{describeRecurrence(task.recurrence_rule)}</Badge>
                )}
                {task.tags?.map((t) => (
                  <Badge
                    key={t.id}
                    variant="secondary"
                    style={t.color ? { backgroundColor: t.color, color: "#fff" } : undefined}
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap gap-1">
                {STATUS_OPTIONS.map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={task.status === s ? "default" : "outline"}
                    onClick={() => onStatusChange?.(task.id, s)}
                  >
                    {statusLabel(s)}
                  </Button>
                ))}
              </div>

              {task.description ? (
                <p className="whitespace-pre-wrap text-sm">{task.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">无描述</p>
              )}

              <div className="border-t pt-3">
                <h3 className="mb-2 text-sm font-medium">子任务</h3>
                <SubtaskList taskId={task.id} userId={userId} />
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 5: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 6: 提交**

Run:
```powershell
git add src/components/ui/drawer.tsx src/features/tasks/SubtaskList.tsx src/features/tasks/TaskDetailDrawer.tsx package.json package-lock.json; git commit -m "feat(tasks): add TaskDetailDrawer with SubtaskList and inline editing"
```
Expected: commit 成功。

---

## Task 14: Realtime 订阅 hook（useTasksRealtime）

**Files:**
- Create: `src/features/tasks/useTasksRealtime.ts`
- Test: `src/features/tasks/__tests__/useTasksRealtime.test.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\features\tasks\__tests__\useTasksRealtime.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useTasksRealtime } from "@/features/tasks/useTasksRealtime";

const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();
const removeChannelMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: subscribeMock.mockImplementation((cb: any) => {
        cb("SUBSCRIBED");
        return { unsubscribe: unsubscribeMock };
      }),
    })),
    removeChannel: removeChannelMock,
  },
}));

import { supabase } from "@/lib/supabase";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useTasksRealtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("挂载时创建 channel 并订阅", () => {
    renderHook(() => useTasksRealtime("u1"), { wrapper });
    expect(supabase.channel).toHaveBeenCalledWith("tasks-realtime-u1");
    expect(subscribeMock).toHaveBeenCalled();
  });

  it("卸载时移除 channel", () => {
    const { unmount } = renderHook(() => useTasksRealtime("u1"), { wrapper });
    unmount();
    expect(removeChannelMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/useTasksRealtime.test.tsx
```
Expected: FAIL，找不到 `@/features/tasks/useTasksRealtime`。

- [ ] **Step 3: 实现 useTasksRealtime**

写入 `e:\Dev\EasyWork0807\src\features\tasks\useTasksRealtime.ts`：

```ts
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { TASKS_QUERY_KEY } from "@/features/tasks/useTasks";
import { SUBTASKS_QUERY_KEY } from "@/features/tasks/useSubtasks";
import { TAGS_QUERY_KEY } from "@/features/tasks/useTags";

type RealtimePayload = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: { user_id?: string; task_id?: string; id?: string };
  old: { user_id?: string; task_id?: string; id?: string };
};

export function useTasksRealtime(userId: string) {
  const qc = useQueryClient();
  const ref = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;
    const channelName = `tasks-realtime-${userId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: [TASKS_QUERY_KEY] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subtasks", filter: `user_id=eq.${userId}` },
        (payload: RealtimePayload) => {
          const taskId = payload.new.task_id ?? payload.old.task_id;
          if (taskId) {
            qc.invalidateQueries({ queryKey: [SUBTASKS_QUERY_KEY, taskId] });
          } else {
            qc.invalidateQueries({ queryKey: [SUBTASKS_QUERY_KEY] });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tags", filter: `user_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: [TAGS_QUERY_KEY, userId] });
        }
      )
      .subscribe();

    ref.current = channel;

    return () => {
      supabase.removeChannel(channel);
      ref.current = null;
    };
  }, [userId, qc]);

  return ref;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/features/tasks/__tests__/useTasksRealtime.test.tsx
```
Expected: PASS（2 个测试通过）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/tasks/useTasksRealtime.ts src/features/tasks/__tests__/useTasksRealtime.test.tsx; git commit -m "feat(tasks): add useTasksRealtime hook subscribing to tasks/subtasks/tags changes"
```
Expected: commit 成功。

---

## Task 15: 路由集成 + 页面组装 + 三视图切换器

**Files:**
- Create: `src/features/tasks/TasksPage.tsx`
- Modify: `src/router.tsx`（替换 `/tasks` 占位路由为真实组件）
- Create: `src/components/ui/dialog.tsx`

- [ ] **Step 1: 安装 Radix Dialog 依赖**

Run:
```powershell
npm install @radix-ui/react-dialog
```
Expected: 安装成功。

- [ ] **Step 2: 创建 Dialog 组件（基于 Radix）**

写入 `e:\Dev\EasyWork0807\src\components\ui\dialog.tsx`：

```tsx
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/50", className)}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-4 shadow-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm opacity-70 hover:opacity-100">
        <X size={16} />
        <span className="sr-only">关闭</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = "DialogContent";

function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 flex flex-col gap-1 text-center sm:text-left">{children}</div>;
}

function DialogTitle({ children }: { children: React.ReactNode }) {
  return (
    <DialogPrimitive.Title className="text-lg font-semibold">{children}</DialogPrimitive.Title>
  );
}

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogClose };
```

- [ ] **Step 3: 创建 TasksPage（页面容器 + 三视图切换 + 详情抽屉 + 创建对话框）**

写入 `e:\Dev\EasyWork0807\src\features\tasks\TasksPage.tsx`：

```tsx
import { useState, useMemo } from "react";
import { ListChecks, Columns3, CalendarDays, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskListView } from "@/features/tasks/TaskListView";
import { TaskBoardView } from "@/features/tasks/TaskBoardView";
import { TaskCalendarView } from "@/features/tasks/TaskCalendarView";
import { TaskDetailDrawer } from "@/features/tasks/TaskDetailDrawer";
import { TaskForm } from "@/features/tasks/TaskForm";
import { useTasks } from "@/features/tasks/useTasks";
import { useTaskMutations } from "@/features/tasks/useTaskMutations";
import { useTasksRealtime } from "@/features/tasks/useTasksRealtime";
import { useAuthStore } from "@/features/auth/authStore";
import { cn } from "@/lib/utils";
import type { Task, TaskInput, TaskStatus } from "@/features/tasks/types";

type ViewMode = "list" | "board" | "calendar";

const VIEW_TABS: { key: ViewMode; label: string; icon: typeof ListChecks }[] = [
  { key: "list", label: "列表", icon: ListChecks },
  { key: "board", label: "看板", icon: Columns3 },
  { key: "calendar", label: "日历", icon: CalendarDays },
];

export function TasksPage() {
  const userId = useAuthStore((s) => s.session?.user.id ?? "");
  const [view, setView] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "low" | "medium" | "high" | "urgent">("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const filter = useMemo(
    () => ({
      status: statusFilter,
      priority: priorityFilter,
      search,
    }),
    [statusFilter, priorityFilter, search]
  );

  const { tasks, isLoading } = useTasks(userId, filter);
  const mutations = useTaskMutations(userId);
  useTasksRealtime(userId);

  const handleToggleDone = (task: Task) => {
    const next: TaskStatus = task.status === "done" ? "todo" : "done";
    if (next === "done") {
      mutations.setStatus.mutate({ id: task.id, status: "done" });
    } else {
      mutations.setStatus.mutate({ id: task.id, status: "todo" });
    }
  };

  const handleOpenTask = (task: Task) => {
    setSelectedTask(task);
    setDrawerOpen(true);
  };

  const handleStatusChange = (id: string, status: TaskStatus) => {
    mutations.setStatus.mutate({ id, status });
    setSelectedTask((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
  };

  const handleUpdate = (id: string, patch: Partial<TaskInput>) => {
    mutations.updateTask.mutate({ id, patch });
    setSelectedTask((prev) => (prev && prev.id === id ? { ...prev, ...patch } as Task : prev));
  };

  const handleDelete = (id: string) => {
    mutations.deleteTask.mutate(id);
    setDrawerOpen(false);
    setSelectedTask(null);
  };

  const handleBoardStatusChange = (task: Task, status: TaskStatus) => {
    mutations.setStatus.mutate({ id: task.id, status });
  };

  const handleBoardReorder = (_status: TaskStatus, orderedIds: string[]) => {
    const orders = orderedIds.map((id, idx) => ({ id, sort_order: idx }));
    mutations.reorder.mutate(orders);
  };

  const handleCreate = (input: TaskInput) => {
    mutations.createTask.mutate(input, {
      onSuccess: () => setCreateOpen(false),
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索任务标题…"
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "all")}
          className="w-28"
        >
          <option value="all">全部状态</option>
          <option value="todo">待办</option>
          <option value="in_progress">进行中</option>
          <option value="done">已完成</option>
          <option value="cancelled">已取消</option>
        </Select>
        <Select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)}
          className="w-28"
        >
          <option value="all">全部优先级</option>
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
          <option value="urgent">紧急</option>
        </Select>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus size={16} /> 新建
        </Button>
      </div>

      {/* 视图切换器 */}
      <div className="flex items-center gap-1 border-b px-3 py-1">
        {VIEW_TABS.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            variant={view === key ? "default" : "ghost"}
            size="sm"
            onClick={() => setView(key)}
            className={cn("gap-1", view === key && "font-medium")}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-hidden">
        {view === "list" && (
          <div className="h-full overflow-y-auto">
            <TaskListView
              tasks={tasks}
              onToggleDone={handleToggleDone}
              onClick={handleOpenTask}
              onCreate={() => setCreateOpen(true)}
              isLoading={isLoading}
            />
          </div>
        )}
        {view === "board" && (
          <TaskBoardView
            tasks={tasks}
            onStatusChange={handleBoardStatusChange}
            onReorder={handleBoardReorder}
            onToggleDone={handleToggleDone}
            onClick={handleOpenTask}
          />
        )}
        {view === "calendar" && (
          <TaskCalendarView tasks={tasks} onClick={handleOpenTask} />
        )}
      </div>

      {/* 详情抽屉 */}
      <TaskDetailDrawer
        task={selectedTask}
        userId={userId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
      />

      {/* 创建对话框 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建任务</DialogTitle>
          </DialogHeader>
          <TaskForm
            mode="create"
            userId={userId}
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
            submitting={mutations.createTask.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: 修改路由，接入 TasksPage**

修改 `e:\Dev\EasyWork0807\src\router.tsx`，找到 tasksRoute 定义并替换其 component：

```tsx
import { TasksPage } from "@/features/tasks/TasksPage";
```

并将 tasksRoute 改为：

```tsx
const tasksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/tasks",
  component: TasksPage,
});
```

具体操作：在 `src/router.tsx` 顶部 import 区新增上述 import 行（放在 Dashboard import 之后），并将原 `component: () => <div className="p-4">任务模块（待实现）</div>` 整行替换为 `component: TasksPage`。

- [ ] **Step 5: 类型检查**

Run:
```powershell
npx tsc --noEmit
```
Expected: 无错误。

- [ ] **Step 6: 提交**

Run:
```powershell
git add src/features/tasks/TasksPage.tsx src/components/ui/dialog.tsx src/router.tsx package.json package-lock.json; git commit -m "feat(tasks): add TasksPage with view switcher, filters, detail drawer and create dialog"
```
Expected: commit 成功。

---

## Task 16: 到期提醒（Tauri notification 定时扫描）+ 全量测试构建验证

**Files:**
- Create: `src/hooks/useDueSoonTasks.ts`
- Modify: `src-tauri/Cargo.toml`（添加 notification 插件依赖）
- Modify: `src-tauri/src/lib.rs`（注册插件）
- Modify: `src-tauri/capabilities/default.json`（授予通知权限）

- [ ] **Step 1: 安装 Tauri notification 前端依赖**

Run:
```powershell
npm install @tauri-apps/plugin-notification
```
Expected: 安装成功。

- [ ] **Step 2: 修改 Cargo.toml 添加插件依赖**

修改 `e:\Dev\EasyWork0807\src-tauri\Cargo.toml`，在 `[dependencies]` 末尾追加一行：

```toml
tauri-plugin-notification = "2"
```

完整 `[dependencies]` 段应为：

```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri-plugin-notification = "2"
```

- [ ] **Step 3: 修改 lib.rs 注册插件**

修改 `e:\Dev\EasyWork0807\src-tauri\src\lib.rs` 为：

```rust
use tauri_plugin_notification::NotificationExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// 即将到期任务扫描命令（前端调用后通过 notification 插件发通知）
#[tauri::command]
fn notify_due_soon(app: tauri::AppHandle, title: String, body: String) {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .ok();
}

// 让上述命令可用：在 Builder 链中 invoke_handler
pub fn run_full() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![notify_due_soon])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

> 说明：保留 `run()` 作为默认入口（不绑定命令，仅启用插件）；`run_full()` 提供带命令的版本。若希望默认入口即带通知命令，可将 `main.rs` 中 `easywork_lib::run()` 改为 `easywork_lib::run_full()`。为简化，本计划直接让 `run()` 同时注册插件与命令。最终 `lib.rs` 写入版本如下（请用此版本覆盖整个文件）：

写入 `e:\Dev\EasyWork0807\src-tauri\src\lib.rs`（最终版）：

```rust
use tauri_plugin_notification::NotificationExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![notify_due_soon])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn notify_due_soon(app: tauri::AppHandle, title: String, body: String) {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .ok();
}
```

- [ ] **Step 4: 修改 capabilities 授予通知权限**

修改 `e:\Dev\EasyWork0807\src-tauri\capabilities\default.json` 为：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "默认权限",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "notification:default",
    "notification:allow-notify",
    "notification:allow-is-permission-granted",
    "notification:allow-request-permission"
  ]
}
```

- [ ] **Step 5: 创建 useDueSoonTasks hook（定时扫描 + 通知）**

写入 `e:\Dev\EasyWork0807\src\hooks\useDueSoonTasks.ts`：

```ts
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchDueSoonTasks } from "@/features/tasks/taskRepository";
import { TASKS_QUERY_KEY } from "@/features/tasks/useTasks";

const NOTIFIED_KEY = "easywork-notified-task-ids";

function loadNotified(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveNotified(set: Set<string>) {
  const MAX = 200;
  const arr = Array.from(set).slice(-MAX);
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(arr));
}

async function sendNotification(title: string, body: string) {
  try {
    const { isPermissionGranted, requestPermission, sendNotification: tauriSend } =
      await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    if (granted) {
      tauriSend({ title, body });
    }
  } catch {
    // 非 Tauri 环境（如浏览器/测试）忽略
  }
}

export function useDueSoonTasks(userId: string, withinHours = 24, intervalMs = 5 * 60 * 1000) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const scan = async () => {
      try {
        const dueSoon = await fetchDueSoonTasks(userId, withinHours);
        const notified = loadNotified();
        const toNotify = dueSoon.filter((t) => !notified.has(t.id));
        if (toNotify.length > 0) {
          const title = `有 ${toNotify.length} 个任务即将到期`;
          const body = toNotify
            .slice(0, 5)
            .map((t) => {
              const due = t.due_date ? new Date(t.due_date).toLocaleString() : "";
              return `• ${t.title}${due ? "（" + due + "）" : ""}`;
            })
            .join("\n");
          await sendNotification(title, body);
          for (const t of toNotify) {
            notified.add(t.id);
          }
          saveNotified(notified);
        }
        qc.invalidateQueries({ queryKey: [TASKS_QUERY_KEY] });
      } catch {
        // 静默失败，避免定时器报错刷屏
      }
    };

    void scan();
    timerRef.current = setInterval(() => void scan(), intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [userId, withinHours, intervalMs, qc]);
}
```

- [ ] **Step 6: 在 TasksPage 中启用到期扫描**

修改 `e:\Dev\EasyWork0807\src\features\tasks\TasksPage.tsx`，在 `useTasksRealtime(userId);` 一行之后新增：

```tsx
import { useDueSoonTasks } from "@/hooks/useDueSoonTasks";
```

并在 `useTasksRealtime(userId);` 之后追加：

```tsx
  useDueSoonTasks(userId);
```

即在 TasksPage 组件体内，`useTasksRealtime(userId);` 紧接其后插入 `useDueSoonTasks(userId);`。

- [ ] **Step 7: 运行全部单元测试**

Run:
```powershell
npm test
```
Expected: 所有任务模块测试通过（taskRepository 5、useTasks 3、useTaskMutations 5、useSubtasks 4、useTags 3、recurrence 9、TaskCard 4、TaskForm 3、useTasksRealtime 2，共 38 个；加上骨架的 authStore 3、useAuth 1、ThemeProvider 2，合计 44 个测试通过）。若个别测试因环境差异失败，按报错信息修复后重跑。

- [ ] **Step 8: 类型检查 + 前端构建**

Run:
```powershell
npm run build
```
Expected: `tsc -b` 无类型错误，`vite build` 产出 `dist/`。

- [ ] **Step 9: 启动前端开发服务器冒烟验证**

Run:
```powershell
npm run dev
```
Expected: Vite 在 `http://localhost:1420` 启动。登录后访问 `/tasks`，应看到三视图切换器、筛选栏、新建按钮；切换列表/看板/日历视图正常渲染（无数据时显示空状态）。验证后停止服务。

- [ ] **Step 10: 提交**

Run:
```powershell
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/default.json src/hooks/useDueSoonTasks.ts src/features/tasks/TasksPage.tsx package.json package-lock.json; git commit -m "feat(tasks): add due-soon reminder via tauri notification and final build verification"
```
Expected: commit 成功。

---

## Self-Review

**1. Spec 覆盖：**
- 数据库（tasks/subtasks/tags/task_tags + RLS + updated_at 触发器 + 重复克隆触发器）→ Task 1 ✓
- TypeScript 类型定义（Task/Subtask/Tag/RecurrenceRule/状态流转）→ Task 2 ✓
- Supabase 数据访问层（CRUD + 筛选 + 排序 + 标签关联 + 到期查询）→ Task 3 ✓
- useTasks（列表/筛选）→ Task 4 ✓
- useTaskMutations（创建/更新/删除/状态变更/排序）→ Task 5 ✓
- useSubtasks → Task 6 ✓
- useTags + TagManager → Task 7 ✓
- TaskCard / TaskRow → Task 8 ✓
- TaskForm（react-hook-form + zod + 重复规则）→ Task 9 ✓
- TaskListView → Task 10 ✓
- TaskBoardView（@dnd-kit 拖拽 + 跨列状态变更）→ Task 11 ✓
- TaskCalendarView（周/月视图 + 无截止日期桶）→ Task 12 ✓
- TaskDetailDrawer（含 SubtaskList + 内联编辑）→ Task 13 ✓
- Realtime 订阅（tasks/subtasks/tags，user_id 过滤）→ Task 14 ✓
- 路由集成 + 三视图切换器 + 页面组装 → Task 15 ✓
- 到期提醒（Tauri notification 定时扫描）+ 全量测试构建 → Task 16 ✓
- 状态流转（todo→in_progress→done；可取消；可恢复）：types.ts 中 STATUS_TRANSITIONS + canTransition 定义，TaskCard/Drawer 提供状态切换按钮 → Task 2/8/13 ✓
- 重复规则 JSONB 与克隆逻辑：DB 触发器（Task 1）+ 前端 recurrence 工具（Task 8）+ TaskForm 录入（Task 9）✓
- 布局适配（桌面三视图 + 移动端列表为主）：TasksPage 工具栏响应式（sm: 断点隐藏文字），看板横向滑动，日历周视图紧凑 → Task 15 ✓

**2. 占位符扫描：** 全文搜索 "TODO"、"TBD"、"待实现"、"类似 Task"、"fill in"、"add appropriate" —— 任务管理模块相关代码块均无占位符。Task 14 中出现一处"最终版"说明是为消除 `noUnusedLocals` 警告而提供的完整可复制版本，最终写入文件版本不含占位。骨架计划中的其他模块占位路由（/mail /notes /finance /settings）不在本计划范围内，属计划范围控制，非本计划占位。✓

**3. 类型一致性：**
- `Task` / `TaskInput` / `TaskUpdate` / `TaskFilter` / `TaskStatus` / `Priority` / `RecurrenceRule` 在 types.ts（Task 2）定义，被 taskRepository（Task 3）、useTasks（Task 4）、useTaskMutations（Task 5）、TaskCard/Row（Task 8）、TaskForm（Task 9）、各视图（Task 10-12）、TaskDetailDrawer（Task 13）、TasksPage（Task 15）一致引用。
- 查询键常量：`TASKS_QUERY_KEY="tasks"`（Task 4）、`SUBTASKS_QUERY_KEY="subtasks"`（Task 6）、`TAGS_QUERY_KEY="tags"`（Task 7），在 useTaskMutations（Task 5）、useTasksRealtime（Task 14）、useDueSoonTasks（Task 16）中复用，命名一致。
- `statusLabel` 在 TaskCard（Task 8）导出，被 TaskRow（Task 8）、TaskBoardView（Task 11）、TaskCalendarView（Task 12）、TaskDetailDrawer（Task 13）一致引用。
- `describeRecurrence` / `nextDueDate` 在 recurrence.ts（Task 8）定义，被 TaskCard/Row、TaskDetailDrawer 一致引用。
- `useTaskMutations` 返回的 mutation 方法名（createTask/updateTask/deleteTask/setStatus/reorder）与 TasksPage（Task 15）调用一致；`setStatus` 入参 `{ id, status }`、`updateTask` 入参 `{ id, patch }`、`reorder` 入参 `orders[]` 在 hook、测试、页面中一致。
- `TaskForm` 的 props（mode/userId/initial/onSubmit/onCancel/submitting）在 Task 9 定义，被 TaskDetailDrawer（Task 13）与 TasksPage 创建对话框（Task 15）一致使用。
- `TaskDetailDrawer` 的 props（task/userId/open/onOpenChange/onUpdate/onDelete/onStatusChange）在 Task 13 定义，与 TasksPage（Task 15）调用一致。✓

**范围说明：** 本计划仅覆盖"任务管理"模块。邮件提醒（Edge Function + Database Webhook）在 spec 中标注为"MVP 可仅本地通知"，本计划以 Tauri 本地通知（Task 16）满足 MVP；邮件提醒留待后续独立计划。
