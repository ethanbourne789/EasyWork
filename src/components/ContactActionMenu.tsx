import { useEffect, useRef } from "react"
import { UserPlus, Mail, Reply } from "lucide-react"
import { useTranslation } from "react-i18next"

interface ContactActionMenuProps {
  name: string
  email: string
  position: { x: number; y: number }
  onClose: () => void
  onAddToContacts: () => void
  onViewMessages: () => void
  onReply: () => void
}

export function ContactActionMenu({
  name,
  email,
  position,
  onClose,
  onAddToContacts,
  onViewMessages,
  onReply,
}: ContactActionMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  // Calculate position to avoid overflow
  const menuWidth = 200
  const menuHeight = 140
  const x = Math.min(position.x, window.innerWidth - menuWidth - 8)
  const y = Math.min(position.y, window.innerHeight - menuHeight - 8)

  const display = name ? `${name} <${email}>` : email

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] w-[200px] bg-white dark:bg-surface-800 rounded-xl shadow-xl border border-surface-200 dark:border-surface-700 py-1"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-2 border-b border-surface-100 dark:border-surface-700">
        <p className="text-xs font-medium text-surface-700 dark:text-surface-200 truncate">{display}</p>
      </div>
      <button
        onClick={() => {
          onAddToContacts()
          onClose()
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
      >
        <UserPlus size={14} className="text-surface-400" />
        {t("contacts.actions.addToContacts", "添加到通讯录")}
      </button>
      <button
        onClick={() => {
          onViewMessages()
          onClose()
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
      >
        <Mail size={14} className="text-surface-400" />
        {t("contacts.actions.viewMessages", "查看往来邮件")}
      </button>
      <button
        onClick={() => {
          onReply()
          onClose()
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
      >
        <Reply size={14} className="text-surface-400" />
        {t("mail.reply", "回复")}
      </button>
    </div>
  )
}
