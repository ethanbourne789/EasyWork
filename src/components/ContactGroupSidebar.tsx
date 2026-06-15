import { useState } from "react"
import { Plus, Pencil, Trash2, X, Check } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useMailStore, type MailContactGroup } from "@/stores/mail-store"
import * as mailIpc from "@/lib/mail-ipc"

interface ContactGroupSidebarProps {
  selectedGroupId: number | null // null = all, 0 = ungrouped
  onSelectGroup: (id: number | null) => void
  groupCounts: Record<number, number> // group_id -> contact count
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
    const group = contactGroups.find((g) => g.id === editingId)
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
          <span className="truncate flex-1 text-left">
            {t("contacts.group.all", "全部")}
          </span>
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
            <span className="truncate flex-1 text-left">
              {t("contacts.group.ungrouped", "未分组")}
            </span>
            <span className="text-[10px] text-surface-400">{groupCounts[0]}</span>
          </button>
        )}

        {/* Groups */}
        {contactGroups.map((group) => {
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
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit()
                      if (e.key === "Escape") setEditingId(null)
                    }}
                    className="flex-1 min-w-0 h-5 px-1 text-xs border border-primary-300 rounded bg-white dark:bg-surface-900"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveEdit}
                    className="text-primary-500 hover:text-primary-700"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-surface-400 hover:text-surface-600"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onSelectGroup(group.id ?? null)}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: group.color }}
                    />
                    <span className="truncate flex-1 text-left">{group.name}</span>
                    <span className="text-[10px] text-surface-400">{count}</span>
                  </button>
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={() => startEdit(group)}
                      className="text-surface-400 hover:text-primary-500 p-0.5"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => group.id && handleDeleteGroup(group.id)}
                      className="text-surface-400 hover:text-red-500 p-0.5"
                    >
                      <Trash2 size={11} />
                    </button>
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
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddGroup()
                if (e.key === "Escape") {
                  setShowAddInput(false)
                  setNewGroupName("")
                }
              }}
              placeholder={t("contacts.group.groupName", "分组名称")}
              className="flex-1 h-7 px-2 text-xs border border-primary-300 rounded-lg bg-white dark:bg-surface-900"
              autoFocus
            />
            <button
              onClick={handleAddGroup}
              className="text-primary-500 hover:text-primary-700 p-1"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => {
                setShowAddInput(false)
                setNewGroupName("")
              }}
              className="text-surface-400 hover:text-surface-600 p-1"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddInput(true)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-surface-500 dark:text-surface-400 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
          >
            <Plus size={14} />
            {t("contacts.group.newGroup", "新建分组")}
          </button>
        )}
      </div>
    </div>
  )
}
