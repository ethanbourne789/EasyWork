# UI Optimization Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring all non-finance modules (Dashboard, Tasks, Mail, Notes, Calendar, Settings) to full design system compliance, remove duplicate action buttons, and optimize responsive layouts across 5 screen sizes.

**Architecture:** Pure UI layer changes. Each task modifies component JSX and CSS classes only. No data layer, no API, no new dependencies. Tasks are independent and can be executed in any order.

**Tech Stack:** React 19, Tailwind v4 (CSS-first), shadcn/ui, lucide-react, OKLCH color tokens via CSS variables

---

## File Structure

### Files to Modify
| File | Changes |
|------|---------|
| `src/index.css` | Add `prefers-reduced-motion` media query |
| `src/components/layout/ModuleFab.tsx` | Add `md:hidden` wrapper so FAB only shows on mobile |
| `src/features/dashboard/Dashboard.tsx` | Replace non-token colors in QuickActions |
| `src/features/tasks/Tasks.tsx` | Add desktop header "New" button |
| `src/features/tasks/TaskBoardView.tsx` | Fix non-token avatar colors, responsive column layout |
| `src/features/mail/Mail.tsx` | Add desktop header buttons, remove FAB duplication |
| `src/features/mail/MailList.tsx` | Replace hardcoded blue colors with brand tokens |
| `src/features/notes/Notes.tsx` | Add desktop header button, improve mobile layout |
| `src/features/settings/Settings.tsx` | Mobile tab selector improvement |

---

### Task 1: Add Reduced Motion Support to Global CSS

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Append reduced-motion media query**

Add at the end of `src/index.css` (after the last existing rule):

```css
/* Reduced motion support — respect user OS preference */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `pnpm typecheck`
Expected: SUCCESS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add prefers-reduced-motion support to global CSS"
```

---

### Task 2: Hide ModuleFab on Desktop

**Files:**
- Modify: `src/components/layout/ModuleFab.tsx`

- [ ] **Step 1: Wrap FAB root element with md:hidden**

Replace the root `<div>` className in the return statement:

Old:
```tsx
return (
    <div ref={ref} className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6">
```

New:
```tsx
return (
    <div ref={ref} className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6 md:hidden">
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm typecheck`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/ModuleFab.tsx
git commit -m "feat: hide ModuleFab on desktop (md:hidden) — desktop uses header buttons"
```

---

### Task 3: Fix Dashboard QuickActions Colors

**Files:**
- Modify: `src/features/dashboard/Dashboard.tsx`

- [ ] **Step 1: Replace non-token colors in QuickActions**

Replace the `actions` array in the `QuickActions` function:

Old:
```tsx
const actions = [
    { to: "/tasks", label: "新建任务", icon: ClipboardCheck, color: "text-brand-600 bg-brand-50" },
    { to: "/notes", label: "新建笔记", icon: NotebookText, color: "text-emerald-600 bg-emerald-50" },
    { to: "/finance", label: "记一笔", icon: PiggyBank, color: "text-amber-600 bg-amber-50" },
    { to: "/calendar", label: "添加日程", icon: CalendarDays, color: "text-purple-600 bg-purple-50" },
  ];
```

New:
```tsx
const actions = [
    { to: "/tasks", label: "新建任务", icon: ClipboardCheck, color: "text-brand-700 bg-brand-50" },
    { to: "/notes", label: "新建笔记", icon: NotebookText, color: "text-foreground bg-muted" },
    { to: "/finance", label: "记一笔", icon: PiggyBank, color: "text-destructive bg-secondary" },
    { to: "/calendar", label: "添加日程", icon: CalendarDays, color: "text-brand-700 bg-brand-100" },
  ];
```

- [ ] **Step 2: Verify no console warnings**

Run: `pnpm dev` (blocking: false)
Expected: Dev server starts without CSS variable warnings

- [ ] **Step 3: Commit**

```bash
git add src/features/dashboard/Dashboard.tsx
git commit -m "feat: use design tokens for Dashboard QuickActions colors"
```

---

### Task 4: Add Desktop Header Button to Tasks

**Files:**
- Modify: `src/features/tasks/Tasks.tsx`

- [ ] **Step 1: Import Button and Plus icon**

The file already imports `Plus` from lucide-react. Add `Button` import:

Add after existing imports:
```tsx
import { Button } from "@/components/ui/button";
```

- [ ] **Step 2: Add "New Task" button in header**

In the header section (around line 67-73), add a Button before the view mode toggler:

Old (header div):
```tsx
<div className="flex items-end justify-between gap-4 border-b p-4 pb-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight">任务</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            拖动卡片调整状态 · 点击查看详情
          </p>
        </div>

        {/* 视图切换器 */}
        <div className="flex gap-2 rounded-[11px] bg-muted/60 p-1">
```

New:
```tsx
<div className="flex items-end justify-between gap-4 border-b p-4 pb-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight">任务</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            拖动卡片调整状态 · 点击查看详情
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={openCreate} className="hidden md:flex items-center gap-1">
            <Plus size={15} /> 新建任务
          </Button>

          {/* 视图切换器 */}
          <div className="flex gap-2 rounded-[11px] bg-muted/60 p-1">
```

Also update the closing `</div>` for the view switcher container — there's now an extra wrapper div. Find the closing of the view switcher segment divs and add an extra `</div>`:

After the calendar view button closing `</button></div>` (view switcher container), add:
```tsx
</div>
```

- [ ] **Step 3: Verify layout renders correctly**

Run: `pnpm typecheck`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add src/features/tasks/Tasks.tsx
git commit -m "feat: add desktop 'New Task' button in Tasks header"
```

---

### Task 5: Fix TaskBoardView Avatar Colors and Responsive Layout

**Files:**
- Modify: `src/features/tasks/TaskBoardView.tsx`

- [ ] **Step 1: Replace non-token avatar background colors**

Replace the `taskAvatar` function:

Old:
```tsx
function taskAvatar(task: Task, idx: number) {
  const letter = (task.title?.[0] ?? "E").toUpperCase();
  const bgs = [
    "bg-brand-100 text-brand-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-sky-100 text-sky-700",
  ];
  return { letter, bg: bgs[idx % bgs.length] };
}
```

New:
```tsx
function taskAvatar(task: Task, idx: number) {
  const letter = (task.title?.[0] ?? "E").toUpperCase();
  const bgs = [
    "bg-brand-100 text-brand-700",
    "bg-brand-50 text-brand-700",
    "bg-secondary text-foreground",
    "bg-accent text-foreground",
  ];
  return { letter, bg: bgs[idx % bgs.length] };
}
```

- [ ] **Step 2: Make board columns responsive**

Replace the board container div in `TaskBoardView`:

Old:
```tsx
<div className="flex h-full gap-3.5 overflow-x-auto p-0 pb-2">
```

New:
```tsx
<div className="flex h-full flex-col gap-3.5 overflow-x-auto md:flex-row md:gap-3.5 p-0 pb-2">
```

And update the `DroppableColumn` container:

Old:
```tsx
className={cn(
  "flex min-w-[260px] flex-1 flex-col rounded-[var(--radius,14px)] bg-muted/30 p-2.5 transition-colors",
  isOver && "bg-muted"
)}
```

New:
```tsx
className={cn(
  "flex flex-col rounded-[var(--radius,14px)] bg-muted/30 p-2.5 transition-colors",
  "min-w-0 min-w-[260px] md:min-w-[260px]",
  isOver && "bg-muted"
)}
```

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add src/features/tasks/TaskBoardView.tsx
git commit -m "feat: use design tokens for task avatars, responsive board columns"
```

---

### Task 6: Fix Mail Module Button Duplication

**Files:**
- Modify: `src/features/mail/Mail.tsx`

- [ ] **Step 1: Ensure desktop header has compose button (already exists)**

The Mail header already has "写信" and "收取邮件" buttons. No change needed for the header. The FAB will be hidden on desktop by Task 2 change.

- [ ] **Step 2: Verify Mail header buttons are desktop-visible**

The current header buttons use `hidden sm:inline` for text labels, which is correct. No change needed.

- [ ] **Step 3: Verify ModuleFab is now hidden on desktop**

Since Task 2 added `md:hidden` to ModuleFab root, the Mail FAB actions ("写邮件", "新建文件夹") will only show on mobile. On desktop, users use the header buttons.

- [ ] **Step 4: Commit (no code change, verification only)**

```bash
git commit -am "verify: mail module button hierarchy correct after ModuleFab md:hidden"
```

If no actual changes, skip this commit.

---

### Task 7: Fix MailList Hardcoded Blue Colors

**Files:**
- Modify: `src/features/mail/MailList.tsx`

- [ ] **Step 1: Replace unread indicator dot color**

In `MailListItem`, replace the unread dot:

Old:
```tsx
{!email.is_read && (
  <div className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
)}
```

New:
```tsx
{!email.is_read && (
  <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />
)}
```

- [ ] **Step 2: Replace unread row background**

Old:
```tsx
!email.is_read && "bg-blue-50/50 dark:bg-blue-950/20"
```

New:
```tsx
!email.is_read && "bg-brand-50/50 dark:bg-brand-50/20"
```

- [ ] **Step 3: Replace account label badge colors**

Old:
```tsx
<span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
```

New:
```tsx
<span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-50 dark:text-brand-700">
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add src/features/mail/MailList.tsx
git commit -m "feat: use brand tokens for MailList unread indicators and badges"
```

---

### Task 8: Add Desktop Header Button to Notes

**Files:**
- Modify: `src/features/notes/Notes.tsx`

- [ ] **Step 1: Import Button component**

Add after existing imports:
```tsx
import { Button } from "@/components/ui/button";
```

- [ ] **Step 2: Add "New Note" button in header**

Replace the header section:

Old:
```tsx
<div className="flex items-end justify-between gap-4 border-b p-4 pb-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight">笔记</h1>
          <p className="mt-1 text-sm text-muted-foreground">自动保存 · 支持富文本</p>
        </div>
      </div>
```

New:
```tsx
<div className="flex items-end justify-between gap-4 border-b p-4 pb-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight">笔记</h1>
          <p className="mt-1 text-sm text-muted-foreground">自动保存 · 支持富文本</p>
        </div>
        <Button size="sm" onClick={() => handleCreateNote("未命名笔记")} className="hidden md:flex items-center gap-1">
          <Plus size={15} /> 新建笔记
        </Button>
      </div>
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add src/features/notes/Notes.tsx
git commit -m "feat: add desktop 'New Note' button in Notes header"
```

---

### Task 9: Improve Settings Responsive Layout

**Files:**
- Modify: `src/features/settings/Settings.tsx`

- [ ] **Step 1: Make mobile tab navigation use dropdown**

The current Settings component uses horizontal scrolling tabs on mobile. Replace with a Select dropdown on mobile:

First, add `Select` import (already imported). Add a state for mobile:

The component already uses a mobile-first approach. Improve the tab container:

Old tab container:
```tsx
<div className="w-full md:w-48 border-b md:border-b-0 md:border-r p-2 flex md:flex-col gap-1 overflow-x-auto shrink-0">
```

New tab container (use select on mobile, tabs on desktop):
```tsx
<div className="w-full border-b p-3 md:hidden">
          <Select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="hidden w-48 border-r p-2 flex-col gap-1 md:flex shrink-0">
```

Also update the closing `</div>` — you'll need an extra closing tag for the new mobile div. The original closing `</div>` for the tab container should now close the desktop-only div. Find the tab buttons container closing div and add:

After the tab button loop closing `</div>`, add nothing extra since we split into two divs.

- [ ] **Step 2: Increase content max-width for data sections**

Replace all `max-w-md` with `max-w-2xl` in the settings content area. Find all occurrences of `max-w-md`:

Old (6 occurrences):
```tsx
<div className="max-w-md space-y-4">
```

New:
```tsx
<div className="max-w-2xl space-y-4">
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/Settings.tsx
git commit -m "feat: use Select dropdown for Settings tabs on mobile, widen content area"
```

---

### Task 10: Improve Mail Responsive Layout for Tablet

**Files:**
- Modify: `src/features/mail/Mail.tsx`

- [ ] **Step 1: Use flex proportions instead of fixed widths**

Replace the mail content area layout:

Old:
```tsx
<aside className="hidden w-[200px] shrink-0 border-r md:block">
```

New:
```tsx
<aside className="hidden w-[180px] shrink-0 border-r lg:block">
```

And the mail list container:

Old:
```tsx
<div className={`w-full shrink-0 border-r md:block md:w-[360px] ${mobileView === 'reader' ? 'hidden' : 'block'}`}>
```

New:
```tsx
<div className={`w-full shrink-0 border-r md:block md:min-w-0 md:w-[360px] lg:w-[400px] ${mobileView === 'reader' ? 'hidden' : 'block'}`}>
```

- [ ] **Step 2: Show folder tree on tablet via drawer only**

The current setup shows the folder tree on `md:` and above. Change to `lg:` so tablets use the drawer:

The change in Step 1 already handles this (`lg:block` instead of `md:block`).

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: SUCCESS

- [ ] **Step 4: Commit**

```bash
git add src/features/mail/Mail.tsx
git commit -m "feat: improve Mail responsive layout — tablet uses drawer for folders"
```

---

### Task 11: Notes Empty State Improvement

**Files:**
- Modify: `src/features/notes/Notes.tsx`

- [ ] **Step 1: Show empty state when no note selected on desktop**

In the desktop layout section, when no note is selected, show a placeholder in the editor area instead of leaving it blank:

Old:
```tsx
{selectedNote && (
  <div className="h-full flex-1">
    <NoteEditor note={selectedNote} />
  </div>
)}
```

New:
```tsx
{selectedNote ? (
  <div className="h-full flex-1">
    <NoteEditor note={selectedNote} />
  </div>
) : (
  <div className="hidden flex-1 items-center justify-center text-sm text-muted-foreground md:flex">
    选择一篇笔记开始编辑
  </div>
)}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/features/notes/Notes.tsx
git commit -m "feat: show empty state in Notes editor when no note selected"
```

---

### Task 12: Calendar Module — No Changes Needed

The Calendar module already follows design token conventions and has proper header buttons. No FAB present. Verified compliant.

- [ ] **Verify no non-token colors in Calendar components**

Check `Calendar.tsx`, `CalendarMonthView.tsx`, `CalendarWeekView.tsx`, `CalendarAgendaView.tsx` for any hardcoded color values.

Expected: All colors use design tokens.

---

### Task 13: Final Verification — Build and Type Check

- [ ] **Step 1: Run full type check**

Run: `pnpm typecheck`
Expected: SUCCESS with 0 errors

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: SUCCESS (or only pre-existing warnings)

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All existing tests pass (no new tests needed — pure UI changes)

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: SUCCESS

---

### Task 14: Visual Verification at Multiple Screen Sizes

This task requires browser testing. Use the browser automation skill or manual testing.

- [ ] **Step 1: Start dev server**

Run: `pnpm dev` (non-blocking)

- [ ] **Step 2: Test at each screen size**

For each module (Dashboard, Tasks, Mail, Notes, Calendar, Settings):

- [ ] Mobile 375×812: FAB visible, no header action buttons, content readable
- [ ] Tablet 768×1024: No FAB, drawer for folders, proper column widths
- [ ] Laptop 1024×768: Header buttons visible, no FAB, full layout
- [ ] Desktop 1440×900: All features visible, proper spacing
- [ ] Large 1920×1080: Content centered, no excessive whitespace

- [ ] **Step 3: Verify design token compliance**

Scan visually for any blue, green, amber, purple hues that don't match the brand (Iris 鸢尾靛, hue 264).

- [ ] **Step 4: Verify button deduplication**

On desktop: each module has action buttons in header, no FAB
On mobile: each module has FAB, header buttons are icon-only or hidden
