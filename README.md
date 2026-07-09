# EasyWork

Quick links: [中文](README.zh.md) · [Back to top](README.md)

EasyWork is a personal productivity toolkit for Windows and Android. It consolidates common daily workflows (tasks, email, notes, accounting, timeline) under a unified interface.

Key modules

| Module | Description |
|---|---|
| Dashboard | Card-based overview: Today’s tasks, unread emails, budget, notes, activity, stocks |
| Task Board | Board/List/Calendar views, drag-and-drop, recurring tasks (RRULE) |
| Calendar | Month/Week/Day views, lunar calendar & Chinese holidays, task markers |
| Email | Multi-account IMAP, contacts CRUD + VCF, signatures, email→task linking |
| Notes | Rich text editor (flutter_quill), FTS5 search, tags |
| Accounting | Income/expense records, categories, budgets, monthly reports |
| Stocks | Watchlist, real-time quotes (Sina Finance API) |
| Exercise | Manual logs, hooks for third-party sync |
| Timeline | Cross-module event timeline |
| Audit Logs | Full audit trail with filters and export |

Tech stack

| Layer | Selection |
|---|---|
| Framework | Flutter + Dart (stable) |
| State | Riverpod |
| Local DB | drift (SQLite) |
| Routing | go_router |
| Mail | enough_mail |
| Rich Text | flutter_quill |
| Charts | fl_chart |
| i18n | Flutter intl / ARB (EN/ZH) |

Quick start

```bash
flutter pub get
flutter run
flutter test
flutter build apk
flutter build windows
```

---

Licensed under your project license.
