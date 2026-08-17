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

### Dashboard
Your daily command center. See at-a-glance: today's tasks, unread emails, note count, and monthly spending — with smart trend indicators.

### Tasks
Three views for every workflow style:
- **Kanban board** — drag & drop across To Do / In Progress / Cancelled / Done
- **List view** — compact, high-density browsing
- **Calendar view** — weekly layout with daily task distribution

Supports priorities, labels, due dates, subtasks, and recurring tasks (daily/weekly/monthly).

### Calendar
More than dates — it's a **time-dimension aggregator**:
- **Month view** with daily income/expense badges
- **Week view** with timeline layout
- **Agenda view** listing all upcoming items
- **ICS subscription** — sync Google Calendar, CalDAV, etc.

### Email
Full-featured native IMAP/SMTP email client powered by Tauri Rust backend:
- Multiple account support with unified inbox
- Automatic folder sync with unread counts
- HTML rendering with XSS protection (DOMPurify)
- Attachment preview & download
- Compose with draft auto-save
- Incremental sync (manual + background every 5 minutes)

### Notes
Rich-text editor powered by **TipTap**:
- Bold, italic, headings, lists, code blocks, quotes, images
- Folder hierarchy + color-coded tags
- Auto-save (500ms title / 1500ms content debounced)
- Import `.txt` / `.md` files

### Finance
Complete personal finance management:
- **Transactions** — income, expenses, transfers with receipt photos
- **Accounts** — cash, bank cards, credit cards with auto-balance
- **Budgets** — monthly limits with rollover & progress tracking
- **Categories** — multi-level hierarchy with emoji icons
- **Reports** — bar charts, pie charts, trend lines, CSV export
- Integer-based cent storage — zero floating-point drift

### Settings
- Profile management with avatar upload
- Theme switching (Light / Dark / System)
- Notification toggles (tasks, email, budget alerts)
- Data export (JSON) & import — your data, always yours
- Cloud sync configuration (optional, for multi-device sync)

---

## Tech Stack

| Layer          | Technology                                              |
| -------------- | ------------------------------------------------------- |
| **Frontend**   | React 19 + TypeScript + Vite 7 + Tailwind CSS v4        |
| **UI**         | shadcn/ui (new-york) + Radix + Lucide icons             |
| **Routing**    | TanStack Router                                         |
| **Data Cache** | TanStack Query v5                                       |
| **State**      | Zustand (auth & UI state)                               |
| **Rich Text**  | TipTap                                                  |
| **Drag & Drop**| @dnd-kit                                                |
| **Charts**     | Recharts                                                |
| **i18n**       | i18next (English + Chinese)                             |
| **Local DB**   | SQLite (rusqlite, WAL mode)                             |
| **Desktop**    | Tauri v2 (Rust)                                         |
| **Native Mail**| Rust (async-imap + lettre + mail-parser)                |
| **Auth**       | Local SQLite + Argon2 password hashing                  |
| **Cloud Sync** | Optional PostgreSQL (Supabase / Aiven / Render) via tokio-postgres |
| **Testing**    | Vitest + Testing Library + Playwright (E2E)             |

---

## Architecture

EasyWork is a **local-first** desktop application. All data lives in a local SQLite database, accessed through Tauri IPC commands implemented in Rust. Cloud sync to PostgreSQL is optional and user-configured.

```
+------------------------------------------------------------------+
|                    Frontend (React SPA)                           |
|  UI Components                                                    |
|    -> TanStack Query (caching, invalidation)                      |
|      -> *Api.ts adapters (taskApi, notesApi, financeApi, etc.)    |
|        -> tauri.invoke() (Tauri IPC bridge)                       |
+-------------------------------+----------------------------------+
                                |  Tauri IPC (JSON commands)
+-------------------------------v----------------------------------+
|                   Tauri Rust Backend                              |
|                                                                    |
|  +-------------------+  +--------------------------------------+   |
|  | commands.rs       |  | business/                            |   |
|  | (IPC entry point) |  |  - tasks.rs     (15 commands)        |   |
|  | invoke_handler![] |  |  - notes.rs     (17 commands)        |   |
|  +--------+----------+  |  - finance.rs   (16 commands)        |   |
|           |              |  - calendar.rs (11 commands)         |   |
|  +--------v----------+  |  - auth.rs      (Argon2 local auth)  |   |
|  | AppState          |  |  - backup.rs    (export/import/clear)|   |
|  |  - db: SQLite     |  +-------------------+------------------+   |
|  |  - service: Mail  |                        |                    |
|  +--------+----------+                 +------v-------+            |
|           |                              | sync/         |            |
|  +--------v----------+                   |  - engine.rs  | (LWW merge|
|  | mail/             |                   |  - postgres.rs|  upload/dl)|
|  |  - imap.rs        |                   |  - schema.rs  | (cloud DDL)|
|  |  - smtp.rs        |                   |  - config.rs  |            |
|  |  - mime.rs        |                   +--------------+            |
|  |  - service.rs     |                                               |
|  |  - db.rs (SQLite) |  +--------------------------------------+     |
|  |  - creds.rs       |  | db.rs (main SQLite, schema v12)     |     |
|  |  (OS Keyring)     |  |  users/tasks/notes/finance/calendar  |     |
|  +-------------------+  +--------------------------------------+     |
+----------------------------------------------------------------------+
                                |
                   +------------+------------+
                   |                         |
            (local-only, default)   (optional, user config)
                   |                         |
            +------v------+          +------v--------------------+
            |  SQLite DB   |          |  PostgreSQL (cloud sync)  |
            |  (WAL mode)  |          |  Supabase / Aiven / Render|
            +-------------+           +---------------------------+
```

### Data Flow

```
User action (React UI)
  -> TanStack Query hook (useTasks, useMail, etc.)
    -> *Api.ts adapter (taskApi.createTask, mailApi.sync, etc.)
      -> tauri.invoke('command_name', args)
        -> Rust command handler (commands.rs)
          -> Business logic (business/*.rs, mail/*.rs)
            -> SQLite read/write (rusqlite)
              -> Result back up the chain
                -> Query cache invalidation -> UI re-render
```

### Security
- **Local SQLite with user isolation** — all queries filter by `user_id`; single-user desktop model means no cross-tenant leakage
- **Password hashing** — Argon2id with per-user salt, stored in SQLite `users.password_hash`
- **Email credential storage** — OS Keyring (via `tauri-plugin-keyring` / `keyring` crate), never stored in plaintext in SQLite
- **HTML sanitization** — DOMPurify on the frontend, `ammonia` in Rust MIME parsing
- **Sensitive data stripped on export** — password hashes, email credentials excluded from JSON backups
- **TLS enforcement** — IMAP/SMTP connections require TLS; no plaintext downgrade

### Optional Cloud Sync

Cloud sync is **opt-in** and configured entirely in-app (Settings -> Sync). When enabled:

- Local SQLite changes are incrementally uploaded to a user-provided PostgreSQL database
- Supports **Supabase**, **Aiven**, **Render**, or any standard PostgreSQL connection string
- Conflict resolution: **Last-Write-Wins (LWW)** based on `updated_at` timestamps
- Background sync every 60 seconds + instant upload on data changes
- Email message content is **not** synced (only email account settings)
- Works offline — queue uploads when network recovers

```
Local change -> SQLite trigger updates sync_modified_at
  -> Instant upload queued (tokio spawn, fire-and-forget)
    -> PostgreSQL UPSERT with LWW conflict resolution
      -> Sync log entry recorded (visible in Settings)
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 9
- **Rust** (stable, for Tauri backend)

### Installation

```bash
# Clone repository
git clone https://github.com/ethanbourne789/EasyWork.git
cd EasyWork

# Install dependencies
pnpm install

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

---

## Project Structure

```
EasyWork/
src/
  components/           # Shared UI components
    layout/             # App shell (sidebar, tabs, etc.)
    theme/              # Theme provider & toggle
    ui/                 # shadcn/ui atoms
  features/             # Feature modules
    auth/               # Login, registration, local auth
    calendar/           # Calendar module
    dashboard/          # Dashboard module
    finance/            # Finance module
    mail/               # Email module
    notes/              # Notes module
    settings/           # Settings module (profile, sync, etc.)
    sync/               # Cloud sync API adapters
    tasks/              # Tasks module
  lib/                  # Utilities & services
    tauri.ts            # Tauri IPC bridge (invoke wrapper)
    authApi.ts          # Auth API (register, login, profile)
    locales/            # i18n translation files
  types/                # TypeScript type definitions
src-tauri/              # Tauri Rust backend
  src/
    main.rs             # Tauri entry point
    lib.rs              # App setup, DB init, command registration
    commands.rs         # Tauri IPC command handlers (~870 lines)
    db.rs               # SQLite schema migrations (v12)
    business/           # Business logic modules
      auth.rs           # Local auth (Argon2 register/login)
      tasks.rs          # Task CRUD, tags, subtasks
      notes.rs          # Notes, folders, tags
      finance.rs        # Transactions, accounts, budgets, categories
      calendar.rs       # Calendar events, ICS subscriptions
      backup.rs         # Data export/import/clear
    mail/               # Native email service
      imap.rs           # IMAP adapter (async-imap)
      smtp.rs           # SMTP sender (lettre)
      mime.rs           # MIME parser (mail-parser)
      service.rs        # Mail orchestration & sync
      db.rs             # Mail SQLite schema
      db_queries.rs     # Mail DAO queries
      creds.rs          # OS Keyring credential store
      contacts.rs       # Contact extraction
      events.rs         # Tauri event emission (sync progress)
    sync/               # Cloud sync engine
      engine.rs         # Upload/download/LWW merge
      postgres.rs       # PostgreSQL client (tokio-postgres)
      schema.rs         # Cloud schema initialization
      config.rs         # Sync config, device info, logs
  capabilities/         # Tauri permission declarations
  tauri.conf.json       # Tauri app configuration
e2e/                    # Playwright E2E tests
design/                 # Design system & prototype
docs/                   # Documentation
  archive/              # Archived plans & legacy references
```

---

## Cross-Module Workflows

### Email -> Task
```
Receive email -> "Create Task" button -> Auto-fill title from subject
-> Set due date & priority -> Task appears on board & calendar
```

### Task -> Calendar
```
Create task with due date -> Auto-shown on calendar
-> Click calendar event -> Open task details
```

### Finance -> Task
```
Record expense -> Link to task (e.g., "Q3 Client Visit")
-> View related expenses in task details
-> Filter reports by task
```

### Dashboard -> Global Search
```
Search bar -> Query across tasks, notes, emails, transactions
-> Click result -> Navigate directly to the item
```

---

## Design System

EasyWork follows a strict design system with **OKLCH color space** (perceptually uniform), **Fraunces** display font, and **Plus Jakarta Sans** UI font. Key principles:

- **Quiet first** — neutral backgrounds (~60%), brand color only for CTAs/active states (10%)
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

Built with [React](https://react.dev/), [Tauri](https://tauri.app/), [SQLite](https://www.sqlite.org/), [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), and [Lucide](https://lucide.dev/).
