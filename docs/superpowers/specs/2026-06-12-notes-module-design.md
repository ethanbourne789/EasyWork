---
title: 笔记模块设计
description: EasyWork · app-notes — 三栏 Markdown 知识库，含搜索/标签/专注模式/导出
date: 2026-06-12
tags:
  - EasyWork
  - notes
  - design
  - tauri
  - react
  - codemirror
status: approved
---

# 笔记模块设计（EasyWork · app-notes）

> [!info] 一句话定位
> **Markdown 知识库**：CodeMirror 6 源码 + 实时预览，三栏布局（文件夹 / 笔记列表 / 编辑器），全文搜索、固定笔记、专注模式、PDF/MD/HTML 导出，支持整库 .md 文件夹导入/导出。
>
> 适配 **Windows 桌面 + Android 手机** 双端响应式布局。

---

## 一、目标与非目标

### 1.1 目标（v1）
- "打开就能写"：进入笔记页 = 看到笔记列表 + 上次编辑的笔记继续可改
- Markdown 原生：内容以 `.md` 文本存储，所见即所得 + 实时预览并排
- 信息组织：文件夹（支持嵌套）+ 标签（多对多）+ 固定置顶
- 快速检索：顶部搜索框 + SQLite FTS5 全文搜索（按相关度排序）
- 专注模式：顶栏按钮隐藏左右栏，编辑区全宽
- 数据迁移：单条导出 MD/HTML/PDF；整库导出/导入 .md 文件夹
- 图片支持：粘贴/拖拽/选择上传 → 资源存到 `appData/note-assets/`

### 1.2 非目标（v1 不做）
- 版本历史、快照、diff、回滚
- PDF 之外的附件（不提供通用文件管理）
- 协同编辑、分享、评论
- 命令面板、全局快捷键（v1 仅顶部"新建笔记"按钮）
- 双向链接（`[[wikilink]]`）
- 图谱视图、反向链接
- 加密、密码保护
- 跨设备云同步
- 数学公式（KaTeX/MathJax）渲染
- 待办复选框内嵌的看板集成（看板模块是独立的）

---

## 二、决策摘要

| 维度 | 决策 | 理由 |
|------|------|------|
| 范围 | 标准版（编辑+组织+搜索+预览+专注+导出） | 11 项特性里剔除版本历史/通用附件/命令面板/双向链接 |
| 编辑器 | CodeMirror 6（`@codemirror/lang-markdown`） | Markdown 原生，所见即所得最自然；与 Tiptap 解耦 |
| 内容存储 | SQLite `notes.content` 存 Markdown 文本 | 单源、事务、FTS5 简单 |
| 图片 | appData `note-assets/{noteId}/{uuid}.{ext}` + Markdown 相对路径 | DB 不胖、备份连带、可移植 |
| 全文搜索 | SQLite FTS5 虚表 + 触发器同步 | 比 LIKE 快 1-2 个数量级 |
| 标签 | `notes.tags` 存为 JSON 数组（TEXT） | v1 简单方案；后续可拆 `note_tags` 表 |
| 文件夹 | `note_folders` 已有 `parent_id`；UI 渲染为可折叠树 | 不改 schema，仅前端树形化 |
| 导出 | 客户端实现：MD 直出 / HTML 用 markdown-it / PDF 用 html2pdf.js | 后端只负责读数据库，省 IPC |
| 导入 | Tauri Command 读目录 + 解析 frontmatter | 一次提交一批 |
| 自动保存 | 编辑停止 1.5s 后触发 | 业界标准 |
| 快捷键 | **v1 不做全局快捷键**，仅 UI 按钮 | YAGNI；用户反馈后再加 |
| 响应式 | 桌面三栏 / 移动单栏逐步切换 | 与全站规范一致 |

---

## 三、数据模型

### 3.1 改造 `notes` 表（V5 迁移）

```sql
-- V5__notes_module.sql
ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_notes_pinned_updated
    ON notes(pinned DESC, updated_at DESC);
```

> `content` 字段保持 TEXT 不变（类型不变），只是写入值从 HTML 改为 Markdown 文本。

### 3.2 新表 `note_assets`（图片资源）

```sql
CREATE TABLE IF NOT EXISTS note_assets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER NOT NULL,
    rel_path   TEXT    NOT NULL,        -- 相对路径，如 "assets/abc123.png"
    abs_path   TEXT    NOT NULL,        -- 绝对路径，前端不直接用
    mime       TEXT    NOT NULL,        -- "image/png" 等
    size       INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_note_assets_note_id ON note_assets(note_id);
```

### 3.3 新虚表 `notes_fts`（全文搜索）

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    content,
    tags,
    content='notes',
    content_rowid='id',
    tokenize='unicode61'
);

-- 同步触发器
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content, tags)
    VALUES (new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
    VALUES ('delete', old.id, old.title, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
    VALUES ('delete', old.id, old.title, old.content, old.tags);
    INSERT INTO notes_fts(rowid, title, content, tags)
    VALUES (new.id, new.title, new.content, new.tags);
END;
```

### 3.4 `shared/src/types/note.ts` 扩展

```ts
export interface Note {
  id: number;
  title: string;
  /** Markdown 文本 */
  content: string;
  folderId: number;
  tags: string[];
  pinned: boolean;
  wordCount: number;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

export interface NoteFolder {
  id: number;
  name: string;
  parentId: number | null;
  noteCount: number;
  children?: NoteFolder[];   // 仅前端树形化时使用
}

export interface NoteAsset {
  id: number;
  noteId: number;
  relPath: string;          // 写入 Markdown 时用
  mime: string;
  size: number;
  createdAt: DateTimeString;
}
```

---

## 四、Tauri Commands

文件：`src-tauri/src/commands/note.rs` 扩展；按需拆 `note_asset.rs` 与 `note_export.rs`。

### 4.1 笔记 CRUD（替换现有）

| 命令 | 入参 | 出参 | 说明 |
|------|------|------|------|
| `note_list` | `folderId?, tag?, includeChildren?` | `Note[]` | 按 `pinned DESC, updated_at DESC` 排序 |
| `note_get` | `id` | `Note` | |
| `note_save` | `id?, title, content, folderId, tags?` | `Note` | 自动算 `word_count`（按中文/英文混合字符数） |
| `note_delete` | `id` | `boolean` | 级联删除 `note_assets` 记录与文件 |
| `note_toggle_pin` | `id` | `Note` | 翻转 `pinned` |
| `note_search` | `query, limit?` | `Note[]` | FTS5 MATCH，按 bm25 排序 |

### 4.2 文件夹（替换现有）

| 命令 | 入参 | 出参 | 说明 |
|------|------|------|------|
| `note_folder_list` | — | `NoteFolder[]` | 返回扁平数组，前端组树 |
| `note_folder_save` | `id?, name, parentId?` | `NoteFolder` | 重命名 / 新建 |
| `note_folder_delete` | `id, fallbackFolderId` | `boolean` | 把该文件夹及其子文件夹的笔记 `folder_id` 改为 fallback；级联删除空文件夹 |

### 4.3 图片资源

| 命令 | 入参 | 出参 | 说明 |
|------|------|------|------|
| `note_asset_save` | `noteId, fileName, dataUrl` | `NoteAsset` | 解码 base64 → 写文件到 `appData/note-assets/{noteId}/{uuid}{ext}` → 入库 |
| `note_asset_delete` | `id` | `boolean` | 删文件 + 记录 |

### 4.4 导入/导出

| 命令 | 入参 | 出参 | 说明 |
|------|------|------|------|
| `note_export_md` | `id` | `string`（内容） | 纯 Markdown 字符串 |
| `note_export_html` | `id` | `string` | 用 markdown-it 渲染的 HTML（含内联 CSS） |
| `note_export_folder` | `folderId?, savePath` | `{count, path}` | Rust 端在指定路径创建目录、写每个 `.md` + `assets/` 子目录 |
| `note_import_folder` | `folderId, srcPath` | `{imported, skipped, errors[]}` | Rust 端递归读 `.md`、解析 frontmatter（`title:` `tags:` `created:`） |

> **PDF 导出由前端完成**（`lib/exportPdf.ts` 调用 html2pdf.js），不经过 Tauri Command。MD/HTML 也是前端组装好后下载，无需 IPC——前端能直接拿到当前编辑的 Markdown 文本与 CodeMirror 内容。

### 4.5 公共说明

- `note_list` 的 `includeChildren` 参数默认为 `true`（即选中某文件夹时包含子文件夹下的笔记）。预览搜索结果时强制为 `false`。
- `word_count` 计算规则：英文字符按单词数（`\w+` 计数），中文字符按 1 字 1 计。算法 **Rust 与 TypeScript 各实现一份**（位于 `src-tauri/src/note/word_count.rs` 与 `apps/app-notes/src/lib/countWords.ts`），保持一致；后端在 `note_save` 中重新计算并存入。前端只读不写。
- 文件夹树构建：Rust 端只返回扁平 `NoteFolder[]`，前端在 `useFolderTree` hook 中递归组装为树。

---

## 五、前端组件结构

```
app-notes/src/
├── App.tsx                          # qiankun 入口
├── main.tsx                         # 独立运行入口
├── components/
│   ├── NoteShell.tsx                # 三栏容器；管理 activeNoteId / activeFolderId 状态
│   ├── FolderTree.tsx               # 递归渲染 note_folders
│   ├── FolderItem.tsx               # 单个文件夹行（hover 显示 +/右键菜单）
│   ├── FolderMenu.tsx               # 右键菜单（新建/重命名/删除）
│   ├── NoteList.tsx                 # 中间栏容器：搜索框 + 排序下拉 + 列表
│   ├── NoteListItem.tsx             # 紧凑单行（标题+标签+时间+📌）
│   ├── NoteListToolbar.tsx          # 搜索框 + 排序 + 视图切换（紧凑/卡片预留位）
│   ├── EditorPane.tsx               # 右栏容器：标题 + 工具栏 + CodeMirror + 预览
│   ├── EditorToolbar.tsx            # Markdown 格式化按钮
│   ├── CodeMirrorEditor.tsx         # 封装 CodeMirror 6 实例；防抖 1.5s 触发 onSave
│   ├── MarkdownPreview.tsx          # markdown-it 渲染（含安全 sanitization）
│   ├── FocusModeToggle.tsx          # 顶栏右上角按钮
│   ├── ExportMenu.tsx               # 导出为 MD/HTML/PDF
│   ├── ImportDialog.tsx             # 选择文件夹、预览列表、确认
│   ├── AssetPicker.tsx              # 图片插入：上传/粘贴/拖拽
│   ├── ConfirmDialog.tsx            # 复用 shared 组件
│   └── EmptyState.tsx               # 空态：未选中/无笔记/搜索无果
├── hooks/
│   ├── useNotes.ts                  # React Query 包装 invoke
│   ├── useDebouncedSave.ts          # 防抖保存
│   ├── useFolderTree.ts             # 扁平数组 → 树形
│   └── useFocusMode.ts              # 专注模式开关（写入 zustand）
├── stores/
│   └── notesStore.ts                # zustand: activeFolderId, activeNoteId, searchQuery, focusMode
└── lib/
    ├── markdown.ts                  # markdown-it 实例 + 配置
    ├── exportPdf.ts                 # html2pdf.js 封装
    ├── exportHtml.ts                # 内联 CSS 模板
    └── countWords.ts                # 中英文混合字符数
```

### 5.1 CodeMirror 6 选型

```json
// app-notes/package.json 依赖
{
  "@codemirror/state": "^6",
  "@codemirror/view": "^6",
  "@codemirror/commands": "^6",
  "@codemirror/lang-markdown": "^6",
  "@codemirror/language": "^6",
  "@codemirror/search": "^6",
  "@codemirror/theme-one-dark": "^6",
  "markdown-it": "^14",
  "dompurify": "^3",
  "html2pdf.js": "^0.10"
}
```

### 5.2 状态管理（zustand）

```ts
interface NotesStore {
  activeFolderId: number | null;     // null = 全部
  activeTag: string | null;
  activeNoteId: number | null;
  searchQuery: string;
  sortBy: 'updated' | 'created' | 'title';
  focusMode: boolean;
  setActiveFolder: (id: number | null) => void;
  setActiveTag: (tag: string | null) => void;
  setActiveNote: (id: number | null) => void;
  setSearchQuery: (q: string) => void;
  setSortBy: (s: NotesStore['sortBy']) => void;
  toggleFocusMode: () => void;
}
```

---

## 六、关键交互流程

### 6.1 启动到首屏
1. `App.tsx` mount → `note_folder_list` 拉文件夹
2. 默认 `activeFolderId = null`（全部）+ 拉 `note_list`
3. 若有上次编辑的 `activeNoteId`（localStorage 记忆）→ 自动恢复
4. 三栏同时渲染：FolderTree 折叠展开状态从 localStorage 恢复

### 6.2 新建笔记
1. 顶部"新建笔记"按钮（或 FolderItem 的 + 按钮）
2. 立刻 `note_save(id: undefined, title: '未命名笔记', content: '', folderId: current)` → 拿到新 id
3. 切换 `activeNoteId` 为新 id → 进入编辑
4. 用户开始打字 → 触发防抖保存

### 6.3 编辑与自动保存
1. CodeMirror `onChange` → 设置本地 dirty 状态
2. 启动 1.5s 防抖计时器
3. 计时器到 → `note_save` → 顶部"已保存 · hh:mm"提示
4. 失败 → "保存失败 · 重试" + 红色提示

### 6.4 搜索
1. 顶部搜索框输入 → 防抖 300ms
2. `note_search(query)` → 列表切换为搜索结果模式（带命中片段高亮，可选 v2）
3. 清空搜索 → 回到当前文件夹视图

### 6.5 专注模式
1. 顶栏按钮（笔记本图标） → `toggleFocusMode()` → zustand 更新
2. `NoteShell` 监听 → 隐藏 FolderTree + NoteList
3. EditorPane 全宽；顶部显示"退出专注模式"按钮
4. 移动端也用同一开关

### 6.6 图片插入
1. 用户拖入编辑器 / 粘贴 / 点击工具栏图片按钮
2. `AssetPicker` 拦截 → 调 `note_asset_save(noteId, fileName, dataUrl)` → 拿到 `relPath`
3. 插入 Markdown 文本 `![](relPath)` 到光标位置
4. 预览面板同步刷新

### 6.7 笔记删除
1. NoteListItem 的"..."菜单 → 删除
2. 确认对话框（含"该笔记有 N 张图片，将一并删除"提示）
3. `note_delete(id)` → Rust 端级联删除 assets 表 + 物理文件
4. 当前 `activeNoteId` 指向被删笔记 → 切换到下一条

### 6.8 整库导入/导出
- **导出**：`note_export_folder(folderId?, path)` → Rust 在用户选择的目录创建结构：
  ```
  笔记库-2026-06-12/
  ├── 技术/
  │   ├── Tauri 学习笔记.md
  │   └── React 性能优化.md
  │   └── assets/
  │       └── xxx.png
  └── 投资/
      └── 2026 投资策略.md
  ```
  `tags:` 写进 frontmatter；`createdAt`/`updatedAt` 也写进 frontmatter。
- **导入**：`note_import_folder(folderId, srcPath)` → Rust 递归读 `.md`：
  - 文件名 = 标题（除非 frontmatter 有 `title:`）
  - 父目录 = 文件夹（保留嵌套）
  - 冲突文件名 → 返回 `skipped` 列表
  - 前端弹"已导入 X / 跳过 Y / 错误 Z"汇总

---

## 七、UI 布局规范

### 7.1 三栏比例
| 屏幕宽度 | 文件夹 : 列表 : 编辑器 | 编辑器内部分栏 |
|----------|----------------------|---------------|
| ≥1280px | 25% : 28% : 47% | 50% : 50% |
| 1024–1279px | 22% : 28% : 50% | 50% : 50% |
| 768–1023px | 0 : 35% : 65%（FolderTree 收为顶部下拉） | 50% : 50% |
| <768px（手机） | 单栏切换：文件夹 → 列表 → 编辑器 | Tab 切换（源码/预览） |

### 7.2 关键样式
- 顶栏高度 56px；包含：面包屑（文件夹路径）+ 搜索框 + 排序 + 专注模式按钮 + 导入/导出
- FolderTree 项：左 icon + 名称（hover 显 +/...），active 高亮，drag to drop 父文件夹（**v1 不做**，YAGNI）
- NoteListItem：`📌 标题  #tag1 #tag2   2h ago` 一行高度 36px
- EditorPane：标题 input 32px 大字 + 工具栏 40px + CodeMirror 自适应 + 预览
- 专注模式：仅保留 EditorPane + 右上角"退出"按钮

### 7.3 响应式断点
- 用 Tailwind 的 `lg:` `md:` 前缀控制
- 移动端：顶栏变两行（搜索 + 操作），编辑页全宽

---

## 八、错误处理

| 场景 | 表现 | 恢复 |
|------|------|------|
| 图片保存失败 | 编辑器内显示占位图（红框 + 错误图标）+ 顶部提示 | 用户重试或手动重传 |
| 自动保存失败 | 顶部红色横幅"保存失败 · 重试"按钮 | 按钮调 `note_save` |
| 笔记被外部删除（极少） | 切到下一条 + 顶部提示"该笔记已不存在" | 自动 |
| 文件夹非空删除 | 弹"笔记去向"对话框：默认文件夹 / 级联删除 | 必选其一 |
| 导入 .md 冲突 | "重命名 / 覆盖 / 跳过"三选一对话框 | 用户决定 |
| FTS 搜索语法错误 | 前端 escape 后再传给 SQLite；后端捕获 `SqliteError` | 降级为 `LIKE` 查询 |
| Markdown 渲染异常 | DOMPurify sanitization + try/catch | 显示原始文本 |

---

## 九、测试要点

### 9.1 后端（Rust 单元测试）
- `note_save` 触发 FTS 同步
- `note_delete` 级联删除图片
- `note_folder_delete` 把子文件夹笔记移到 fallback
- `note_import_folder` 解析 frontmatter、跳过冲突
- `note_export_folder` 生成正确目录结构

### 9.2 前端
- **Playwright E2E**：
  - 新建 → 编辑 → 自动保存 → 刷新页面内容仍在
  - 图片拖入 → Markdown 引用正确
  - 导出 PDF 文件可打开
  - 专注模式开关
  - 移动端单栏切换
- **组件测试**（Vitest）：
  - FolderTree 递归渲染
  - useDebouncedSave 节流逻辑
  - markdown-it + DOMPurify 安全渲染

### 9.3 手动验收
- 1000 条笔记的列表滚动性能
- 10MB 单条笔记的编辑器响应
- 导入导出大文件夹（100+ 文件）耗时
- 离线 / 网络断开下所有功能正常

---

## 十、风险与缓解

| 风险 | 缓解 |
|------|------|
| CodeMirror 6 与 Tauri WebView 兼容（移动 WebView 较弱） | v1 在桌面优先；移动端 v1 仅做基础编辑（不做语法高亮/补全） |
| FTS5 中文分词不准 | `unicode61` tokenize 对中文按字符切，能搜；接受 v1 不做词级匹配 |
| markdown-it 性能（10MB 笔记） | 预览面板 debounce 200ms；超长文档分页（v2 考虑） |
| 图片资源占用失控 | v1 不做配额；导出时附带 `assets/` 完整迁移 |
| 自动保存抖动（频繁 1.5s 内连续保存） | 已有防抖；额外加 30s 内不重复保存同内容（hash 比对） |

---

## 十一、参考与依赖

- CodeMirror 6 官方文档：<https://codemirror.net/docs/>
- markdown-it 中文使用：<https://github.com/markdown-it/markdown-it>
- SQLite FTS5：<https://www.sqlite.org/fts5.html>
- DOMPurify 安全策略：<https://github.com/cure53/DOMPurify>
- html2pdf.js：<https://github.com/eKoopmans/html2pdf.js>
- 项目内参考：邮箱模块 `RichTextEditor`（Tiptap 实现，但本模块不复用）
