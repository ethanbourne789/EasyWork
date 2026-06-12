import { useState, useMemo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronRight, Search, Users, X } from "lucide-react"
import type { MailContact } from "@/stores/mail-store"
import type { MailRecipient, RecipientKind } from "@/lib/parseAddressList"
import { cn } from "@/lib/utils"

interface ContactPickerPanelProps {
  contacts: MailContact[]
  /** 当前所有收件人（用于显示已选 / 防止重复加入）。 */
  recipients: MailRecipient[]
  onAddTo: (contacts: MailContact[], kind: RecipientKind) => void
  onNotify?: (msg: string, severity?: "info" | "error" | "success") => void
  /** 面板当前是否折叠。 */
  collapsed: boolean
  onToggleCollapse: () => void
  className?: string
}

interface ContactGroup {
  key: string
  name: string
  contacts: MailContact[]
}

/**
 * 联系人选择器面板。
 *
 * 设计：把 MailContact.group_name 字符串作为虚拟分组（兼容当前
 * schema）。等设计文档 PR1 的 mail_contact_groups 表迁移完成后，
 * 把数据源切到 group_id，本组件 API 不变。
 *
 * - 顶部：搜索框（同时过滤分组名和联系人）
 * - 中部：分组列表，每组支持展开/折叠 + 全选 checkbox
 * - 底部：固定操作条「加入 To / Cc / Bcc」+ 清空选择
 */
export function ContactPickerPanel({
  contacts,
  recipients,
  onAddTo,
  onNotify,
  collapsed,
  onToggleCollapse,
  className,
}: ContactPickerPanelProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // 已加入收件人的 email 集合（用于「跳过已在 N 处」的提示）
  const addedEmails = useMemo(
    () => new Set(recipients.map((r) => r.email.toLowerCase())),
    [recipients],
  )

  // 分组聚合
  const groups = useMemo<ContactGroup[]>(() => {
    const map = new Map<string, ContactGroup>()
    for (const c of contacts) {
      const key = c.group_name?.trim() || "__ungrouped__"
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: key === "__ungrouped__" ? t("contacts.picker.ungrouped") : c.group_name,
          contacts: [],
        })
      }
      map.get(key)!.contacts.push(c)
    }
    // 排序：未分组在最后，其他按名字
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === "__ungrouped__") return 1
      if (b.key === "__ungrouped__") return -1
      return a.name.localeCompare(b.name, "zh-CN")
    })
  }, [contacts])

  // 搜索过滤
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => {
        const matchesGroup = g.name.toLowerCase().includes(q)
        const matchedContacts = g.contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q),
        )
        if (matchesGroup) return g
        if (matchedContacts.length === 0) return null
        return { ...g, contacts: matchedContacts }
      })
      .filter((g): g is ContactGroup => g !== null)
  }, [groups, search])

  const selectedContacts = useMemo(
    () => contacts.filter((c) => c.id != null && selectedIds.has(c.id)),
    [contacts, selectedIds],
  )

  const toggleOne = useCallback(
    (id: number) => {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [],
  )

  const toggleGroup = useCallback(
    (group: ContactGroup) => {
      const ids = group.contacts
        .map((c) => c.id)
        .filter((id): id is number => id != null)
      const allSelected = ids.every((id) => selectedIds.has(id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (allSelected) {
          ids.forEach((id) => next.delete(id))
        } else {
          ids.forEach((id) => next.add(id))
        }
        return next
      })
    },
    [selectedIds],
  )

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleAdd = useCallback(
    (kind: RecipientKind) => {
      if (selectedContacts.length === 0) {
        onNotify?.(t("contacts.picker.chooseFirst"), "info")
        return
      }
      const fresh = selectedContacts.filter(
        (c) => !addedEmails.has(c.email.toLowerCase()),
      )
      const skipped = selectedContacts.length - fresh.length
      onAddTo(fresh, kind)
      const where =
        kind === "to"
          ? t("contacts.recipients.to")
          : kind === "cc"
            ? t("contacts.recipients.cc")
            : t("contacts.recipients.bcc")
      const msg =
        skipped > 0
          ? t("contacts.picker.addSkip", { n: fresh.length, where, skip: skipped })
          : t("contacts.picker.addSuccess", { n: fresh.length, where })
      onNotify?.(msg, "success")
      setSelectedIds(new Set())
    },
    [selectedContacts, addedEmails, onAddTo, onNotify, t],
  )

  const toggleGroupCollapse = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        title={t("contacts.picker.expand")}
        className={cn(
          "fixed right-0 top-1/2 -translate-y-1/2 z-20 w-8 h-12",
          "bg-primary-600 text-white rounded-l-lg shadow-md",
          "flex items-center justify-center hover:bg-primary-700 transition-colors",
          className,
        )}
      >
        <Users size={16} />
      </button>
    )
  }

  return (
    <div
      className={cn(
        "w-[320px] shrink-0 flex flex-col bg-surface-50 dark:bg-surface-800",
        "border-l border-surface-200 dark:border-surface-700",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900">
        <Users size={14} className="text-primary-600" />
        <h3 className="text-sm font-semibold flex-1">{t("contacts.picker.title")}</h3>
        <span className="text-xs text-surface-400">
          {t("contacts.picker.selectedCount", { n: selectedIds.size })}
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          title={t("contacts.picker.collapse")}
          className="p-1 rounded hover:bg-surface-100 text-surface-500"
        >
          <X size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-surface-200 dark:border-surface-700">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("contacts.picker.searchPlaceholder")}
            className="w-full h-8 pl-8 pr-2 text-sm border border-surface-200 rounded-md focus:outline-none focus:border-primary-500"
          />
        </div>
      </div>

      {/* Group list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {filteredGroups.length === 0 ? (
          <div className="text-center text-xs text-surface-400 py-8">
            {contacts.length === 0
              ? t("contacts.picker.empty")
              : t("contacts.picker.noMatch")}
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.key)
            const ids = group.contacts
              .map((c) => c.id)
              .filter((id): id is number => id != null)
            const selectedInGroup = ids.filter((id) => selectedIds.has(id)).length
            const allChecked = ids.length > 0 && selectedInGroup === ids.length
            const partial = selectedInGroup > 0 && selectedInGroup < ids.length

            return (
              <div
                key={group.key}
                className="mb-1 rounded-md hover:bg-surface-100/60 dark:hover:bg-surface-700/30"
              >
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapse(group.key)}
                    className="p-0.5 text-surface-500"
                    aria-label={isCollapsed ? "expand" : "collapse"}
                  >
                    {isCollapsed ? (
                      <ChevronRight size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = partial
                    }}
                    onChange={() => toggleGroup(group)}
                    className="w-3.5 h-3.5 accent-primary-600 cursor-pointer"
                    aria-label="select all in group"
                  />
                  <span
                    className="flex-1 text-sm font-medium truncate cursor-pointer"
                    onClick={() => toggleGroupCollapse(group.key)}
                  >
                    {group.name}
                  </span>
                  <span className="text-[10px] text-surface-400 shrink-0">
                    {selectedInGroup > 0 ? `${selectedInGroup}/` : ""}
                    {group.contacts.length}
                  </span>
                </div>
                {!isCollapsed && (
                  <div className="ml-7 mb-1 space-y-0.5">
                    {group.contacts.map((c) => {
                      if (c.id == null) return null
                      const checked = selectedIds.has(c.id)
                      const alreadyAdded = addedEmails.has(c.email.toLowerCase())
                      return (
                        <label
                          key={c.id}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1 rounded cursor-pointer",
                            "hover:bg-white dark:hover:bg-surface-800",
                            alreadyAdded && "opacity-50",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(c.id!)}
                            className="w-3 h-3 accent-primary-600"
                            disabled={alreadyAdded}
                          />
                          <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                            {(c.name || c.email).charAt(0).toUpperCase()}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs font-medium truncate">
                              {c.name || c.email}
                            </span>
                            <span className="block text-[10px] text-surface-400 truncate">
                              {c.email}
                            </span>
                          </span>
                          {alreadyAdded && (
                            <span className="text-[9px] text-surface-400 italic">
                              {t("contacts.picker.added")}
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-2 space-y-1.5">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => handleAdd("to")}
            disabled={selectedContacts.length === 0}
            className="h-8 text-xs rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + {t("contacts.recipients.to")}
          </button>
          <button
            type="button"
            onClick={() => handleAdd("cc")}
            disabled={selectedContacts.length === 0}
            className="h-8 text-xs rounded-md border border-surface-300 hover:bg-surface-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + {t("contacts.recipients.cc")}
          </button>
          <button
            type="button"
            onClick={() => handleAdd("bcc")}
            disabled={selectedContacts.length === 0}
            className="h-8 text-xs rounded-md border border-surface-300 hover:bg-surface-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + {t("contacts.recipients.bcc")}
          </button>
        </div>
        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={clearSelection}
            className="w-full h-6 text-[11px] text-surface-500 hover:text-red-500"
          >
            {t("contacts.picker.clearSelection", { n: selectedIds.size })}
          </button>
        )}
      </div>
    </div>
  )
}
