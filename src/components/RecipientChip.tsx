import { X, UserCircle2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { MailRecipient } from "@/lib/parseAddressList"
import { cn } from "@/lib/utils"

interface RecipientChipProps {
  recipient: MailRecipient
  onRemove: () => void
  /** 是否高亮显示（hover 选中效果）。 */
  highlighted?: boolean
  className?: string
}

/**
 * 收件人结构化芯片。
 * - 头像首字母（无头像时使用 lucide 图标）
 * - 主标签：`Name <email>` 截断到 ~200px
 * - 右侧 × 删除按钮
 */
export function RecipientChip({
  recipient,
  onRemove,
  highlighted = false,
  className,
}: RecipientChipProps) {
  const display = recipient.name
    ? `${recipient.name} <${recipient.email}>`
    : recipient.email
  const initial = (recipient.name ?? recipient.email).trim().charAt(0).toUpperCase() || "?"

  return (
    <span
      data-ew-recipient-chip
      data-email={recipient.email}
      data-kind={recipient.kind}
      className={cn(
        "inline-flex items-center gap-1.5 max-w-[240px] h-7 pl-1 pr-1 rounded-full text-xs",
        "border border-surface-200 bg-surface-50 text-surface-700",
        highlighted && "ring-2 ring-primary-300",
        className,
      )}
      title={display}
    >
      <span className="shrink-0 w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[10px] font-bold flex items-center justify-center">
        {initial}
      </span>
      <span className="truncate font-medium">{display}</span>
      <button
        type="button"
        aria-label="remove recipient"
        onClick={onRemove}
        className="shrink-0 w-5 h-5 rounded-full text-surface-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
      >
        <X size={12} />
      </button>
    </span>
  )
}

/**
 * 空态芯片：用于「还没有收件人」时的占位视觉提示。
 * 与 RecipientChip 等高便于对齐。
 */
export function EmptyRecipientChip({ kind }: { kind: "to" | "cc" | "bcc" }) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1.5 h-7 px-2 rounded-full text-xs text-surface-400 italic">
      <UserCircle2 size={14} />
      <span>
        {kind === "to"
          ? t("contacts.recipients.emptyTo")
          : kind === "cc"
            ? t("contacts.recipients.emptyCc")
            : t("contacts.recipients.emptyBcc")}
      </span>
    </span>
  )
}
