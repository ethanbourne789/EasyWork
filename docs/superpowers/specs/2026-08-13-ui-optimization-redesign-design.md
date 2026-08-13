# UI Optimization Redesign Spec — Non-Finance Modules

> **Date**: 2026-08-13
> **Scope**: Dashboard, Tasks, Mail, Notes, Calendar, Settings (excludes Finance)
> **Goal**: Bring all non-finance modules to design system compliance, remove duplicate buttons, optimize responsive layouts

---

## Problem Statement

The current UI has three categories of issues across non-finance modules:

1. **Design token violations** — Hardcoded non-palette colors (`blue-500`, `emerald-600`, `amber-600`, `purple-600`, `sky-100`) replace design tokens
2. **Duplicate action buttons** — Desktop headers lack explicit "New" buttons while ModuleFab duplicates header actions on mobile
3. **Poor responsive layouts** — Information density drops on tablets; mobile views use suboptimal patterns

---

## Architecture

Each module is independent. Changes affect only component-level JSX/CSS classes. No API, no data layer, no new dependencies.

### Modules & Files

| Module | Files to Change |
|--------|----------------|
| Dashboard | `Dashboard.tsx`, `OverviewCards.tsx`, `QuickActions` (inline) |
| Tasks | `Tasks.tsx`, `TaskBoardView.tsx`, `TaskListView.tsx` |
| Mail | `Mail.tsx`, `MailList.tsx` |
| Notes | `Notes.tsx`, `NoteList.tsx`, `NoteSidebar.tsx` |
| Calendar | `Calendar.tsx` |
| Settings | `Settings.tsx` |
| Shared | `ModuleFab.tsx`, `index.css` |

---

## Changes by Category

### P0 — Design Token Compliance

**Rules**: All colors MUST use CSS variables or Tailwind utility classes mapped to tokens. No arbitrary hex/hsl values.

| Location | Current | Fix |
|----------|---------|-----|
| Dashboard QuickActions icons | `text-emerald-600 bg-emerald-50` | `text-brand-700 bg-brand-50` |
| Dashboard QuickActions icons | `text-amber-600 bg-amber-50` | `text-destructive bg-secondary` |
| Dashboard QuickActions icons | `text-purple-600 bg-purple-50` | `text-muted-foreground bg-muted` |
| MailList unread dot | `bg-blue-500` | `bg-primary` |
| MailList unread bg | `bg-blue-50/50 dark:bg-blue-950/20` | `bg-brand-50/50 dark:bg-brand-50/20` |
| MailList account badge | `bg-blue-100 text-blue-700` | `bg-brand-50 text-brand-700` |
| TaskBoardView avatar bg | `bg-emerald-100 text-emerald-700` | `bg-brand-100 text-brand-700` |
| TaskBoardView avatar bg | `bg-amber-100 text-amber-700` | `bg-secondary text-foreground` |
| TaskBoardView avatar bg | `bg-sky-100 text-sky-700` | `bg-accent text-foreground` |

### P1 — Button Deduplication

**Pattern**: Desktop shows explicit action buttons in header; ModuleFab shows only on mobile (`md:hidden`).

| Module | Current | Fix |
|--------|---------|-----|
| Tasks | FAB has "新建任务"+FAB has "从模板" | Desktop: add "新建" btn in header. FAB: `md:hidden` |
| Mail | Header "写信"+FAB "写邮件" | Desktop: header keeps "写信". FAB: `md:hidden` |
| Notes | Only FAB, no header button | Desktop: add "新建" btn in header. FAB: `md:hidden` |
| Calendar | Header has buttons, no FAB | Keep as-is (already correct) |

**ModuleFab update**: Wrap in `md:hidden` so desktop never shows FAB. Add desktop header buttons to each module.

### P2 — Responsive Layout Optimization

#### Dashboard
- OverviewCards: `grid-cols-2 lg:grid-cols-4` is fine. No change needed.
- Main grid: `lg:grid-cols-3` already responsive. Verify content fills space.

#### Tasks
- BoardView: `flex overflow-x-auto` with `min-w-[260px]` columns
  - Mobile: Stack columns vertically, full width each
  - Tablet (768px+): 2-column grid of columns
  - Desktop (1024px+): Current 4-column horizontal layout
- ListView: Already single column. Verify row height = 52px per spec.

#### Notes
- Mobile: Current 3-tab pattern (文件夹/列表/编辑器) is too many steps
  - New: 2-view pattern — "文件夹+列表" combined, then "编辑器"
  - Use back button in editor to return to list
- Desktop: Current 3-column layout (200px + 280px + flex-1) is fine

#### Settings
- Mobile: Current horizontal scroll tabs are hard to discover
  - New: Use `<Select>` dropdown for tab switching on mobile
  - Desktop: Keep horizontal tabs
- Content area: `max-w-md` limits readability on wide screens
  - New: `max-w-2xl` for data management section

#### Mail
- Tablet (768-1023px): Current `w-[360px]` mail list is too narrow
  - New: Use flex-based proportions instead of fixed widths
  - Folder tree: `w-[180px]`, List: `min-w-0 flex-1 max-w-[400px]`, Reader: `flex-1`

### P3 — Motion & Accessibility

Add to `src/index.css`:

```css
/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Ensure all interactive elements use `transition-colors duration-160 ease-out` for micro-interactions.

---

## Verification Plan

### Screen sizes to test
| Size | Dimensions | Target |
|------|-----------|--------|
| Mobile | 375×812 | iPhone SE/13 mini |
| Tablet | 768×1024 | iPad |
| Laptop | 1024×768 | Small laptop |
| Desktop | 1440×900 | Standard desktop |
| Large | 1920×1080 | Large desktop |

### Per-module checklist

- [ ] No hardcoded non-token colors remain
- [ ] Desktop: header has explicit action buttons, no FAB
- [ ] Mobile: FAB visible, header buttons hidden or icon-only
- [ ] Content fills available space (no excessive empty areas)
- [ ] All interactive elements ≥ 44px touch target on mobile
- [ ] Focus rings visible on keyboard navigation
- [ ] `prefers-reduced-motion` disables animations

---

## Data Flow

No changes. All existing `useTasks`, `useMail`, `useNotes`, `useCalendar`, `useProfile` hooks remain unchanged.

## Error Handling

No changes. Existing loading/error/empty states are kept.

## Testing

- Unit tests: No expected changes (pure UI modification)
- Visual verification: Screenshot at 5 screen sizes per module
- Manual: Tab through all interactive elements, verify focus ring
