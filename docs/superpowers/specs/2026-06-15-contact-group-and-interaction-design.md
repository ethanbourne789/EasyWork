# 邮箱模块：联系人分组管理 + 邮件正文联系人交互

**日期：** 2026-06-15
**状态：** 待实施

## 背景

当前邮箱模块的联系人管理存在两个问题：
1. 后端已实现完整的联系人分组表（`mail_contact_groups`）和 IPC 接口，但前端完全没有分组管理 UI
2. 邮件正文中的发件人/收件人姓名是纯文本，无法交互（不能快速添加到通讯录或查看往来邮件）

## 需求

1. **联系人分组管理 UI** — 在联系人弹窗中实现左侧分组栏，支持分组的增删改查和按分组筛选联系人
2. **邮件正文联系人交互** — 发件人/收件人姓名可点击，弹出操作菜单（添加到通讯录 / 查看往来邮件 / 回复）
3. **收件人列表展示** — 邮件详情页展示收件人（To）和抄送（Cc）行，所有姓名均可点击

## 方案选择

采用**组件拆分方案（方案 A）**，将新功能拆分为独立组件文件，避免 `email.tsx`（已近 2000 行）继续膨胀。

## 设计

### 1. 联系人分组侧边栏 (`ContactGroupSidebar.tsx`)

**位置：** `src/components/ContactGroupSidebar.tsx`

**布局：** `ContactsModal` 弹窗从 480px 扩展到 640px，左右分栏：
- 左侧分组栏：固定 180px
- 右侧联系人列表：自适应

**左侧分组栏功能：**
- 顶部「全部联系人」项（始终显示，显示全部联系人数量）
- 下方列出所有分组（从 `listContactGroups` 加载），每项显示：
  - 颜色圆点（`group.color`）
  - 分组名称
  - 联系人数量（按 `group_id` 统计）
- 点击分组 → 右侧列表筛选为该分组的联系人
- 底部「+ 新建分组」按钮 → 弹出输入框，输入分组名后调用 `addContactGroup`
- 分组项 hover 显示编辑（重命名+改色）和删除图标
- 删除分组 → 调用 `deleteContactGroup`，该分组下联系人 `group_id` 设为 NULL

**右侧联系人列表改动：**
- 根据选中分组 ID 筛选（`null` = 全部，`0` = 未分组，其他 = 特定分组）
- 新增/编辑联系人表单中，分组选择从文本输入改为下拉选择（选项来自分组列表 + 「未分组」）

**数据流：**
- Zustand store 新增 `contactGroups: MailContactGroup[]` 和 `setContactGroups`
- `ContactsModal` 的 `useEffect` 中并行加载 `listContacts` 和 `listContactGroups`
- 选中分组 ID 保存在 `ContactsModal` 组件本地 state

### 2. 联系人操作菜单 (`ContactActionMenu.tsx`)

**位置：** `src/components/ContactActionMenu.tsx`

**触发：** 点击邮件详情页中的发件人/收件人姓名时弹出。

**Props：**
```ts
interface ContactActionMenuProps {
  name: string
  email: string
  position: { x: number; y: number }
  onClose: () => void
  onAddToContacts?: () => void
  onViewMessages?: () => void
  onReply?: () => void
}
```

**菜单选项：**
1. **添加到通讯录** — 调用 `findContactByEmail` 检查是否已存在，不存在则调用 `addContact`，已存在则 toast 提示
2. **查看往来邮件** — 调用 `searchMessagesByEmail(email)`，将结果设置到 store 并显示筛选横幅
3. **回复** — 调用现有的 `openCompose` 回复该联系人

**样式：**
- `position: fixed` 浮层，根据点击位置计算弹出方向（避免超出屏幕边界）
- 点击菜单外部或按 ESC 关闭
- 菜单项带图标：`UserPlus`（添加）、`Mail`（往来邮件）、`Reply`（回复）

### 3. 收件人列表展示 (`RecipientList.tsx`)

**位置：** `src/components/RecipientList.tsx`

**Props：**
```ts
interface RecipientListProps {
  to_list: string  // JSON 数组字符串
  cc_list: string  // JSON 数组字符串
  onContactClick: (name: string, email: string, event: React.MouseEvent) => void
}
```

**功能：**
- 解析 `to_list` / `cc_list`（JSON 数组字符串，如 `["a@x.com","b@x.com"]`）
- 渲染「收件人」和「抄送」两行
- 每个地址渲染为可点击的 chip（头像首字母 + 邮箱，样式与 `RecipientChip` 一致）
- 点击 chip → 触发 `onContactClick` 回调
- 如果解析失败或为空，不显示该行

### 4. `email.tsx` 改动（最小化）

**邮件详情头部（约 L1850-1865）：**
- 发件人姓名从 `<p>` 改为 `<button>`，带 hover 下划线样式，点击触发 `ContactActionMenu`
- 发件人下方新增 `<RecipientList>` 组件

**`ContactsModal` 重构：**
- 弹窗宽度 480px → 640px
- 内部改为左右分栏布局
- 引用 `ContactGroupSidebar` 组件

**Zustand store 新增状态：**
```ts
// mail-store.ts
contactGroups: MailContactGroup[]
setContactGroups: (groups: MailContactGroup[]) => void
contactFilterEmail: string | null  // 联系人邮件筛选
contactFilterName: string | null
setContactFilter: (email: string | null, name: string | null) => void
```

**联系人邮件筛选横幅：**
- 当 `contactFilterEmail` 非空时，邮件列表顶部显示「与 {name} 的往来邮件 ({total} 封)」横幅 + 「清除筛选」按钮
- 清除后恢复普通列表视图

### 5. 后端改动

**无需改动。** 所有需要的 IPC 接口已存在：
- `addContact` / `findContactByEmail` / `searchMessagesByEmail`
- `listContactGroups` / `addContactGroup` / `updateContactGroup` / `deleteContactGroup`
- `listContacts` / `updateContact`

## 新增文件

1. `src/components/ContactGroupSidebar.tsx` — 分组侧边栏
2. `src/components/ContactActionMenu.tsx` — 联系人操作菜单
3. `src/components/RecipientList.tsx` — 收件人列表展示

## 修改文件

1. `src/routes/email.tsx` — 邮件详情头部、ContactsModal 重构、联系人筛选横幅
2. `src/stores/mail-store.ts` — 新增 contactGroups / contactFilter 状态
3. `src/locales/zh.json` / `src/locales/en.json` — 新增 i18n 文本

## 验收标准

- [ ] 联系人弹窗左侧显示分组列表，点击可筛选联系人
- [ ] 可以新建、重命名、删除分组
- [ ] 新建/编辑联系人时分组选择为下拉框
- [ ] 邮件详情页发件人姓名可点击，弹出操作菜单
- [ ] 操作菜单包含「添加到通讯录」「查看往来邮件」「回复」
- [ ] 邮件详情页显示收件人和抄送行，姓名均可点击
- [ ] 查看往来邮件后列表顶部显示筛选横幅，可清除
