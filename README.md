# EasyWork

> **Simplify your work & life** — an all-in-one desktop app for Email, Tasks, Notes, Finance & Calendar.

[![CI](https://github.com/ethanbourne789/EasyWork/actions/workflows/ci.yml/badge.svg)](https://github.com/ethanbourne789/EasyWork/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ethanbourne789/EasyWork/blob/main/LICENSE)

## Overview

EasyWork replaces six scattered tools with one unified workspace:

| Instead of...                    | EasyWork gives you...       |
| -------------------------------- | --------------------------- |
| Todoist + Outlook + Notion       | A single app                |
| 6 logins, 6 accounts             | 1 login, 1 connected dataset|
| Switching windows every 30 sec   | Smooth, in-app workflows    |

**Cross-module linking**: Create tasks from emails, attach notes to expenses, see everything on your calendar — all within one window.

---

## Features

### 📊 Dashboard
Your daily command center. See at-a-glance: today's tasks, unread emails, note count, and monthly spending — with smart trend indicators.

### ✅ Tasks
Three views for every workflow style:
- **Kanban board** — drag & drop across To Do / In Progress / Cancelled / Done
- **List view** — compact, high-density browsing
- **Calendar view** — weekly layout with daily task distribution

Supports priorities, labels, due dates, subtasks, and recurring tasks (daily/weekly/monthly).

### 📅 Calendar
More than dates — it's a **time-dimension aggregator**:
- **Month view** with daily income/expense badges
- **Week view** with timeline layout
- **Agenda view** listing all upcoming items
- **ICS subscription** — sync Google Calendar, CalDAV, etc.

### 📧 Email
Full-featured IMAP/SMTP email client:
- Multiple account support with unified inbox
- Automatic folder sync with unread counts
- HTML rendering with XSS protection (DOMPurify)
- Attachment preview & download
- Compose with draft auto-save
- Incremental sync (manual + background every 5 minutes)

### 📝 Notes
Rich-text editor powered by **TipTap**:
- Bold, italic, headings, lists, code blocks, quotes, images
- Folder hierarchy + color-coded tags
- Auto-save (500ms title / 1500ms content debounced)
- Import `.txt` / `.md` files

### 💰 Finance
Complete personal finance management:
- **Transactions** — income, expenses, transfers with receipt photos
- **Accounts** — cash, bank cards, credit cards with auto-balance
- **Budgets** — monthly limits with rollover & progress tracking
- **Categories** — multi-level hierarchy with emoji icons
- **Reports** — bar charts, pie charts, trend lines, CSV export
- Integer-based cent storage — zero floating-point drift

### ⚙️ Settings
- Profile management with avatar upload
- Theme switching (Light / Dark / System)
- Notification toggles (tasks, email, budget alerts)
- Data export (JSON) & import — your data, always yours

---

## Tech Stack

| Layer          | Technology                                              |
| -------------- | ------------------------------------------------------- |
| **Frontend**   | React 19 + TypeScript + Vite 7 + Tailwind CSS v4        |
| **UI**         | shadcn/ui (new-york) + Radix + Lucide icons             |
| **Routing**    | TanStack Router                                         |
| **Data Cache** | TanStack Query v5                                       |
| **State**      | Zustand (auth & realtime only)                          |
| **Rich Text**  | TipTap                                                  |
| **Drag & Drop**| @dnd-kit                                                |
| **Charts**     | Recharts                                                |
| **i18n**       | i18next (English + Chinese)                             |
| **Backend**    | Supabase (PostgreSQL 17 + Auth + Realtime + Storage)    |
| **Serverless** | Supabase Edge Functions (Deno)                          |
| **Desktop**    | Tauri v2 (Rust) — native IMAP/SMTP mail service         |
| **Testing**    | Vitest + Testing Library + Playwright (E2E)             |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│           Client (React SPA + Tauri)         │
│  UI → TanStack Query → Supabase.js Client    │
└──────────────────┬──────────────────────────┘
                   │ REST / WebSocket / Tauri Commands
┌──────────────────▼──────────────────────────┐
│              Supabase Backend                │
│  PostgreSQL + Auth + Realtime + Storage      │
│  Edge Functions (IMAP/SMTP/ICS proxy)        │
└─────────────────────────────────────────────┘
```

### Security
- Row-Level Security (RLS) isolates all data per user
- Email passwords encrypted at rest (AES-256)
- HTML content sanitized with DOMPurify
- Sensitive fields stripped on data export

### Realtime Sync
```
User A edits task → Supabase Realtime broadcasts
                                      ↓
User B's Query cache invalidates → refetch → UI updates
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9
- **Rust** (for Tauri backend)
- **Supabase CLI** (for local database development)

### Installation

```bash
# Clone repository
git clone https://github.com/ethanbourne789/EasyWork.git
cd EasyWork

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test           # Unit tests
pnpm test:e2e       # End-to-end tests
pnpm typecheck      # TypeScript type checking
pnpm lint           # ESLint
```

### Tauri Desktop App

```bash
# Run Tauri dev mode
pnpm tauri dev

# Build desktop app
pnpm tauri build
```

### Supabase Local Development

```bash
# Start local Supabase
supabase start

# Apply migrations
supabase db push

# Set Edge Function secrets
supabase secrets set --env-file supabase/.env.secrets
```

---

## Project Structure

```
EasyWork/
├── src/
│   ├── components/           # Shared UI components
│   │   ├── layout/           # App shell (sidebar, tabs, etc.)
│   │   ├── theme/            # Theme provider & toggle
│   │   └── ui/               # shadcn/ui atoms
│   ├── features/             # Feature modules
│   │   ├── auth/             # Login & registration
│   │   ├── calendar/         # Calendar module
│   │   ├── dashboard/        # Dashboard module
│   │   ├── finance/          # Finance module
│   │   ├── mail/             # Email module
│   │   ├── notes/            # Notes module
│   │   ├── realtime/         # Realtime sync
│   │   ├── settings/         # Settings module
│   │   └── tasks/            # Tasks module
│   ├── lib/                  # Utilities & services
│   └── types/                # TypeScript type definitions
├── src-tauri/                # Tauri Rust backend
│   └── src/mail/             # Native IMAP/SMTP service
├── supabase/                 # Supabase configuration
│   ├── migrations/           # Database migrations (31 files)
│   ├── functions/            # Edge Functions
│   └── config.toml           # Supabase CLI config
├── e2e/                      # Playwright E2E tests
├── design/                   # Design system & prototype
└── docs/                     # Documentation
```

---

## Cross-Module Workflows

### Email → Task
```
Receive email → "Create Task" button → Auto-fill title from subject
→ Set due date & priority → Task appears on board & calendar
```

### Task → Calendar
```
Create task with due date → Auto-shown on calendar
→ Click calendar event → Open task details
```

### Finance → Task
```
Record expense → Link to task (e.g., "Q3 Client Visit")
→ View related expenses in task details
→ Filter reports by task
```

### Dashboard → Global Search
```
Search bar → Query across tasks, notes, emails, transactions
→ Click result → Navigate directly to the item
```

---

## Design System

EasyWork follows a strict design system with **OKLCH color space** (perceptually uniform), **Fraunces** display font, and **Plus Jakarta Sans** UI font. Key principles:

- **Quiet first** — neutral backgrounds (~60%), brand color only for CTAs/active states (≤10%)
- **Scannable at a glance** — priority dots, unread bold, tabular numbers for amounts
- **Smooth transitions** — ease-out-quart for transforms; respects `prefers-reduced-motion`
- **Consistent patterns** — same shape for same action; uniform row interactions

See [`design/UI-Redesign-System.md`](design/UI-Redesign-System.md) for the full specification.

---

## Testing

```bash
# Unit tests (Vitest)
pnpm test

# E2E tests (Playwright)
pnpm test:e2e

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

---

## License

[MIT](LICENSE) — Ethan Bourne, 2026

---

## Acknowledgments

Built with [React](https://react.dev/), [Tauri](https://tauri.app/), [Supabase](https://supabase.com/), [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), and [Lucide](https://lucide.dev/).
