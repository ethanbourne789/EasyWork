# Email Unified Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist mailbox folders to SQLite, merge them across accounts, and show unified folder icons + account color indicators in the narrow EmailToolbar.

**Architecture:** Add a drift table `MailboxFolders` to cache IMAP LIST results. Each account syncs its mailboxes into this table. A `MailboxMerger` utility reads all rows, groups by folder identity (IMAP flags first, then path/name), and returns a unified list. Two new Riverpod providers serve the merged list and the emails for a selected unified folder. The existing `mailboxListProvider` is replaced. The EmailToolbar uses the unified list and appends per-account color indicators. Email list rows get a right-side color band keyed to each email's account accent color.

**Tech Stack:** drift (SQLite/ORM), Riverpod, enough_mail

## Global Constraints

- Table naming: `MailboxFolders` (data class `MailboxFolder`) to avoid conflict with `enough_mail`'s `Mailbox` class
- Schema version: bump from 4 to 5
- Follow existing drift patterns: `@DriftAccessor`, `DatabaseAccessor<AppDatabase>`, `FutureProvider` for DAO providers
- Use `flutter pub run build_runner build --delete-conflicting-outputs` for codegen
- All nullable columns that are optional in `Mailbox` must be nullable in the table
- The `accent_color` column defaults to `0xFF2196F3` (Material Blue)

---
