# EasyWork

> **Simplify your work: an all-in-one app for Email, Kanban, Notes & Bookkeeping.**

[中文版](./README.zh-CN.md) | [Design Document](./docs/EasyWork%E8%AE%BE%E8%AE%A1%E6%96%87%E6%A1%A3.md)

EasyWork is a cross-platform personal productivity tool built on **Tauri + React + Rust**, designed for **Windows** and **Android**. It integrates task management, calendar planning, email processing, note-taking, stock tracking, bookkeeping, and fitness tracking into a single, streamlined application — your one-stop command center for work and life.

<div align="center">
  <img src="./screenshots/dashboard.png" alt="EasyWork Dashboard Screenshot" width="800" style="border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.12);" />
  <p><em>EasyWork Dashboard — your command center at a glance</em></p>
</div>

---

## ✨ Features

### 📊 Dashboard

The home screen and data hub. Aggregates key metrics from all modules at a glance:

| Card | Source | Content |
|------|--------|---------|
| Today's Tasks | Kanban | Pending count + urgent markers |
| Today's Schedule | Calendar | Event count + next-item countdown |
| Spending | Accounting | Yesterday's expenses / Monthly budget usage |
| Steps | Sports | 30-day trend / Goal completion rate |

- Watchlist stock ticker with sparkline charts (red for gains, green for losses)
- Quick action buttons: add task, write note, log expense, record workout

### 📋 Kanban (Task Management)

Full lifecycle task management with 5 swimlanes:

```
📋 To Do → 🔄 In Progress → ✅ Completed → 📦 Archived
                           → ❌ Abandoned
```

**Task card fields:** title, assignee, start/end time, running duration, rating (1–5★), priority (high/medium/low), urgency (Eisenhower Matrix), difficulty, timeline, attachments.

**Periodic review:** auto-generates weekly/monthly retrospective reports with completion rates, average duration, and improvement suggestions.

### 📅 Calendar

Multi-view calendar (day/week/month/year) with integrated event display:

- **Day view:** 24-hour timeline
- **Week view:** 7-day layout
- **Month view:** Full overview with overlays for tasks, expenses, and workout records
- Chinese lunar calendar & public holiday annotations
- DingTalk calendar subscription support

### ✉️ Email

Elegant email client inspired by Pebble's design philosophy.

- IMAP/SMTP protocol support
- Multi-account management with unified inbox
- Auto-detect mail provider → auto-fill IMAP/SMTP config
- Contact management (CRUD + VCF import/export + groups)
- Custom email signatures
- Folders: Inbox, Sent, Drafts, Trash (30-day retention)

### 📝 Notes

Rich text editing and knowledge management powered by Tiptap.

- Markdown-compatible rich text editor with live preview
- Folder & tag dual-dimension organization
- Full-text search (title + content)
- Image paste/upload support
- File attachment support
- Version history with rollback
- Export to PDF / Markdown / HTML
- Focus mode for distraction-free writing

### 📈 Stock

Real-time market monitoring and portfolio management.

- Real-time quotes, change %, and volume
- Watchlist management with price alerts
- K-line charts (daily/weekly/monthly)
- Technical indicators: MA, MACD, KDJ, RSI
- Related news feed
- Data sources: Sina Finance, Tencent Finance (free APIs), with custom data source support

### 💰 Accounting

Personal finance management made simple.

- Quick income/expense recording
- Preset categories (Dining, Transport, Shopping, Entertainment, etc.) + custom categories
- Budget management with overspend alerts
- Statistical charts: trends, category pie, monthly comparison
- Bill import from Alipay/WeChat (CSV)
- Export to Excel / CSV
- Stats by day / week / month / year / category

### 🏃 Sports

Basic fitness tracking with third-party sync.

- Manual record: type, duration, distance, calories
- Supported activities: running, cycling, fitness, ball games
- Daily/weekly goal setting
- Historical trend analysis
- Sync with Huawei Health & Keep (requires authorization)

### 📜 Logs (Debug)

Developer and advanced-user diagnostic tool.

- Log levels: DEBUG / INFO / WARN / ERROR
- Real-time streaming with filter by level, module, and time range
- Auto-clean logs older than 30 days
- Export to text file

### ⚙️ Settings

System-wide configuration panel.

| Section | Options |
|---------|---------|
| General | Language, theme (light/dark/system), startup behavior |
| Accounts | Mail accounts, sports platform accounts, stock data sources |
| Notifications | Mail, task reminders, stock alerts |
| Data | Backup/restore, export, storage location |
| About | Version info, update check, open-source license |

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop Shell | Tauri 2.x | Cross-platform desktop/mobile runtime |
| Frontend Framework | React 19 | UI rendering |
| Build Tool | Vite 8.x | Dev server & bundling |
| Routing | TanStack Router | Type-safe routing |
| State Management | Zustand 5 | Lightweight state management |
| UI Components | shadcn/ui + Tailwind CSS 4 | Modern UI primitives |
| Data Storage | SQLite (rusqlite) | Local persistent storage |
| Backend Language | Rust | System-level logic & IPC |
| Package Manager | pnpm | Monorepo workspace |
| Language | TypeScript ~6.0 | Type safety |

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   EasyWork App                       │
│                                                      │
│  ┌──────────────┐     IPC (invoke)   ┌────────────┐  │
│  │  React Frontend │ ◄──────────────► │ Rust Backend│  │
│  │  (10 modules)  │                  │ (Commands)  │  │
│  │                │                  │            │  │
│  │  ┌──────────┐  │                  │ ┌────────┐ │  │
│  │  │ Dashboard│  │                  │ │ SQLite │ │  │
│  │  │ Kanban   │  │                  │ │   DB   │ │  │
│  │  │ Calendar │  │                  │ └────────┘ │  │
│  │  │ Mail     │  │                  │ ┌────────┐ │  │
│  │  │ Notes    │  │                  │ │ HTTP   │ │  │
│  │  │ Stock    │  │                  │ │ Client │ │  │
│  │  │ Account  │  │                  │ └────────┘ │  │
│  │  │ Sports   │  │                  │            │  │
│  │  │ Logs     │  │                  │            │  │
│  │  │ Settings │  │                  │            │  │
│  │  └──────────┘  │                  └────────────┘  │
│  └──────────────┘                                    │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- Rust toolchain (for Tauri development)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/ethanbourne789/EasyWork.git
cd EasyWork

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Or run as Tauri desktop app
pnpm tauri dev
```

### Build

```bash
# Build web version
pnpm build

# Build Tauri desktop app
pnpm tauri build
```

---

## 🗺️ Project Structure

```
E:\Dev\EasyWork/
├── apps/                    # Micro-frontend sub-applications
│   ├── main/                # Shell application (layout, sidebar, theme)
│   ├── app-dashboard/       # Dashboard module
│   ├── app-kanban/          # Kanban task management
│   ├── app-calendar/        # Calendar module
│   ├── app-mail/            # Email client
│   ├── app-notes/           # Notes module
│   ├── app-stock/           # Stock market tracking
│   ├── app-accounting/      # Personal bookkeeping
│   ├── app-sports/          # Fitness tracking
│   ├── app-logs/            # Debug logs
│   └── app-settings/        # System settings
├── shared/                  # Shared code (types, utils, constants)
├── src/                     # Frontend source (Vite entry)
├── src-tauri/               # Tauri Rust backend
│   ├── src/
│   │   ├── commands/        # IPC command handlers
│   │   ├── db/              # SQLite connection & migrations
│   │   └── services/        # Business logic layer
│   └── Cargo.toml
├── docs/                    # Design documents & plans
├── package.json             # Root workspace config
└── pnpm-workspace.yaml
```

---

## 🎨 Design Philosophy

- **Modern minimalist** — Clean, spacious UI inspired by Notion and Linear
- **Dark/Light theme** — Three modes (light, dark, system) with a cohesive color system
  - Primary: `#5BCFC4` → `#1E5DA8` gradient
  - Sidebar: Fixed 60px icon-only with deep gradient background
- **Data-first Dashboard** — Real-time aggregation from all modules, no duplicate storage
- **Responsive** — Desktop (≥1024px) sidebar layout, tablet (768–1023px) collapsible sidebar, mobile (<768px) bottom tab navigation

---

## 📦 Modules

| # | Module | Route | Description |
|---|--------|-------|-------------|
| 1 | Dashboard | `dashboard` | Data overview & quick actions |
| 2 | Kanban | `kanban` | Task lifecycle management |
| 3 | Calendar | `calendar` | Multi-view schedule & integration |
| 4 | Mail | `mail` | Email client with IMAP/SMTP |
| 5 | Notes | `notes` | Rich text notes & knowledge base |
| 6 | Stock | `stock` | Real-time market monitoring |
| 7 | Accounting | `accounting` | Personal finance & bookkeeping |
| 8 | Sports | `sports` | Fitness tracking & sync |
| 9 | Logs | `logs` | Debug & diagnostic logs |
| 10 | Settings | `settings` | System configuration |

---

## 🔒 Privacy & Security

- Sensitive data (mail passwords, etc.) encrypted with AES
- SQLite database file permission-controlled
- Remote images blocked by default (anti-tracking)
- DOMPurify sanitizes rich-text XSS
- Stock data for reference only — not investment advice

---

## 📄 License

This project is open-source software. See the repository for license details.

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

<div align="center">

**EasyWork — Simplify your work, amplify your life.**

[Report Bug](https://github.com/ethanbourne789/EasyWork/issues) · [Request Feature](https://github.com/ethanbourne789/EasyWork/issues)

</div>
