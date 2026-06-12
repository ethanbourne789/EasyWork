import { useState, useRef, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import type { MailRecipient, RecipientKind } from "@/lib/parseAddressList"
import { splitPendingEmails, isValidEmail, parseAddressList } from "@/lib/parseAddressList"
import { RecipientChip, EmptyRecipientChip } from "./RecipientChip"
import { cn } from "@/lib/utils"

interface RecipientInputRowProps {
  /** 当前 kind 的所有收件人（其他 kind 会被过滤）。 */
  recipients: MailRecipient[]
  kind: RecipientKind
  /** Kind 中文/英文标签（用于占位）。 */
  label: string
  /** 行首点缀，e.g. Cc/Bcc 切换按钮。 */
  adornment?: React.ReactNode
  onChange: (next: MailRecipient[]) => void
  onSwitchKind?: (target: RecipientKind) => void
  /** Toast 回调：错误或重复通知。 */
  onNotify?: (msg: string, severity?: "info" | "error" | "success") => void
  /** 自动聚焦。 */
  autoFocus?: boolean
  className?: string
  placeholder?: string
}

/**
 * 收件人输入行。
 * - 上方一行：当前 kind 的所有 chip
 * - 下方：邮箱输入框（支持 ; , 空白分隔、Enter 提交）
 *
 * 拆分邮箱时（`splitPendingEmails`），valid 直接加入；invalid 通过 onNotify 通知。
 * 重复 email（已在当前 recipients 中存在）会被忽略并提示。
 */
export function RecipientInputRow({
  recipients,
  kind,
  label,
  adornment,
  onChange,
  onNotify,
  autoFocus = false,
  className,
  placeholder,
}: RecipientInputRowProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the underlying input
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus()
    }
  }, [autoFocus])

  const filtered = recipients.filter((r) => r.kind === kind)

  const commit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) return

      // First try parsing as full address list (handles "Name <email>; email2")
      const parsed = parseAddressList(trimmed, kind)
      if (parsed.length > 0) {
        // Append to current list, dedupe by email
        const existing = new Set(recipients.map((r) => r.email))
        const additions: MailRecipient[] = []
        let dupCount = 0
        for (const r of parsed) {
          if (existing.has(r.email)) {
            dupCount++
            continue
          }
          existing.add(r.email)
          additions.push(r)
        }
        if (additions.length > 0) {
          onChange([...recipients, ...additions])
        }
        if (dupCount > 0) {
          onNotify?.(t("contacts.recipients.duplicate", { n: dupCount }), "info")
        }
        setDraft("")
        return
      }

      // Fallback: split into valid/invalid
      const { valid, invalid } = splitPendingEmails(trimmed)
      if (valid.length > 0) {
        const existing = new Set(recipients.map((r) => r.email))
        const additions: MailRecipient[] = []
        let dupCount = 0
        for (const email of valid) {
          if (existing.has(email)) {
            dupCount++
            continue
          }
          existing.add(email)
          additions.push({ email, kind })
        }
        if (additions.length > 0) {
          onChange([...recipients, ...additions])
        }
        if (dupCount > 0) {
          onNotify?.(t("contacts.recipients.duplicate", { n: dupCount }), "info")
        }
      }
      if (invalid.length > 0) {
        onNotify?.(
          t("contacts.recipients.invalid", {
            emails: invalid.slice(0, 3).join(", ") + (invalid.length > 3 ? "…" : ""),
          }),
          "error",
        )
      }
      setDraft("")
    },
    [recipients, kind, onChange, onNotify, t],
  )

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault()
      commit(draft)
    } else if (e.key === "Backspace" && draft === "" && filtered.length > 0) {
      // Backspace on empty input → remove last chip
      const last = filtered[filtered.length - 1]
      onChange(recipients.filter((r) => r !== last))
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text")
    if (/[;,\s]/.test(text) || /@/.test(text)) {
      // Multi-address paste: commit immediately
      e.preventDefault()
      commit(text)
    }
  }

  const handleBlur = () => {
    if (draft.trim()) commit(draft)
  }

  const removeAt = (email: string) => {
    onChange(recipients.filter((r) => r.email !== email))
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 px-3 py-2 border-b border-surface-200 dark:border-surface-700",
        className,
      )}
    >
      <div className="flex items-start gap-2 min-h-[28px] flex-wrap">
        <span className="text-xs font-semibold text-surface-500 uppercase tracking-wide w-12 shrink-0 pt-1">
          {label}
        </span>
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {filtered.length === 0 && <EmptyRecipientChip kind={kind} />}
          {filtered.map((r) => (
            <RecipientChip
              key={r.email}
              recipient={r}
              onRemove={() => removeAt(r.email)}
            />
          ))}
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            onPaste={handlePaste}
            onBlur={handleBlur}
            placeholder={filtered.length > 0 ? "" : (placeholder ?? t("contacts.recipients.placeholder"))}
            className="flex-1 min-w-[120px] h-7 px-2 border-0 bg-transparent text-sm focus:outline-none placeholder:text-surface-400"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {adornment && <div className="shrink-0 pt-0.5">{adornment}</div>}
      </div>
    </div>
  )
}

/** 校验至少一个收件人。 */
export function hasAnyRecipient(recipients: MailRecipient[]): boolean {
  return recipients.some(
    (r) => r.kind === "to" && isValidEmail(r.email),
  )
}
