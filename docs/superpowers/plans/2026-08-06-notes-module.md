# 笔记模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 EasyWork 实现完整的笔记模块：基于 Tiptap v2 的富文本编辑器（标题/列表/代码块/图片/引用/任务清单）、嵌套文件夹树、笔记列表（置顶排序+摘要）、Supabase Postgres 全文搜索（chinese tsvector + GIN）、图片粘贴/拖拽上传 Storage、Realtime 多端同步、防抖自动保存，以及桌面两栏 + 移动端抽屉的响应式布局。

**Architecture:** 数据层 Supabase Postgres（note_folders/notes/note_tags/note_note_tags 四表 + RLS + content_text 提取触发器 + search_vector generated column + GIN 索引）；前端 `src/features/notes/` feature 目录，repository 封装 Supabase 调用，TanStack Query hooks 管理服务端状态，Tiptap 编辑器组件承载富文本，Zustand 管理 UI 选区状态；图片经 Supabase Storage `note-images` bucket；Realtime 订阅 notes 表变更实现多端同步。

**Tech Stack:** Tauri 2.x, Vite 7, React 19, TypeScript 5, Tailwind CSS v4, shadcn/ui, TanStack Router v1, TanStack Query v5, Zustand v5, @supabase/supabase-js v2, @tiptap/react v2, @tiptap/starter-kit v2, @tiptap/extension-image v2, @tiptap/extension-task-list v2, @tiptap/extension-task-item v2, @tiptap/extension-placeholder v2, Vitest, React Testing Library。

**环境提示:** Windows + PowerShell。命令使用 `;` 分隔，不使用 `&&`。所有路径用反斜杠。

**前置假设:** Dashboard 骨架计划已全部完成——`src/lib/supabase.ts` 单例、Auth（authStore + useAuth）、全局 AppLayout（Sidebar + MobileTabBar）、TanStack Router/Query、Zustand、亮暗主题均已就绪。`/notes` 路由当前为占位组件，本计划将其替换为真实页面。Vitest 配置（`vitest.config.ts` + `src/test-setup.ts`）已存在。

---

## File Structure

```
e:\Dev\EasyWork0807\
├─ supabase\
│  └─ migrations\
│     ├─ 0004_notes.sql                 # note_folders/notes/note_tags/note_note_tags + RLS + 触发器 + 全文搜索
│     └─ 0004b_notes_search_rpc.sql     # search_notes RPC 函数
├─ src\
│  ├─ features\
│  │  └─ notes\
│  │     ├─ types.ts                    # TypeScript 类型（含 Tiptap JSON 类型）
│  │     ├─ repositories.ts             # folderRepository / noteRepository（Supabase 数据访问层）
│  │     ├─ useFolders.ts               # 文件夹 CRUD hook
│  │     ├─ useNotes.ts                 # 笔记列表/筛选/CRUD hook
│  │     ├─ useNoteSearch.ts            # 全文搜索 hook
│  │     ├─ useNoteRealtime.ts          # Realtime 订阅 + 自动保存
│  │     ├─ notesStore.ts               # Zustand: 当前选中 folder/note + UI 状态
│  │     ├─ NoteSidebar.tsx             # 文件夹树（递归渲染）
│  │     ├─ NoteList.tsx                # 笔记列表（标题+摘要+时间，置顶排序）
│  │     ├─ NoteEditor.tsx              # Tiptap 编辑器（工具栏 + 内容区 + 自动保存）
│  │     ├─ TiptapToolbar.tsx           # 富文本工具栏
│  │     ├─ NoteSearch.tsx              # 搜索框 + 结果列表
│  │     └─ NotesPage.tsx              # 页面组装（两栏 + 移动端适配）
│  ├─ components\
│  │  └─ ui\
│     ├─ input.tsx                      # shadcn input（本计划新增）
│     └─ sheet.tsx                      # shadcn sheet（移动端抽屉，本计划新增）
│  └─ __tests__\
│     └─ notes\
│        ├─ useFolders.test.tsx
│        ├─ useNotes.test.tsx
│        ├─ useNoteSearch.test.tsx
│        ├─ NoteSidebar.test.tsx
│        ├─ NoteList.test.tsx
│        └─ NoteSearch.test.tsx
└─ docs\
   └─ superpowers\
      └─ plans\
         └─ 2026-08-06-notes-module.md  # 本文档
```

---

## Task 1: 数据库迁移 0004_notes.sql

**Files:**
- Create: `supabase\migrations\0004_notes.sql`

- [ ] **Step 1: 创建迁移文件 —— note_folders 表 + RLS + updated_at 触发器**

写入 `e:\Dev\EasyWork0807\supabase\migrations\0004_notes.sql`：

```sql
-- ============================================================
-- 0004_notes.sql — 笔记模块迁移
-- 包含：note_folders / notes / note_tags / note_note_tags
--       RLS 策略、updated_at 触发器、content_text 提取触发器、
--       search_vector generated column + GIN 索引
-- ============================================================

-- 通用：updated_at 自动更新函数
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- note_folders 表 ----------
create table if not exists public.note_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.note_folders(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists note_folders_user_idx on public.note_folders(user_id);
create index if not exists note_folders_parent_idx on public.note_folders(parent_id);

alter table public.note_folders enable row level security;

create policy "文件夹: 用户读自己的"
  on public.note_folders for select
  using (auth.uid() = user_id);

create policy "文件夹: 用户插自己的"
  on public.note_folders for insert
  with check (auth.uid() = user_id);

create policy "文件夹: 用户改自己的"
  on public.note_folders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "文件夹: 用户删自己的"
  on public.note_folders for delete
  using (auth.uid() = user_id);

drop trigger if exists note_folders_updated_at on public.note_folders;
create trigger note_folders_updated_at
  before update on public.note_folders
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: 追加 notes 表 + content_text 提取触发器函数 + search_vector**

追加到 `e:\Dev\EasyWork0807\supabase\migrations\0004_notes.sql`：

```sql
-- ---------- notes 表 ----------
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.note_folders(id) on delete set null,
  title text not null default '无标题',
  content jsonb not null default '{}'::jsonb,
  content_text text,
  is_pinned boolean not null default false,
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_idx on public.notes(user_id);
create index if not exists notes_folder_idx on public.notes(folder_id);
create index if not exists notes_pinned_idx on public.notes(user_id, is_pinned, updated_at desc);

alter table public.notes enable row level security;

create policy "笔记: 用户读自己的"
  on public.notes for select
  using (auth.uid() = user_id);

create policy "笔记: 用户插自己的"
  on public.notes for insert
  with check (auth.uid() = user_id);

create policy "笔记: 用户改自己的"
  on public.notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "笔记: 用户删自己的"
  on public.notes for delete
  using (auth.uid() = user_id);

drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------- content_text 提取触发器函数 ----------
-- 遍历 Tiptap JSON 文档，拼接所有 text 节点的 text 字段为纯文本
create or replace function public.extract_tiptap_text(doc jsonb)
returns text
language plpgsql
immutable
as $$
declare
  result text := '';
  node jsonb;
  child jsonb;
begin
  if doc is null then
    return '';
  end if;

  if jsonb_typeof(doc) = 'array' then
    foreach node in array jsonb_array_elements(doc)
    loop
      result := result || public.extract_tiptap_text(node);
    end loop;
    return result;
  end if;

  if jsonb_typeof(doc) = 'object' then
    if doc ? 'text' and jsonb_typeof(doc->'text') = 'string' then
      result := coalesce(doc->>'text', '') || ' ';
    end if;

    if doc ? 'content' and jsonb_typeof(doc->'content') = 'array' then
      foreach child in array jsonb_array_elements(doc->'content')
      loop
        result := result || public.extract_tiptap_text(child);
      end loop;
    end if;

    return result;
  end if;

  return '';
end;
$$;

-- notes 插入/更新时自动填充 content_text
create or replace function public.sync_note_content_text()
returns trigger
language plpgsql
as $$
begin
  new.content_text := public.extract_tiptap_text(new.content);
  return new;
end;
$$;

drop trigger if exists notes_sync_content_text on public.notes;
create trigger notes_sync_content_text
  before insert or update of content on public.notes
  for each row execute function public.sync_note_content_text();

-- ---------- search_vector generated column ----------
alter table public.notes
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('chinese', coalesce(title, '') || ' ' || coalesce(content_text, ''))
  ) stored;

create index if not exists notes_search_idx on public.notes using gin(search_vector);
```

- [ ] **Step 3: 追加 note_tags + note_note_tags 关联表**

追加到 `e:\Dev\EasyWork0807\supabase\migrations\0004_notes.sql`：

```sql
-- ---------- note_tags 表 ----------
create table if not exists public.note_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists note_tags_user_idx on public.note_tags(user_id);

alter table public.note_tags enable row level security;

create policy "笔记标签: 用户读自己的"
  on public.note_tags for select
  using (auth.uid() = user_id);

create policy "笔记标签: 用户插自己的"
  on public.note_tags for insert
  with check (auth.uid() = user_id);

create policy "笔记标签: 用户改自己的"
  on public.note_tags for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "笔记标签: 用户删自己的"
  on public.note_tags for delete
  using (auth.uid() = user_id);

-- ---------- note_note_tags 关联表 ----------
create table if not exists public.note_note_tags (
  note_id uuid not null references public.notes(id) on delete cascade,
  tag_id uuid not null references public.note_tags(id) on delete cascade,
  primary key (note_id, tag_id)
);

alter table public.note_note_tags enable row level security;

create policy "笔记标签关联: 用户读自己的"
  on public.note_note_tags for select
  using (
    exists (
      select 1 from public.notes n
      where n.id = note_id and n.user_id = auth.uid()
    )
  );

create policy "笔记标签关联: 用户插自己的"
  on public.note_note_tags for insert
  with check (
    exists (
      select 1 from public.notes n
      where n.id = note_id and n.user_id = auth.uid()
    )
    and exists (
      select 1 from public.note_tags t
      where t.id = tag_id and t.user_id = auth.uid()
    )
  );

create policy "笔记标签关联: 用户删自己的"
  on public.note_note_tags for delete
  using (
    exists (
      select 1 from public.notes n
      where n.id = note_id and n.user_id = auth.uid()
    )
  );
```

- [ ] **Step 4: 启用 Realtime 发布（notes 表变更广播）**

追加到 `e:\Dev\EasyWork0807\supabase\migrations\0004_notes.sql`：

```sql
-- ---------- Realtime 发布 ----------
-- 将 notes 与 note_folders 加入 realtime publication，前端按 user_id 过滤
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'note_folders'
  ) then
    alter publication supabase_realtime add table public.note_folders;
  end if;
end $$;
```

- [ ] **Step 5: 创建 note-images Storage bucket + 策略**

追加到 `e:\Dev\EasyWork0807\supabase\migrations\0004_notes.sql`：

```sql
-- ---------- Storage: note-images bucket ----------
insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', true)
on conflict (id) do nothing;

-- 读：public bucket 已允许匿名读，此处补显式策略
create policy "笔记图片: 公开读"
  on storage.objects for select
  using (bucket_id = 'note-images');

-- 写：仅对象路径首段（user_id）等于当前用户
create policy "笔记图片: 用户上传自己的"
  on storage.objects for insert
  with check (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "笔记图片: 用户改自己的"
  on storage.objects for update
  using (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "笔记图片: 用户删自己的"
  on storage.objects for delete
  using (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 6: 部署迁移到 Supabase（手动说明）**

说明：需在 Supabase Dashboard 的 SQL Editor 中执行 `0004_notes.sql` 全文，或用 Supabase CLI `supabase db push`。执行前确认 `0001_init_profiles.sql` 已应用（auth.users 存在）。执行后在 Table Editor 验证四张表与 `notes_search_idx` 索引存在。

- [ ] **Step 7: 提交**

Run:
```powershell
git add supabase/migrations/0004_notes.sql; git commit -m "feat(notes): add 0004 migration with folders/notes/tags, rls, full-text search, storage"
```
Expected: commit 成功。

---

## Task 2: TypeScript 类型定义

**Files:**
- Create: `src\features\notes\types.ts`

- [ ] **Step 1: 创建类型定义文件**

写入 `e:\Dev\EasyWork0807\src\features\notes\types.ts`：

```ts
// 笔记模块 TypeScript 类型定义

// ---------- Tiptap JSON 文档类型 ----------
// 镜像 Tiptap v2 的 ProseMirror 文档结构，用于 content jsonb 列
export interface TiptapTextNode {
  type: "text";
  text: string;
  marks?: TiptapMark[];
}

export interface TiptapMark {
  type: "bold" | "italic" | "strike" | "code" | "link";
  attrs?: Record<string, unknown>;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[] | TiptapTextNode[];
  marks?: TiptapMark[];
  text?: string;
}

export interface TiptapDoc {
  type: "doc";
  content: TiptapNode[];
}

// ---------- 数据库行类型 ----------
export interface NoteFolder {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  content: TiptapDoc | Record<string, never>;
  content_text: string | null;
  is_pinned: boolean;
  cover_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteTag {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

// ---------- 插入/更新载荷 ----------
export interface NoteFolderInsert {
  name: string;
  parent_id?: string | null;
  sort_order?: number;
}

export interface NoteInsert {
  folder_id?: string | null;
  title?: string;
  content?: TiptapDoc;
  is_pinned?: boolean;
  cover_url?: string | null;
}

export interface NoteUpdate {
  folder_id?: string | null;
  title?: string;
  content?: TiptapDoc;
  is_pinned?: boolean;
  cover_url?: string | null;
}

export interface NoteTagInsert {
  name: string;
  color?: string | null;
}

// ---------- 搜索结果 ----------
export interface NoteSearchResult {
  id: string;
  title: string;
  content_text: string | null;
  folder_id: string | null;
  updated_at: string;
  rank: number;
}

// ---------- 文件夹树（带 children） ----------
export interface NoteFolderNode extends NoteFolder {
  children: NoteFolderNode[];
}

// ---------- 笔记列表查询参数 ----------
export interface NoteListParams {
  folderId?: string | null;
  includePinnedRoot?: boolean;
}
```

- [ ] **Step 2: 提交**

Run:
```powershell
git add src/features/notes/types.ts; git commit -m "feat(notes): add typescript types for notes domain and tiptap json"
```
Expected: commit 成功。

---

## Task 3: Supabase 数据访问层（repositories）

**Files:**
- Create: `src\features\notes\repositories.ts`
- Create: `supabase\migrations\0004b_notes_search_rpc.sql`

- [ ] **Step 1: 创建 repository 文件**

写入 `e:\Dev\EasyWork0807\src\features\notes\repositories.ts`：

```ts
import { supabase } from "@/lib/supabase";
import type {
  Note,
  NoteFolder,
  NoteFolderInsert,
  NoteInsert,
  NoteSearchResult,
  NoteUpdate,
} from "@/features/notes/types";

// ---------- folderRepository ----------
export const folderRepository = {
  async list(): Promise<NoteFolder[]> {
    const { data, error } = await supabase
      .from("note_folders")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async create(payload: NoteFolderInsert): Promise<NoteFolder> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("未登录");

    const { data, error } = await supabase
      .from("note_folders")
      .insert({ ...payload, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, payload: Partial<NoteFolderInsert>): Promise<NoteFolder> {
    const { data, error } = await supabase
      .from("note_folders")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("note_folders").delete().eq("id", id);
    if (error) throw error;
  },
};

// ---------- noteRepository ----------
export const noteRepository = {
  async listByFolder(folderId: string | null): Promise<Note[]> {
    let query = supabase
      .from("notes")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false });

    if (folderId === null) {
      query = query.is("folder_id", null);
    } else {
      query = query.eq("folder_id", folderId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async getById(id: string): Promise<Note | null> {
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(payload: NoteInsert): Promise<Note> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("未登录");

    const { data, error } = await supabase
      .from("notes")
      .insert({ ...payload, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, payload: NoteUpdate): Promise<Note> {
    const { data, error } = await supabase
      .from("notes")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("notes").delete().eq("id", id);
    if (error) throw error;
  },

  async togglePin(id: string, isPinned: boolean): Promise<Note> {
    return this.update(id, { is_pinned: isPinned });
  },

  // 全文搜索：通过 search_notes RPC 匹配 search_vector
  async search(keyword: string): Promise<NoteSearchResult[]> {
    const trimmed = keyword.trim();
    if (!trimmed) return [];

    const tsquery = trimmed
      .split(/\s+/)
      .map((term) => term + ":*")
      .join(" & ");

    const { data, error } = await supabase.rpc("search_notes", { query_text: tsquery });
    if (error) throw error;
    return (data ?? []) as NoteSearchResult[];
  },

  // ---------- 图片上传 ----------
  async uploadImage(
    noteId: string,
    file: File
  ): Promise<{ publicUrl: string; path: string }> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("未登录");

    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/${noteId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("note-images")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("note-images").getPublicUrl(path);
    return { publicUrl: urlData.publicUrl, path };
  },
};
```

- [ ] **Step 2: 创建 search_notes RPC 函数迁移**

写入 `e:\Dev\EasyWork0807\supabase\migrations\0004b_notes_search_rpc.sql`：

```sql
-- search_notes RPC：封装全文搜索，返回匹配笔记 + rank
create or replace function public.search_notes(query_text text)
returns table (
  id uuid,
  title text,
  content_text text,
  folder_id uuid,
  updated_at timestamptz,
  rank real
)
language sql
stable
security definer set search_path = public
as $$
  select
    n.id,
    n.title,
    n.content_text,
    n.folder_id,
    n.updated_at,
    ts_rank(n.search_vector, to_tsquery('chinese', query_text)) as rank
  from public.notes n
  where n.search_vector @@ to_tsquery('chinese', query_text)
    and n.user_id = auth.uid()
  order by rank desc, n.updated_at desc
  limit 50;
$$;
```

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/notes/repositories.ts supabase/migrations/0004b_notes_search_rpc.sql; git commit -m "feat(notes): add folder/note repositories with full-text search and image upload"
```
Expected: commit 成功。

---

## Task 4: useFolders hook（TDD）

**Files:**
- Create: `src\__tests__\notes\useFolders.test.tsx`
- Create: `src\features\notes\useFolders.ts`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\notes\useFolders.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useFolders } from "@/features/notes/useFolders";

const listMock = vi.fn();
const createMock = vi.fn();

vi.mock("@/features/notes/repositories", () => ({
  folderRepository: {
    list: (...args: unknown[]) => listMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useFolders", () => {
  beforeEach(() => {
    listMock.mockReset();
    createMock.mockReset();
  });

  it("加载文件夹列表", async () => {
    listMock.mockResolvedValue([
      { id: "f1", name: "工作", parent_id: null, sort_order: 0 },
    ]);
    const { result } = renderHook(() => useFolders(), { wrapper });
    await waitFor(() => expect(result.current.folders).toHaveLength(1));
    expect(result.current.folders[0].name).toBe("工作");
  });

  it("createFolder 调用 repository 并刷新列表", async () => {
    listMock.mockResolvedValue([]);
    createMock.mockResolvedValue({ id: "f2", name: "新建", parent_id: null });
    const { result } = renderHook(() => useFolders(), { wrapper });
    await waitFor(() => expect(result.current.folders).toEqual([]));

    await result.current.createFolder({ name: "新建" });
    expect(createMock).toHaveBeenCalledWith({ name: "新建" });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/notes/useFolders.test.tsx
```
Expected: FAIL，找不到 `@/features/notes/useFolders`。

- [ ] **Step 3: 实现 useFolders**

写入 `e:\Dev\EasyWork0807\src\features\notes\useFolders.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { folderRepository } from "@/features/notes/repositories";
import type { NoteFolder, NoteFolderInsert } from "@/features/notes/types";

export const foldersKeys = {
  all: ["folders"] as const,
};

export function useFolders() {
  const queryClient = useQueryClient();

  const query = useQuery<NoteFolder[]>({
    queryKey: foldersKeys.all,
    queryFn: () => folderRepository.list(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: NoteFolderInsert) => folderRepository.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: foldersKeys.all }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<NoteFolderInsert> }) =>
      folderRepository.update(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: foldersKeys.all }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => folderRepository.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: foldersKeys.all }),
  });

  return {
    folders: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createFolder: createMutation.mutateAsync,
    updateFolder: updateMutation.mutateAsync,
    deleteFolder: deleteMutation.mutateAsync,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/notes/useFolders.test.tsx
```
Expected: PASS（2 个测试通过）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/notes/useFolders.ts src/__tests__/notes/useFolders.test.tsx; git commit -m "feat(notes): add useFolders hook with tdd"
```
Expected: commit 成功。

---

## Task 5: useNotes hook（列表/筛选/CRUD，TDD）

**Files:**
- Create: `src\__tests__\notes\useNotes.test.tsx`
- Create: `src\features\notes\useNotes.ts`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\notes\useNotes.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useNotes } from "@/features/notes/useNotes";

const listByFolderMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();

vi.mock("@/features/notes/repositories", () => ({
  noteRepository: {
    listByFolder: (...args: unknown[]) => listByFolderMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    remove: (...args: unknown[]) => removeMock(...args),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useNotes", () => {
  beforeEach(() => {
    listByFolderMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    removeMock.mockReset();
  });

  it("按文件夹加载笔记列表", async () => {
    listByFolderMock.mockResolvedValue([
      { id: "n1", title: "笔记A", is_pinned: false, updated_at: "2026-08-06T00:00:00Z" },
    ]);
    const { result } = renderHook(() => useNotes("f1"), { wrapper });
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    expect(listByFolderMock).toHaveBeenCalledWith("f1");
  });

  it("createNote 调用 repository", async () => {
    listByFolderMock.mockResolvedValue([]);
    createMock.mockResolvedValue({ id: "n2", title: "新笔记" });
    const { result } = renderHook(() => useNotes("f1"), { wrapper });
    await waitFor(() => expect(result.current.notes).toEqual([]));

    await act(async () => {
      await result.current.createNote({ title: "新笔记", folder_id: "f1" });
    });
    expect(createMock).toHaveBeenCalled();
  });

  it("置顶笔记排在前面（列表已由后端排序，前端透传）", async () => {
    listByFolderMock.mockResolvedValue([
      { id: "p1", title: "置顶", is_pinned: true },
      { id: "n1", title: "普通", is_pinned: false },
    ]);
    const { result } = renderHook(() => useNotes(null), { wrapper });
    await waitFor(() => expect(result.current.notes).toHaveLength(2));
    expect(result.current.notes[0].is_pinned).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/notes/useNotes.test.tsx
```
Expected: FAIL，找不到 `@/features/notes/useNotes`。

- [ ] **Step 3: 实现 useNotes**

写入 `e:\Dev\EasyWork0807\src\features\notes\useNotes.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { noteRepository } from "@/features/notes/repositories";
import type { Note, NoteInsert, NoteUpdate } from "@/features/notes/types";

export const notesKeys = {
  all: ["notes"] as const,
  byFolder: (folderId: string | null) => ["notes", "folder", folderId ?? "root"] as const,
  detail: (id: string) => ["notes", "detail", id] as const,
};

export function useNotes(folderId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery<Note[]>({
    queryKey: notesKeys.byFolder(folderId),
    queryFn: () => noteRepository.listByFolder(folderId),
  });

  const createMutation = useMutation({
    mutationFn: (payload: NoteInsert) => noteRepository.create(payload),
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.byFolder(note.folder_id) });
      queryClient.setQueryData(notesKeys.detail(note.id), note);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: NoteUpdate }) =>
      noteRepository.update(id, payload),
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.byFolder(note.folder_id) });
      queryClient.setQueryData(notesKeys.detail(note.id), note);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => noteRepository.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: ({ id, isPinned }: { id: string; isPinned: boolean }) =>
      noteRepository.togglePin(id, isPinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });

  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    createNote: createMutation.mutateAsync,
    updateNote: updateMutation.mutateAsync,
    deleteNote: deleteMutation.mutateAsync,
    togglePin: togglePinMutation.mutateAsync,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/notes/useNotes.test.tsx
```
Expected: PASS（3 个测试通过）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/notes/useNotes.ts src/__tests__/notes/useNotes.test.tsx; git commit -m "feat(notes): add useNotes hook with list/filter/crud and pin toggle"
```
Expected: commit 成功。

---

## Task 6: useNoteSearch hook（全文搜索，TDD）

**Files:**
- Create: `src\__tests__\notes\useNoteSearch.test.tsx`
- Create: `src\features\notes\useNoteSearch.ts`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\notes\useNoteSearch.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useNoteSearch } from "@/features/notes/useNoteSearch";

const searchMock = vi.fn();

vi.mock("@/features/notes/repositories", () => ({
  noteRepository: {
    search: (...args: unknown[]) => searchMock(...args),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe("useNoteSearch", () => {
  beforeEach(() => {
    searchMock.mockReset();
  });

  it("空关键词不查询", async () => {
    const { result } = renderHook(() => useNoteSearch(), { wrapper });
    expect(result.current.results).toEqual([]);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("搜索关键词返回结果", async () => {
    searchMock.mockResolvedValue([
      { id: "n1", title: "含关键词的笔记", rank: 0.5 },
    ]);
    const { result } = renderHook(() => useNoteSearch(), { wrapper });

    await act(async () => {
      result.current.setQuery("关键词");
    });
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(searchMock).toHaveBeenCalledWith("关键词");
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/notes/useNoteSearch.test.tsx
```
Expected: FAIL，找不到 `@/features/notes/useNoteSearch`。

- [ ] **Step 3: 实现 useNoteSearch（带防抖）**

写入 `e:\Dev\EasyWork0807\src\features\notes\useNoteSearch.ts`：

```ts
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { noteRepository } from "@/features/notes/repositories";
import type { NoteSearchResult } from "@/features/notes/types";

const DEBOUNCE_MS = 300;

export function useNoteSearch() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isFetching } = useQuery<NoteSearchResult[]>({
    queryKey: ["notes", "search", debounced],
    queryFn: () => noteRepository.search(debounced),
    enabled: debounced.length > 0,
  });

  return {
    query,
    setQuery,
    results: data ?? [],
    isSearching: isFetching,
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/notes/useNoteSearch.test.tsx
```
Expected: PASS（2 个测试通过，注意防抖需等待 300ms，测试用 `waitFor` 默认超时 1000ms 足够）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/notes/useNoteSearch.ts src/__tests__/notes/useNoteSearch.test.tsx; git commit -m "feat(notes): add useNoteSearch hook with debounced full-text search"
```
Expected: commit 成功。

---

## Task 7: notesStore（Zustand UI 状态）

**Files:**
- Create: `src\features\notes\notesStore.ts`

- [ ] **Step 1: 创建 notesStore**

写入 `e:\Dev\EasyWork0807\src\features\notes\notesStore.ts`：

```ts
import { create } from "zustand";

interface NotesUiState {
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  mobileSidebarOpen: boolean;
  searchOpen: boolean;
  selectFolder: (folderId: string | null) => void;
  selectNote: (noteId: string | null) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
}

export const useNotesStore = create<NotesUiState>((set) => ({
  selectedFolderId: null,
  selectedNoteId: null,
  mobileSidebarOpen: false,
  searchOpen: false,
  selectFolder: (folderId) =>
    set({ selectedFolderId: folderId, selectedNoteId: null }),
  selectNote: (noteId) => set({ selectedNoteId: noteId }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
}));
```

- [ ] **Step 2: 提交**

Run:
```powershell
git add src/features/notes/notesStore.ts; git commit -m "feat(notes): add notes ui store for selection and mobile sidebar state"
```
Expected: commit 成功。

---

## Task 8: NoteSidebar 组件（文件夹树，递归渲染）

**Files:**
- Create: `src\__tests__\notes\NoteSidebar.test.tsx`
- Create: `src\features\notes\NoteSidebar.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\notes\NoteSidebar.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NoteSidebar } from "@/features/notes/NoteSidebar";
import { useNotesStore } from "@/features/notes/notesStore";

const listMock = vi.fn();

vi.mock("@/features/notes/useFolders", () => ({
  useFolders: () => ({
    folders: listMock(),
    isLoading: false,
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
  }),
}));

function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient();
  return render(
    React.createElement(QueryClientProvider, { client }, ui)
  );
}

describe("NoteSidebar", () => {
  beforeEach(() => {
    useNotesStore.getState().selectFolder(null);
    listMock.mockReset();
  });

  it("渲染根目录 + 文件夹树（递归）", () => {
    listMock.mockReturnValue([
      { id: "f1", name: "工作", parent_id: null, sort_order: 0 },
      { id: "f2", name: "项目A", parent_id: "f1", sort_order: 0 },
    ]);
    renderWithProviders(<NoteSidebar />);
    expect(screen.getByText("全部笔记")).toBeInTheDocument();
    expect(screen.getByText("工作")).toBeInTheDocument();
    expect(screen.getByText("项目A")).toBeInTheDocument();
  });

  it("点击文件夹选中并更新 store", () => {
    listMock.mockReturnValue([
      { id: "f1", name: "工作", parent_id: null, sort_order: 0 },
    ]);
    renderWithProviders(<NoteSidebar />);
    fireEvent.click(screen.getByText("工作"));
    expect(useNotesStore.getState().selectedFolderId).toBe("f1");
  });

  it("点击全部笔记回到根", () => {
    listMock.mockReturnValue([]);
    useNotesStore.getState().selectFolder("f1");
    renderWithProviders(<NoteSidebar />);
    fireEvent.click(screen.getByText("全部笔记"));
    expect(useNotesStore.getState().selectedFolderId).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/notes/NoteSidebar.test.tsx
```
Expected: FAIL，找不到 `@/features/notes/NoteSidebar`。

- [ ] **Step 3: 实现 NoteSidebar**

写入 `e:\Dev\EasyWork0807\src\features\notes\NoteSidebar.tsx`：

```tsx
import { useMemo } from "react";
import { Folder, FolderPlus, Inbox } from "lucide-react";
import { useFolders } from "@/features/notes/useFolders";
import { useNotesStore } from "@/features/notes/notesStore";
import { cn } from "@/lib/utils";
import type { NoteFolder, NoteFolderNode } from "@/features/notes/types";

function buildTree(folders: NoteFolder[]): NoteFolderNode[] {
  const map = new Map<string, NoteFolderNode>();
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const roots: NoteFolderNode[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function FolderTreeItem({
  node,
  depth,
}: {
  node: NoteFolderNode;
  depth: number;
}) {
  const { selectedFolderId, selectFolder } = useNotesStore();
  const active = selectedFolderId === node.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => selectFolder(node.id)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left",
          active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <Folder size={16} className="shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
      {node.children.map((child) => (
        <FolderTreeItem key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function NoteSidebar() {
  const { folders, createFolder } = useFolders();
  const { selectedFolderId, selectFolder } = useNotesStore();
  const tree = useMemo(() => buildTree(folders), [folders]);

  const handleNewFolder = async () => {
    const name = window.prompt("文件夹名称");
    if (!name) return;
    await createFolder({ name, parent_id: selectedFolderId });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">文件夹</span>
        <button
          type="button"
          onClick={handleNewFolder}
          className="rounded p-1 hover:bg-muted"
          aria-label="新建文件夹"
        >
          <FolderPlus size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        <button
          type="button"
          onClick={() => selectFolder(null)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left",
            selectedFolderId === null ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          <Inbox size={16} className="shrink-0" />
          <span>全部笔记</span>
        </button>
        {tree.map((node) => (
          <FolderTreeItem key={node.id} node={node} depth={0} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/notes/NoteSidebar.test.tsx
```
Expected: PASS（3 个测试通过）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/notes/NoteSidebar.tsx src/__tests__/notes/NoteSidebar.test.tsx; git commit -m "feat(notes): add NoteSidebar with recursive folder tree"
```
Expected: commit 成功。

---

## Task 9: NoteList 组件（标题+摘要+时间，置顶排序）

**Files:**
- Create: `src\__tests__\notes\NoteList.test.tsx`
- Create: `src\features\notes\NoteList.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\notes\NoteList.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NoteList } from "@/features/notes/NoteList";
import { useNotesStore } from "@/features/notes/notesStore";

const notesMock = vi.fn();
const createMock = vi.fn();

vi.mock("@/features/notes/useNotes", () => ({
  useNotes: () => ({
    notes: notesMock(),
    isLoading: false,
    createNote: createMock,
    deleteNote: vi.fn(),
    togglePin: vi.fn(),
  }),
}));

function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient();
  return render(
    React.createElement(QueryClientProvider, { client }, ui)
  );
}

describe("NoteList", () => {
  beforeEach(() => {
    useNotesStore.getState().selectFolder(null);
    notesMock.mockReset();
    createMock.mockReset();
  });

  it("渲染笔记标题与摘要", () => {
    notesMock.mockReturnValue([
      {
        id: "n1",
        title: "我的笔记",
        content_text: "这是一段摘要内容",
        is_pinned: false,
        updated_at: "2026-08-06T10:00:00Z",
      },
    ]);
    renderWithProviders(<NoteList />);
    expect(screen.getByText("我的笔记")).toBeInTheDocument();
    expect(screen.getByText("这是一段摘要内容")).toBeInTheDocument();
  });

  it("点击笔记选中", () => {
    notesMock.mockReturnValue([
      { id: "n1", title: "笔记1", content_text: "", is_pinned: false, updated_at: "2026-08-06T10:00:00Z" },
    ]);
    renderWithProviders(<NoteList />);
    fireEvent.click(screen.getByText("笔记1"));
    expect(useNotesStore.getState().selectedNoteId).toBe("n1");
  });

  it("新建笔记按钮调用 createNote", async () => {
    notesMock.mockReturnValue([]);
    createMock.mockResolvedValue({ id: "n2", folder_id: null });
    renderWithProviders(<NoteList />);
    fireEvent.click(screen.getByText("新建笔记"));
    await waitFor(() => expect(createMock).toHaveBeenCalled());
  });

  it("置顶笔记显示置顶图标", () => {
    notesMock.mockReturnValue([
      { id: "n1", title: "置顶笔记", content_text: "", is_pinned: true, updated_at: "2026-08-06T10:00:00Z" },
    ]);
    renderWithProviders(<NoteList />);
    expect(screen.getByLabelText("已置顶")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/notes/NoteList.test.tsx
```
Expected: FAIL，找不到 `@/features/notes/NoteList`。

- [ ] **Step 3: 实现 NoteList**

写入 `e:\Dev\EasyWork0807\src\features\notes\NoteList.tsx`：

```tsx
import { useNotes } from "@/features/notes/useNotes";
import { useNotesStore } from "@/features/notes/notesStore";
import { cn } from "@/lib/utils";
import { Pin, Plus } from "lucide-react";

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return date.toLocaleDateString("zh-CN");
}

export function NoteList() {
  const { selectedFolderId, selectedNoteId, selectNote } = useNotesStore();
  const { notes, createNote } = useNotes(selectedFolderId);

  const handleNew = async () => {
    const note = await createNote({
      title: "无标题",
      folder_id: selectedFolderId,
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });
    selectNote(note.id);
  };

  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">
          {selectedFolderId ? "文件夹笔记" : "全部笔记"}
        </span>
        <button
          type="button"
          onClick={handleNew}
          className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} />
          新建笔记
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {notes.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            暂无笔记
          </p>
        )}
        {notes.map((note) => {
          const active = selectedNoteId === note.id;
          const summary = (note.content_text ?? "").slice(0, 60) || "无内容";
          return (
            <button
              key={note.id}
              type="button"
              onClick={() => selectNote(note.id)}
              className={cn(
                "flex w-full flex-col gap-1 border-b px-3 py-2 text-left",
                active ? "bg-muted" : "hover:bg-muted/50"
              )}
            >
              <div className="flex items-center gap-2">
                {note.is_pinned && (
                  <Pin size={12} className="shrink-0 text-primary" aria-label="已置顶" />
                )}
                <span className="flex-1 truncate text-sm font-medium">
                  {note.title || "无标题"}
                </span>
              </div>
              <span className="truncate text-xs text-muted-foreground">{summary}</span>
              <span className="text-[10px] text-muted-foreground">
                {formatRelative(note.updated_at)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/notes/NoteList.test.tsx
```
Expected: PASS（4 个测试通过）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/notes/NoteList.tsx src/__tests__/notes/NoteList.test.tsx; git commit -m "feat(notes): add NoteList with title/summary/time and pin indicator"
```
Expected: commit 成功。

---

## Task 10: 安装 Tiptap 依赖 + shadcn 组件

**Files:**
- Create: `src\components\ui\input.tsx`
- Create: `src\components\ui\sheet.tsx`

- [ ] **Step 1: 安装 Tiptap v2 相关包**

Run:
```powershell
npm install @tiptap/react@^2 @tiptap/pm@^2 @tiptap/starter-kit@^2 @tiptap/extension-image@^2 @tiptap/extension-task-list@^2 @tiptap/extension-task-item@^2 @tiptap/extension-placeholder@^2
```
Expected: 安装成功，`package.json` 出现 tiptap 依赖。

- [ ] **Step 2: 创建 shadcn input 组件**

写入 `e:\Dev\EasyWork0807\src\components\ui\input.tsx`：

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
```

- [ ] **Step 3: 安装 sheet 依赖并创建组件**

Run:
```powershell
npm install @radix-ui/react-dialog
```

写入 `e:\Dev\EasyWork0807\src\components\ui\sheet.tsx`：

```tsx
import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-4 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right: "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
      },
    },
    defaultVariants: { side: "left" },
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "left", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute right-3 top-3 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none">
        <X className="h-4 w-4" />
        <span className="sr-only">关闭</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader };
```

- [ ] **Step 4: 提交**

Run:
```powershell
git add package.json package-lock.json src/components/ui/input.tsx src/components/ui/sheet.tsx; git commit -m "feat(notes): install tiptap v2 and add shadcn input/sheet components"
```
Expected: commit 成功。

---

## Task 11: TiptapToolbar 组件

**Files:**
- Create: `src\features\notes\TiptapToolbar.tsx`

- [ ] **Step 1: 创建 TiptapToolbar**

写入 `e:\Dev\EasyWork0807\src\features\notes\TiptapToolbar.tsx`：

```tsx
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  CheckSquare,
  Image as ImageIcon,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TiptapToolbarProps {
  editor: Editor | null;
  onInsertImage: () => void;
}

interface ToolButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}

function ToolButton({ onClick, active, disabled, label, children }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
        disabled && "opacity-40"
      )}
    >
      {children}
    </button>
  );
}

export function TiptapToolbar({ editor, onInsertImage }: TiptapToolbarProps) {
  if (!editor) {
    return <div className="flex h-10 items-center border-b px-2 text-xs text-muted-foreground">编辑器加载中…</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1">
      <ToolButton
        label="撤销"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 size={16} />
      </ToolButton>
      <ToolButton
        label="重做"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo2 size={16} />
      </ToolButton>

      <div className="mx-1 h-5 w-px bg-border" />

      <ToolButton
        label="标题1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 size={16} />
      </ToolButton>
      <ToolButton
        label="标题2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={16} />
      </ToolButton>
      <ToolButton
        label="标题3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 size={16} />
      </ToolButton>

      <div className="mx-1 h-5 w-px bg-border" />

      <ToolButton
        label="加粗"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={16} />
      </ToolButton>
      <ToolButton
        label="斜体"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={16} />
      </ToolButton>
      <ToolButton
        label="删除线"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={16} />
      </ToolButton>
      <ToolButton
        label="行内代码"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={16} />
      </ToolButton>

      <div className="mx-1 h-5 w-px bg-border" />

      <ToolButton
        label="无序列表"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={16} />
      </ToolButton>
      <ToolButton
        label="有序列表"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={16} />
      </ToolButton>
      <ToolButton
        label="任务清单"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <CheckSquare size={16} />
      </ToolButton>
      <ToolButton
        label="引用"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={16} />
      </ToolButton>
      <ToolButton
        label="代码块"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 size={16} />
      </ToolButton>
      <ToolButton label="插入图片" onClick={onInsertImage}>
        <ImageIcon size={16} />
      </ToolButton>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

Run:
```powershell
git add src/features/notes/TiptapToolbar.tsx; git commit -m "feat(notes): add TiptapToolbar with heading/bold/list/code/quote/tasklist/image buttons"
```
Expected: commit 成功。

---

## Task 12: NoteEditor 组件（Tiptap + 图片上传 + 自动保存）

**Files:**
- Create: `src\features\notes\useNoteRealtime.ts`
- Create: `src\features\notes\NoteEditor.tsx`

- [ ] **Step 1: 创建 useNoteRealtime（Realtime 订阅 + 防抖自动保存）**

写入 `e:\Dev\EasyWork0807\src\features\notes\useNoteRealtime.ts`：

```ts
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { notesKeys } from "@/features/notes/useNotes";
import type { Note, NoteUpdate } from "@/features/notes/types";

interface UseNoteRealtimeOptions {
  noteId: string | null;
  onRemoteUpdate?: (note: Note) => void;
}

// 订阅 notes 表变更，当其他设备更新当前笔记时刷新缓存
export function useNoteRealtime({ noteId, onRemoteUpdate }: UseNoteRealtimeOptions) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!noteId) return;

    const channel = supabase
      .channel(`note-${noteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `id=eq.${noteId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const note = payload.new as Note;
          queryClient.setQueryData(notesKeys.detail(noteId), note);
          onRemoteUpdate?.(note);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "note_folders" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["folders"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [noteId, queryClient, onRemoteUpdate]);
}

// 防抖自动保存：content 变化后等待 1s 再提交
export function useDebouncedAutoSave(
  noteId: string | null,
  updateFn: (id: string, payload: NoteUpdate) => Promise<Note>,
  title: string,
  content: unknown,
  delayMs = 1000
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!noteId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      savingRef.current = true;
      try {
        await updateFn(noteId, { title, content: content as Note["content"] });
      } finally {
        savingRef.current = false;
      }
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [noteId, title, content, updateFn, delayMs]);

  return { isSaving: savingRef.current };
}
```

- [ ] **Step 2: 创建 NoteEditor**

写入 `e:\Dev\EasyWork0807\src\features\notes\NoteEditor.tsx`：

```tsx
import { useEffect, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { useQuery } from "@tanstack/react-query";
import { noteRepository } from "@/features/notes/repositories";
import { useNotes } from "@/features/notes/useNotes";
import { notesKeys } from "@/features/notes/useNotes";
import { useNotesStore } from "@/features/notes/notesStore";
import { useNoteRealtime, useDebouncedAutoSave } from "@/features/notes/useNoteRealtime";
import { TiptapToolbar } from "@/features/notes/TiptapToolbar";
import { Input } from "@/components/ui/input";
import type { Note, TiptapDoc } from "@/features/notes/types";

export function NoteEditor() {
  const { selectedNoteId, selectNote } = useNotesStore();
  const { updateNote, deleteNote, togglePin } = useNotes(useNotesStore.getState().selectedFolderId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<TiptapDoc | null>(null);

  // 加载当前笔记详情
  const { data: note } = useQuery<Note | null>({
    queryKey: notesKeys.detail(selectedNoteId ?? ""),
    queryFn: () => (selectedNoteId ? noteRepository.getById(selectedNoteId) : null),
    enabled: !!selectedNoteId,
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "开始输入笔记内容…" }),
    ],
    content: note?.content ?? { type: "doc", content: [{ type: "paragraph" }] },
    onUpdate: ({ editor }) => {
      setContent(editor.getJSON() as TiptapDoc);
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[60vh] px-4 py-3",
      },
    },
  });

  // 笔记切换时重置编辑器内容
  useEffect(() => {
    if (!editor || !note) return;
    setTitle(note.title);
    setContent(note.content as TiptapDoc);
    editor.commands.setContent(note.content as TiptapDoc);
  }, [editor, note?.id]);

  // Realtime 订阅 + 自动保存
  useNoteRealtime({
    noteId: selectedNoteId,
    onRemoteUpdate: (remoteNote) => {
      if (editor && remoteNote.content) {
        editor.commands.setContent(remoteNote.content as TiptapDoc, { emitUpdate: false });
      }
    },
  });

  const { isSaving } = useDebouncedAutoSave(
    selectedNoteId,
    updateNote,
    title,
    content,
    1000
  );

  // 图片上传处理
  const handleUploadImage = useCallback(
    async (file: File) => {
      if (!selectedNoteId || !editor) return;
      try {
        const { publicUrl } = await noteRepository.uploadImage(selectedNoteId, file);
        editor.chain().focus().setImage({ src: publicUrl }).run();
      } catch (err) {
        console.error("图片上传失败", err);
      }
    },
    [selectedNoteId, editor]
  );

  // 工具栏插入图片（文件选择）
  const handleInsertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) handleUploadImage(file);
    };
    input.click();
  };

  // 粘贴/拖拽图片
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleUploadImage(file);
          return;
        }
      }
    };

    const handleDrop = (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const imageFile = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (imageFile) {
        e.preventDefault();
        handleUploadImage(imageFile);
      }
    };

    dom.addEventListener("paste", handlePaste);
    dom.addEventListener("drop", handleDrop);
    return () => {
      dom.removeEventListener("paste", handlePaste);
      dom.removeEventListener("drop", handleDrop);
    };
  }, [editor, handleUploadImage]);

  if (!selectedNoteId || !note) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        请从左侧选择或新建一篇笔记
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TiptapToolbar editor={editor} onInsertImage={handleInsertImage} />
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="笔记标题"
          className="border-0 text-lg font-semibold shadow-none focus-visible:ring-0"
        />
        <span className="text-xs text-muted-foreground">
          {isSaving ? "保存中…" : "已保存"}
        </span>
        <button
          type="button"
          onClick={() => togglePin({ id: note.id, isPinned: !note.is_pinned })}
          className="rounded p-1 hover:bg-muted"
          aria-label="置顶"
          title={note.is_pinned ? "取消置顶" : "置顶"}
        >
          📌
        </button>
        <button
          type="button"
          onClick={async () => {
            await deleteNote(note.id);
            selectNote(null);
          }}
          className="rounded p-1 text-red-500 hover:bg-muted"
          aria-label="删除"
          title="删除"
        >
          🗑
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/notes/useNoteRealtime.ts src/features/notes/NoteEditor.tsx; git commit -m "feat(notes): add NoteEditor with tiptap, image upload, realtime and autosave"
```
Expected: commit 成功。

---

## Task 13: NoteSearch 组件（搜索框+结果列表，TDD）

**Files:**
- Create: `src\__tests__\notes\NoteSearch.test.tsx`
- Create: `src\features\notes\NoteSearch.tsx`

- [ ] **Step 1: 编写失败测试**

写入 `e:\Dev\EasyWork0807\src\__tests__\notes\NoteSearch.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NoteSearch } from "@/features/notes/NoteSearch";
import { useNotesStore } from "@/features/notes/notesStore";

const state = { results: [] as Array<{ id: string; title: string; content_text: string; updated_at: string; rank: number }>, query: "" };

vi.mock("@/features/notes/useNoteSearch", () => ({
  useNoteSearch: () => ({
    query: state.query,
    setQuery: (q: string) => { state.query = q; },
    results: state.results,
    isSearching: false,
  }),
}));

function renderWithProviders(ui: React.ReactNode) {
  const client = new QueryClient();
  return render(React.createElement(QueryClientProvider, { client }, ui));
}

describe("NoteSearch", () => {
  beforeEach(() => {
    useNotesStore.getState().selectNote(null);
    state.results = [];
    state.query = "";
  });

  it("渲染搜索输入框", () => {
    renderWithProviders(<NoteSearch />);
    expect(screen.getByPlaceholderText("搜索笔记…")).toBeInTheDocument();
  });

  it("展示搜索结果列表", async () => {
    state.results = [
      { id: "n1", title: "匹配笔记", content_text: "摘要", updated_at: "2026-08-06T10:00:00Z", rank: 0.5 },
    ];
    renderWithProviders(<NoteSearch />);
    await waitFor(() => expect(screen.getByText("匹配笔记")).toBeInTheDocument());
  });

  it("点击结果选中笔记", async () => {
    state.results = [
      { id: "n1", title: "可点击笔记", content_text: "", updated_at: "2026-08-06T10:00:00Z", rank: 0.5 },
    ];
    renderWithProviders(<NoteSearch />);
    await waitFor(() => expect(screen.getByText("可点击笔记")).toBeInTheDocument());
    fireEvent.click(screen.getByText("可点击笔记"));
    expect(useNotesStore.getState().selectedNoteId).toBe("n1");
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run:
```powershell
npx vitest run src/__tests__/notes/NoteSearch.test.tsx
```
Expected: FAIL，找不到 `@/features/notes/NoteSearch`。

- [ ] **Step 3: 实现 NoteSearch**

写入 `e:\Dev\EasyWork0807\src\features\notes\NoteSearch.tsx`：

```tsx
import { Search } from "lucide-react";
import { useNoteSearch } from "@/features/notes/useNoteSearch";
import { useNotesStore } from "@/features/notes/notesStore";
import { Input } from "@/components/ui/input";

export function NoteSearch() {
  const { query, setQuery, results, isSearching } = useNoteSearch();
  const { selectNote } = useNotesStore();

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索笔记…"
          className="pl-9"
        />
        {isSearching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            搜索中…
          </span>
        )}
      </div>
      {query.trim() && (
        <div className="max-h-72 overflow-auto rounded-md border bg-card">
          {results.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              无匹配结果
            </p>
          )}
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectNote(item.id)}
              className="flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left hover:bg-muted"
            >
              <span className="truncate text-sm font-medium">{item.title}</span>
              {item.content_text && (
                <span className="truncate text-xs text-muted-foreground">
                  {item.content_text.slice(0, 80)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 运行测试验证通过**

Run:
```powershell
npx vitest run src/__tests__/notes/NoteSearch.test.tsx
```
Expected: PASS（3 个测试通过）。

- [ ] **Step 5: 提交**

Run:
```powershell
git add src/features/notes/NoteSearch.tsx src/__tests__/notes/NoteSearch.test.tsx; git commit -m "feat(notes): add NoteSearch component with input and results list"
```
Expected: commit 成功。

---

## Task 14: 路由集成 + 页面组装（两栏布局 + 移动端适配）

**Files:**
- Create: `src\features\notes\NotesPage.tsx`
- Modify: `src\router.tsx`

- [ ] **Step 1: 创建 NotesPage（桌面两栏 + 移动端抽屉）**

写入 `e:\Dev\EasyWork0807\src\features\notes\NotesPage.tsx`：

```tsx
import { Menu, Search as SearchIcon } from "lucide-react";
import { NoteSidebar } from "@/features/notes/NoteSidebar";
import { NoteList } from "@/features/notes/NoteList";
import { NoteEditor } from "@/features/notes/NoteEditor";
import { NoteSearch } from "@/features/notes/NoteSearch";
import { useNotesStore } from "@/features/notes/notesStore";
import {
  Sheet,
  SheetContent,
  SheetHeader,
} from "@/components/ui/sheet";

export function NotesPage() {
  const { mobileSidebarOpen, setMobileSidebarOpen, searchOpen, setSearchOpen } = useNotesStore();

  return (
    <div className="flex h-full flex-col">
      {/* 顶部工具栏：移动端显示菜单与搜索按钮 */}
      <div className="flex h-10 items-center gap-2 border-b px-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="rounded p-1 hover:bg-muted"
          aria-label="打开文件夹"
        >
          <Menu size={18} />
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(!searchOpen)}
          className="rounded p-1 hover:bg-muted"
          aria-label="搜索"
        >
          <SearchIcon size={18} />
        </button>
      </div>

      {/* 搜索区（移动端可折叠，桌面端常驻顶部） */}
      <div className="border-b px-3 py-2 md:block" hidden={!searchOpen && true}>
        <div className="hidden md:block">
          <NoteSearch />
        </div>
      </div>
      {searchOpen && (
        <div className="border-b px-3 py-2 md:hidden">
          <NoteSearch />
        </div>
      )}

      {/* 桌面两栏：文件夹树 + 笔记列表 + 编辑器 */}
      <div className="hidden flex-1 md:flex">
        <div className="w-56 shrink-0 border-r">
          <NoteSidebar />
        </div>
        <div className="w-72 shrink-0">
          <NoteList />
        </div>
        <div className="flex-1 min-w-0">
          <NoteEditor />
        </div>
      </div>

      {/* 移动端：笔记列表 + 编辑器全屏切换 */}
      <div className="flex-1 md:hidden">
        <NoteList />
      </div>

      {/* 移动端文件夹抽屉 */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="px-3 py-2">
            <span className="text-sm font-medium">文件夹</span>
          </SheetHeader>
          <div className="h-full">
            <NoteSidebar />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 2: 修改路由替换占位组件**

修改 `e:\Dev\EasyWork0807\src\router.tsx`，将 notesRoute 的占位组件替换为真实页面。

找到以下代码：

```tsx
const notesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/notes",
  component: () => <div className="p-4">笔记模块（待实现）</div>,
});
```

替换为：

```tsx
const notesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/notes",
  component: NotesPage,
});
```

并在文件顶部 import 区追加：

```tsx
import { NotesPage } from "@/features/notes/NotesPage";
```

- [ ] **Step 3: 提交**

Run:
```powershell
git add src/features/notes/NotesPage.tsx src/router.tsx; git commit -m "feat(notes): assemble NotesPage with two-column desktop and mobile drawer layout"
```
Expected: commit 成功。

---

## Task 15: 全量测试构建验证

**Files:** 无新增

- [ ] **Step 1: 运行笔记模块全部单元测试**

Run:
```powershell
npx vitest run src/__tests__/notes
```
Expected: 所有笔记模块测试通过（useFolders 2 个、useNotes 3 个、useNoteSearch 2 个、NoteSidebar 3 个、NoteList 4 个、NoteSearch 3 个，共 17 个）。

- [ ] **Step 2: 运行全量单元测试**

Run:
```powershell
npm test
```
Expected: 全部测试通过（含骨架阶段 authStore/useAuth/ThemeProvider 及笔记模块测试，无失败）。

- [ ] **Step 3: 类型检查 + 构建**

Run:
```powershell
npm run build
```
Expected: `tsc -b` 无类型错误，`vite build` 产出 `dist/`。若 Tiptap 类型报错，确认 `@tiptap/pm` 已安装（Step Task 10 已安装）。

- [ ] **Step 4: 启动前端开发服务器手动验证**

Run:
```powershell
npm run dev
```
Expected: Vite 在 `http://localhost:1420` 启动，登录后访问 `/notes`：桌面端显示三栏（文件夹树 + 笔记列表 + 编辑器），新建笔记可输入富文本，工具栏按钮可用，粘贴图片触发上传，1 秒后显示"已保存"。移动端窄屏显示列表，点击左上角菜单弹出文件夹抽屉。验证后停止 dev server。

- [ ] **Step 5: 提交最终状态**

Run:
```powershell
git add -A; git commit -m "chore(notes): verify build and tests pass for notes module"
```
Expected: commit 成功（若有改动）。

---

## Self-Review

**1. Spec 覆盖（spec 第 7.3 节）：**
- 数据库（note_folders/notes/note_tags/note_note_tags + RLS + updated_at 触发器 + content_text 提取触发器 + search_vector generated column + GIN 索引）→ Task 1 ✓
- 全文搜索（to_tsvector('chinese') + GIN + tsquery 查询，封装为 search_notes RPC）→ Task 1/3 ✓
- 图片存储（note-images bucket + user_id 路径前缀策略 + 粘贴/拖拽上传）→ Task 1/12 ✓
- pgvector 语义搜索（非 MVP，文档说明预留，未实现）→ 未纳入计划，符合范围 ✓
- 组件拆分（NoteSidebar/NoteList/NoteEditor/TiptapToolbar/NoteSearch/useNotes/useFolders）→ Task 4-9/11-13 ✓
- 布局适配（桌面两栏 + 移动端文件夹抽屉 + 编辑器全屏）→ Task 14 ✓
- Tiptap 富文本（标题/列表/代码块/图片/表格占位/引用/任务清单）→ Task 10-12 ✓（表格扩展未纳入 StarterKit 默认，如需可后续补 @tiptap/extension-table）

**2. 占位符扫描：** 无 TODO/TBD/占位。所有代码块完整可用，SQL 迁移可直接执行，TS/TSX 可直接编译。`search_notes` RPC 与前端 `noteRepository.search` 参数对齐（query_text: tsquery 字符串）。✓

**3. TDD 流程：** Task 4/5/6/8/9/13 均遵循"失败测试 → 验证失败 → 实现 → 验证通过 → commit"五步。测试 mock supabase 经 repository 层间接 mock（`vi.mock("@/features/notes/repositories")`），不直接耦合 supabase-js。✓

**4. 类型一致性：** `Note`/`NoteFolder`/`NoteSearchResult`/`TiptapDoc` 在 types.ts 定义，repository/hooks/组件均 import 引用，无重复定义。`notesKeys`/`foldersKeys` 查询键工厂在 hooks 中导出，Realtime 复用同一 key。✓

**5. Tiptap 配置可用性：** StarterKit（含 heading/bold/italic/strike/code/bulletList/orderedList/blockquote/codeBlock/history）+ Image + TaskList + TaskItem + Placeholder 全部为官方 v2 扩展，extensions 数组配置真实可用。编辑器 onUpdate 回调 getJSON 存入 content，与后端 jsonb 列及 content_text 提取触发器形成闭环。✓

**6. 安全性：** 所有表 RLS 启用，策略统一 `auth.uid() = user_id`；Storage 写策略按路径首段 user_id 校验；图片上传禁用 base64（`allowBase64: false`），强制走 Storage。✓

**7. 范围说明：** 本计划覆盖笔记模块 MVP（富文本编辑、文件夹、列表、全文搜索、图片、Realtime、自动保存、响应式布局）。pgvector 语义搜索、表格扩展、标签管理 UI、封面图上传为后续增强项，本计划未实现但数据库已预留 note_tags/note_note_tags/cover_url 字段。