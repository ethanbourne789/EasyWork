# 联系人分组管理 + 邮件正文联系人交互 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在邮箱模块中实现联系人分组管理 UI（左侧分组栏）和邮件正文中发件人/收件人姓名的可点击交互（弹出操作菜单）。

**Architecture:** 采用组件拆分方案，新增 3 个独立组件文件（`ContactGroupSidebar`、`ContactActionMenu`、`RecipientList`），修改 `email.tsx` 和 `mail-store.ts` 以集成这些组件。后端无需改动。

**Tech Stack:** React 19, TypeScript 5.x, Zustand, MUI icons (lucide-react), Tailwind CSS

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/components/ContactGroupSidebar.tsx` | 新增 | 联系人弹窗左侧分组栏，分组增删改查 + 按分组筛选 |
| `src/components/ContactActionMenu.tsx` | 新增 | 点击联系人姓名弹出的操作菜单（添加/查看邮件/回复） |
| `src/components/RecipientList.tsx` | 新增 | 邮件详情页收件人/抄送行展示，每个地址为可点击 chip |
| `src/routes/email.tsx` | 修改 | 邮件详情头部集成新组件、ContactsModal 重构为左右分栏、联系人筛选横幅 |
| `src/stores/mail-store.ts` | 修改 | 新增 `contactFilterEmail` / `contactFilterName` / `setContactFilter` 状态 |
| `src/locales/zh.json` | 修改 | 新增 i18n 文本 |
| `src/locales/en.json` | 修改 | 新增 i18n 文本 |

---

### Task 1: Zustand Store 新增联系人筛选状态

**Files:**
- Modify: `src/stores/mail-store.ts`

- [ ] **Step 1: 在 MailState interface 中添加联系人筛选状态**

在 `mail-store.ts` 的 `MailState` interface 中（约 L152，`removeContactGroup` 之后），添加：

```ts
// Contact mail filter (viewing messages with a specific contact)
contactFilterEmail: string | null
contactFilterName: string | null
setContactFilter: (email: string | null, name: string | null) => void
```

- [ ] **Step 2: 在 useMailStore create 中添加实现**

在 `removeContactGroup` 实现之后（约 L260），添加：

```ts
contactFilterEmail: null,
contactFilterName: null,
setContactFilter: (email, name) => set({ contactFilterEmail: email, contactFilterName: name }),
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: PASS（无新增错误）

- [ ] **Step 4: Commit**

```bash
git add src/stores/mail-store.ts
git commit -m "feat(mail): add contact filter state to mail store"
```

---

### Task 2: 收件人列表组件 (`RecipientList.tsx`)

**Files:**
- Create: `src/components/RecipientList.tsx`

- [ ] **Step 1: 创建 RecipientList 组件**

```tsx
import { Mail } from "lucide-react"

interface RecipientListProps {
  to_list: string  // JSON array string, e.g. '["a@x.com","b@x.com"]'
  cc_list: string  // JSON array string
  onContactClick: (name: string, email: string, event: React.MouseEvent) => void
}

interface ParsedAddress {
  name: string
  email: string
}

function parseJsonAddressList(raw: string): ParsedAddress[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map((item: string) => {
      // Handle "Name <email>" format
      const match = item.match(/^(.+?)\s*<(.+?)>$/)
      if (match) return { name: match[1].trim(), email: match[2].trim() }
      return { name: "", email: String(item).trim() }
    }).filter(a => a.email)
  } catch {
    return []
  }
}

function AddressChip({ name, email, onClick }: { name: string; email: string; onClick: (e: React.MouseEvent) => void }) {
  const display = name || email
  const initial = display.charAt(0).toUpperCase() || "?"
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-xs
        border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800
        text-surface-700 dark:text-surface-300 hover:bg-primary-50 dark:hover:bg-primary-900/20
        hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
      title={name ? `${name} <${email}>` : email}
    >
      <span className="shrink-0 w-4 h-4 rounded-full bg-primary-100 dark:bg-primary-900/40
        text-primary-700 dark:text-primary-300 text-[9px] font-bold flex items-center justify-center">
        {initial}
      </span>
      <span className="truncate max-w-[160px]">{display}</span>
    </button>
  )
}

export function RecipientList({ to_list, cc_list, onContactClick }: RecipientListProps) {
  const toAddresses = parseJsonAddressList(to_list)
  const ccAddresses = parseJsonAddressList(cc_list)

  if (toAddresses.length === 0 && ccAddresses.length === 0) return null

  return (
    <div className="mt-2 space-y-1.5">
      {toAddresses.length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-xs text-surface-400 dark:text-surface-500 shrink-0 mt-0.5 w-10">收件人</span>
          <div className="flex flex-wrap gap-1">
            {toAddresses.map((a, i) => (
              <AddressChip
                key={i}
                name={a.name}
                email={a.email}
                onClick={(e) => onContactClick(a.name, a.email, e)}
              />
            ))}
          </div>
        </div>
      )}
      {ccAddresses.length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-xs text-surface-400 dark:text-surface-500 shrink-0 mt-0.5 w-10">抄送</span>
          <div className="flex flex-wrap gap-1">
            {ccAddresses.map((a, i) => (
              <AddressChip
                key={i}
                name={a.name}
                email={a.email}
                onClick={(e) => onContactClick(a.name, a.email, e)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/RecipientList.tsx
git commit -m "feat(mail): add RecipientList component for to/cc display"
```

---

### Task 3: 联系人操作菜单 (`ContactActionMenu.tsx`)

**Files:**
- Create: `src/components/ContactActionMenu.tsx`

- [ ] **Step 1: 创建 ContactActionMenu 组件**

```tsx
import { useEffect, useRef } from "react"
import { UserPlus, Mail, Reply, X } from "lucide-react"
import { useTranslation } from "react-i18next"

interface ContactActionMenuProps {
  name: string
  email: string
  position: { x: number; y: number }
  onClose: () => void
  onAddToContacts: () => void
  onViewMessages: () => void
  onReply: () => void
}

export function ContactActionMenu({
  name,
  email,
  position,
  onClose,
  onAddToContacts,
  onViewMessages,
  onReply,
}: ContactActionMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  // Calculate position to avoid overflow
  const menuWidth = 200
  const menuHeight = 140
  const x = Math.min(position.x, window.innerWidth - menuWidth - 8)
  const y = Math.min(position.y, window.innerHeight - menuHeight - 8)

  const display = name ? `${name} <${email}>` : email

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] w-[200px] bg-white dark:bg-surface-800 rounded-xl shadow-xl border border-surface-200 dark:border-surface-700 py-1"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-2 border-b border-surface-100 dark:border-surface-700">
        <p className="text-xs font-medium text-surface-700 dark:text-surface-200 truncate">{display}</p>
      </div>
      <button
        onClick={() => { onAddToContacts(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
      >
        <UserPlus size={14} className="text-surface-400" />
        {t("contacts.actions.addToContacts") || "添加到通讯录"}
      </button>
      <button
        onClick={() => { onViewMessages(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
      >
        <Mail size={14} className="text-surface-400" />
        {t("contacts.actions.viewMessages") || "查看往来邮件"}
      </button>
      <button
        onClick={() => { onReply(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
      >
        <Reply size={14} className="text-surface-400" />
        {t("mail.reply") || "回复"}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ContactActionMenu.tsx
git commit -m "feat(mail): add ContactActionMenu popup component"
```

---

### Task 4: 联系人分组侧边栏 (`ContactGroupSidebar.tsx`)

**Files:**
- Create: `src/components/ContactGroupSidebar.tsx`

- [ ] **Step 1: 创建 ContactGroupSidebar 组件**

```tsx
import { useState } from "react"
import { Plus, Pencil, Trash2, X, Check } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useMailStore, type MailContactGroup } from "@/stores/mail-store"
import * as mailIpc from "@/lib/mail-ipc"

interface ContactGroupSidebarProps {
  selectedGroupId: number | null  // null = all, 0 = ungrouped
  onSelectGroup: (id: number | null) => void
  groupCounts: Record<number, number>  // group_id -> contact count
  totalCount: number
  onGroupsChanged: () => void
}

export function ContactGroupSidebar({
  selectedGroupId,
  onSelectGroup,
  groupCounts,
  totalCount,
  onGroupsChanged,
}: ContactGroupSidebarProps) {
  const { t } = useTranslation()
  const { contactGroups, activeAccountId } = useMailStore()
  const [showAddInput, setShowAddInput] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")

  const handleAddGroup = async () => {
    if (!newGroupName.trim() || !activeAccountId) return
    try {
      await mailIpc.addContactGroup({
        account_id: activeAccountId,
        name: newGroupName.trim(),
        color: "#6366f1",
        sort_order: contactGroups.length,
      })
      setNewGroupName("")
      setShowAddInput(false)
      onGroupsChanged()
    } catch {}
  }

  const handleDeleteGroup = async (id: number) => {
    try {
      await mailIpc.deleteContactGroup(id)
      if (selectedGroupId === id) onSelectGroup(null)
      onGroupsChanged()
    } catch {}
  }

  const startEdit = (group: MailContactGroup) => {
    setEditingId(group.id ?? null)
    setEditName(group.name)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return
    const group = contactGroups.find(g => g.id === editingId)
    if (!group) return
    try {
      await mailIpc.updateContactGroup({ ...group, name: editName.trim() })
      setEditingId(null)
      setEditName("")
      onGroupsChanged()
    } catch {}
  }

  return (
    <div className="w-[180px] shrink-0 border-r border-surface-200 dark:border-surface-700 flex flex-col h-full">
      <div className="p-2 space-y-0.5 overflow-y-auto flex-1">
        {/* All contacts */}
        <button
          onClick={() => onSelectGroup(null)}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
            selectedGroupId === null
              ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium"
              : "text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-surface-300 dark:bg-surface-600" />
          <span className="truncate flex-1 text-left">全部</span>
          <span className="text-[10px] text-surface-400">{totalCount}</span>
        </button>

        {/* Ungrouped */}
        {groupCounts[0] > 0 && (
          <button
            onClick={() => onSelectGroup(0)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
              selectedGroupId === 0
                ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium"
                : "text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-surface-200 dark:bg-surface-700 border border-dashed border-surface-400" />
            <span className="truncate flex-1 text-left">未分组</span>
            <span className="text-[10px] text-surface-400">{groupCounts[0]}</span>
          </button>
        )}

        {/* Groups */}
        {contactGroups.map(group => {
          const count = groupCounts[group.id ?? 0] ?? 0
          const isEditing = editingId === group.id
          return (
            <div
              key={group.id}
              className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                selectedGroupId === group.id
                  ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium"
                  : "text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800"
              }`}
            >
              {isEditing ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") setEditingId(null) }}
                    className="flex-1 min-w-0 h-5 px-1 text-xs border border-primary-300 rounded bg-white dark:bg-surface-900"
                    autoFocus
                  />
                  <button onClick={handleSaveEdit} className="text-primary-500 hover:text-primary-700"><Check size={12} /></button>
                  <button onClick={() => setEditingId(null)} className="text-surface-400 hover:text-surface-600"><X size={12} /></button>
                </div>
              ) : (
                <>
                  <button onClick={() => onSelectGroup(group.id ?? null)} className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                    <span className="truncate flex-1 text-left">{group.name}</span>
                    <span className="text-[10px] text-surface-400">{count}</span>
                  </button>
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button onClick={() => startEdit(group)} className="text-surface-400 hover:text-primary-500 p-0.5"><Pencil size={11} /></button>
                    <button onClick={() => group.id && handleDeleteGroup(group.id)} className="text-surface-400 hover:text-red-500 p-0.5"><Trash2 size={11} /></button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Add group button */}
      <div className="p-2 border-t border-surface-200 dark:border-surface-700">
        {showAddInput ? (
          <div className="flex items-center gap-1">
            <input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAddGroup(); if (e.key === "Escape") { setShowAddInput(false); setNewGroupName("") } }}
              placeholder="分组名称"
              className="flex-1 h-7 px-2 text-xs border border-primary-300 rounded-lg bg-white dark:bg-surface-900"
              autoFocus
            />
            <button onClick={handleAddGroup} className="text-primary-500 hover:text-primary-700 p-1"><Check size={14} /></button>
            <button onClick={() => { setShowAddInput(false); setNewGroupName("") }} className="text-surface-400 hover:text-surface-600 p-1"><X size={14} /></button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddInput(true)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-surface-500 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
          >
            <Plus size={14} />
            新建分组
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ContactGroupSidebar.tsx
git commit -m "feat(mail): add ContactGroupSidebar component"
```

---

### Task 5: 修改 `email.tsx` — 集成新组件

**Files:**
- Modify: `src/routes/email.tsx`

这是最大的改动，分多个子步骤。

#### 5a: 添加 import 语句

- [ ] **Step 1: 在 email.tsx 顶部添加新组件的 import**

在现有 import 区域（约 L27 之后）添加：

```ts
import { ContactGroupSidebar } from "@/components/ContactGroupSidebar"
import { ContactActionMenu } from "@/components/ContactActionMenu"
import { RecipientList } from "@/components/RecipientList"
```

同时在 lucide-react import 中添加 `UserPlus`：

```ts
// 在现有 lucide-react import 中添加 UserPlus
UserPlus,
```

#### 5b: 邮件详情头部 — 发件人可点击 + 收件人列表

- [ ] **Step 2: 添加联系人菜单状态**

在 `email.tsx` 的 `EmailPage` 组件内（约 L790 附近，`const { composeData, ... } = useMailStore()` 之后），添加状态：

```ts
// Contact action menu state
const [contactMenu, setContactMenu] = useState<{ name: string; email: string; x: number; y: number } | null>(null)
```

- [ ] **Step 3: 添加联系人操作处理函数**

在 `EmailPage` 组件内添加：

```ts
const handleContactActionAdd = useCallback(async (name: string, email: string) => {
  if (!activeAccountId) return
  try {
    const existing = await mailIpc.findContactByEmail(email, activeAccountId)
    if (existing) {
      setToast({ message: "该联系人已在通讯录中", type: "info" })
      return
    }
    await mailIpc.addContact({
      account_id: activeAccountId,
      name: name || email.split("@")[0],
      display_name: name || email.split("@")[0],
      email,
      phone: "",
      group_id: null,
      group_name: "",
      notes: "",
    })
    setToast({ message: `已添加 ${name || email} 到通讯录`, type: "success" })
  } catch {
    setToast({ message: "添加联系人失败", type: "error" })
  }
}, [activeAccountId])

const handleContactActionViewMessages = useCallback(async (email: string, name: string) => {
  try {
    const result = await mailIpc.searchMessagesByEmail(email, null, 50)
    setMessages(result.messages)
    setContactFilter(email, name)
    setSelectedMessageId(null)
    setMessageBody(null)
  } catch {
    setToast({ message: "搜索往来邮件失败", type: "error" })
  }
}, [])

const handleContactActionReply = useCallback((email: string, name: string, subject: string) => {
  openCompose({
    to: email,
    subject: `Re: ${subject.replace(/^(Re|回复|答复|Fwd|转发)[:：]\s*/i, "")}`,
    body: `\n\n---\n${name} <${email}> 写道:\n`,
    isReply: true,
  })
}, [openCompose])
```

需要从 store 解构 `setContactFilter`：

```ts
// 在 useMailStore() 解构中添加 setContactFilter
const { ..., setContactFilter } = useMailStore()
```

- [ ] **Step 4: 修改邮件详情头部**

找到邮件详情头部区域（约 L1850-1865），将发件人姓名从 `<p>` 改为可点击按钮，并添加 RecipientList。

将：
```tsx
<p className="font-medium text-sm">{selectedMessage.from_name || selectedMessage.from_email}</p>
<p className="text-xs text-surface-400 dark:text-surface-500 dark:text-surface-400">{selectedMessage.from_email}</p>
```

改为：
```tsx
<button
  onClick={(e) => setContactMenu({ name: selectedMessage.from_name, email: selectedMessage.from_email, x: e.clientX, y: e.clientY })}
  className="font-medium text-sm text-surface-700 dark:text-surface-200 hover:text-primary-600 dark:hover:text-primary-400 hover:underline transition-colors cursor-pointer"
>
  {selectedMessage.from_name || selectedMessage.from_email}
</button>
<p className="text-xs text-surface-400 dark:text-surface-500 dark:text-surface-400">{selectedMessage.from_email}</p>
<RecipientList
  to_list={messageBody?.cc_list ? "[]" : "[]"}
  cc_list={messageBody?.cc_list || "[]"}
  onContactClick={(name, email, e) => setContactMenu({ name, email, x: e.clientX, y: e.clientY })}
/>
```

注意：`to_list` 需要从 `getMessageHeaders` 获取。检查 `messageBody` 是否包含 `to_list`。如果不包含，需要在获取邮件正文时同时获取 headers。

实际上，`getMessageBody` 返回 `{ body_text, body_html, cc_list }`，而 `getMessageHeaders` 返回 `{ subject, from_name, from_email, to_list, message_id }`。需要在选中邮件时同时获取 headers。

查看现有代码中 `handleSelectMessage` 函数，确认是否已获取 headers。

- [ ] **Step 5: 确保选中邮件时获取 to_list**

在 `handleSelectMessage` 函数中，确认调用了 `getMessageHeaders` 并存储了 `to_list`。如果 `messageBody` 中没有 `to_list`，需要在 store 中添加或在组件中添加本地 state 存储 headers。

最简单的方案：在 `EmailPage` 组件中添加本地 state：

```ts
const [messageHeaders, setMessageHeaders] = useState<{ to_list: string; cc_list: string } | null>(null)
```

在 `handleSelectMessage` 中获取 headers 时同时设置：

```ts
// 在获取 body 之后
const headers = await mailIpc.getMessageHeaders(msgId)
setMessageHeaders({ to_list: headers.to_list, cc_list: headers.cc_list || "[]" })
```

然后在 `RecipientList` 中使用 `messageHeaders`：

```tsx
<RecipientList
  to_list={messageHeaders?.to_list || "[]"}
  cc_list={messageHeaders?.cc_list || "[]"}
  onContactClick={(name, email, e) => setContactMenu({ name, email, x: e.clientX, y: e.clientY })}
/>
```

- [ ] **Step 6: 添加 ContactActionMenu 渲染**

在 email.tsx 的 modals 区域（约 L1955-1959），添加：

```tsx
{contactMenu && (
  <ContactActionMenu
    name={contactMenu.name}
    email={contactMenu.email}
    position={{ x: contactMenu.x, y: contactMenu.y }}
    onClose={() => setContactMenu(null)}
    onAddToContacts={() => handleContactActionAdd(contactMenu.name, contactMenu.email)}
    onViewMessages={() => handleContactActionViewMessages(contactMenu.email, contactMenu.name)}
    onReply={() => handleContactActionReply(contactMenu.email, contactMenu.name, selectedMessage?.subject || "")}
  />
)}
```

#### 5c: ContactsModal 重构为左右分栏

- [ ] **Step 7: 重构 ContactsModal 为左右分栏布局**

将 `ContactsModal` 的弹窗容器从 480px 改为 640px，内部改为左右分栏。

找到 ContactsModal 的返回 JSX（约 L683），将弹窗容器改为：

```tsx
<div className="w-[640px] max-h-[80vh] overflow-hidden bg-white dark:bg-surface-900 rounded-2xl shadow-2xl flex" onClick={e => e.stopPropagation()}>
  {/* Left: Group sidebar */}
  <ContactGroupSidebar
    selectedGroupId={selectedGroupId}
    onSelectGroup={setSelectedGroupId}
    groupCounts={groupCounts}
    totalCount={contacts.length}
    onGroupsChanged={refreshGroupsAndContacts}
  />
  {/* Right: Contact list */}
  <div className="flex-1 flex flex-col overflow-hidden">
    {/* ... existing toolbar and contact list ... */}
  </div>
</div>
```

在 ContactsModal 组件内添加分组相关 state：

```ts
const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
const { contactGroups, setContactGroups } = useMailStore()

// Load groups
useEffect(() => {
  if (activeAccountId) {
    mailIpc.listContactGroups(activeAccountId).then(setContactGroups).catch(() => {})
  }
}, [activeAccountId, setContactGroups])

// Compute group counts
const groupCounts = useMemo(() => {
  const counts: Record<number, number> = {}
  contacts.forEach(c => {
    const gid = c.group_id ?? 0
    counts[gid] = (counts[gid] || 0) + 1
  })
  return counts
}, [contacts])

// Filter contacts by selected group
const filteredContacts = useMemo(() => {
  if (selectedGroupId === null) return contacts
  if (selectedGroupId === 0) return contacts.filter(c => !c.group_id)
  return contacts.filter(c => c.group_id === selectedGroupId)
}, [contacts, selectedGroupId])

const refreshGroupsAndContacts = useCallback(() => {
  if (!activeAccountId) return
  mailIpc.listContactGroups(activeAccountId).then(setContactGroups).catch(() => {})
  mailIpc.listContacts(activeAccountId).then(setContacts).catch(() => {})
}, [activeAccountId, setContactGroups, setContacts])
```

将联系人列表的 `.map` 从 `contacts` 改为 `filteredContacts`。

- [ ] **Step 8: 修改联系人表单中的分组选择为下拉框**

将分组输入框：
```tsx
<input type="text" placeholder={t("contacts.group")} value={form.group_name} onChange={...} />
```

改为下拉选择：
```tsx
<select
  value={form.group_id ?? ""}
  onChange={e => setForm(f => ({ ...f, group_id: e.target.value ? Number(e.target.value) : null, group_name: "" }))}
  className="w-full h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm bg-white dark:bg-surface-900"
>
  <option value="">未分组</option>
  {contactGroups.map(g => (
    <option key={g.id} value={g.id}>{g.name}</option>
  ))}
</select>
```

同时需要修改 `form` 的初始 state 和 `handleAdd`/`handleEdit` 以使用 `group_id`：

```ts
const [form, setForm] = useState({ name: "", email: "", phone: "", group_id: null as number | null, group_name: "", notes: "" })
```

在 `handleAdd` 中：
```ts
await mailIpc.addContact({ account_id: activeAccountId, name: form.name, display_name: form.name, email: form.email, phone: form.phone, group_id: form.group_id, group_name: "", notes: form.notes })
```

- [ ] **Step 9: 添加联系人筛选横幅**

在邮件列表区域顶部（约 L1755 附近），添加筛选横幅：

```tsx
{contactFilterEmail && (
  <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800">
    <Mail size={14} className="text-primary-500 dark:text-primary-400" />
    <span className="text-sm text-primary-700 dark:text-primary-300">
      与 {contactFilterName || contactFilterEmail} 的往来邮件 ({messages.length} 封)
    </span>
    <button
      onClick={() => { setContactFilter(null, null); handleLoadMessages() }}
      className="ml-auto text-xs text-primary-500 hover:text-primary-700 dark:hover:text-primary-300"
    >
      清除筛选
    </button>
  </div>
)}
```

- [ ] **Step 10: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: PASS（可能需要修复一些类型问题）

- [ ] **Step 11: Commit**

```bash
git add src/routes/email.tsx
git commit -m "feat(mail): integrate contact components into email view"
```

---

### Task 6: 国际化文本

**Files:**
- Modify: `src/locales/zh.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: 在 zh.json 中添加联系人相关文本**

在 `"contacts"` 对象中添加：

```json
"actions": {
  "addToContacts": "添加到通讯录",
  "viewMessages": "查看往来邮件",
  "replyTo": "回复"
},
"group": {
  "all": "全部",
  "ungrouped": "未分组",
  "newGroup": "新建分组",
  "groupName": "分组名称",
  "editGroup": "编辑分组",
  "deleteGroup": "删除分组"
},
"filter": {
  "contactMessages": "与 {{name}} 的往来邮件 ({{total}} 封)",
  "clearFilter": "清除筛选"
}
```

- [ ] **Step 2: 在 en.json 中添加对应英文文本**

```json
"actions": {
  "addToContacts": "Add to Contacts",
  "viewMessages": "View Messages",
  "replyTo": "Reply"
},
"group": {
  "all": "All",
  "ungrouped": "Ungrouped",
  "newGroup": "New Group",
  "groupName": "Group Name",
  "editGroup": "Edit Group",
  "deleteGroup": "Delete Group"
},
"filter": {
  "contactMessages": "Messages with {{name}} ({{total}})",
  "clearFilter": "Clear Filter"
}
```

- [ ] **Step 3: 验证 JSON 格式**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/zh.json','utf8')); console.log('zh OK')"`
Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); console.log('en OK')"`
Expected: Both print OK

- [ ] **Step 4: Commit**

```bash
git add src/locales/zh.json src/locales/en.json
git commit -m "feat(mail): add i18n texts for contact features"
```

---

### Task 7: 最终验证

- [ ] **Step 1: 完整 TypeScript 编译检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: 构建 Tauri 应用（no bundle）**

Run: `cd src-tauri && cargo build --release --no-default-features --features desktop-native-tls`
Expected: Build succeeds

- [ ] **Step 3: 功能验证清单**

手动测试以下功能：
1. 打开联系人弹窗 → 左侧显示分组栏
2. 点击「新建分组」→ 输入名称 → 分组出现
3. 点击分组 → 右侧联系人列表筛选
4. 编辑分组名称 → 保存成功
5. 删除分组 → 联系人变为未分组
6. 新建联系人 → 分组选择为下拉框
7. 打开邮件详情 → 发件人姓名可点击
8. 点击发件人 → 弹出操作菜单
9. 点击「添加到通讯录」→ 成功添加
10. 点击「查看往来邮件」→ 列表显示筛选结果 + 横幅
11. 点击「清除筛选」→ 恢复普通列表
12. 收件人/抄送行正确显示，姓名可点击

---

## 自审

**Spec 覆盖检查：**
- [x] 联系人分组管理 UI → Task 4 + Task 5c
- [x] 邮件正文联系人交互 → Task 3 + Task 5b
- [x] 收件人列表展示 → Task 2 + Task 5b
- [x] 组件拆分方案 → 3 个独立组件文件
- [x] Zustand store 状态 → Task 1
- [x] i18n 文本 → Task 6

**占位符检查：** 无 TBD/TODO

**类型一致性检查：**
- `MailContactGroup` 类型在 `mail-store.ts` 和 `ContactGroupSidebar.tsx` 中一致
- `ContactActionMenuProps` 的回调签名与 `email.tsx` 中的处理函数匹配
- `RecipientListProps` 的 `onContactClick` 签名与使用处一致
