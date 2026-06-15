import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronUp } from "lucide-react"

interface RecipientListProps {
  to_list: string // JSON array string, e.g. '["a@x.com","b@x.com"]'
  cc_list: string // JSON array string
  onContactClick: (name: string, email: string, event: React.MouseEvent) => void
}

interface ParsedAddress {
  name: string
  email: string
}

function parseJsonAddressList(raw: string): ParsedAddress[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .map((item: string) => {
        // Handle "Name <email>" format
        const match = String(item).match(/^(.+?)\s*<(.+?)>$/)
        if (match) return { name: match[1].trim(), email: match[2].trim() }
        return { name: "", email: String(item).trim() }
      })
      .filter((a) => a.email)
  } catch {
    return []
  }
}

function AddressChip({
  name,
  email,
  onClick,
}: {
  name: string
  email: string
  onClick: (e: React.MouseEvent) => void
}) {
  const display = name || email
  const initial = display.charAt(0).toUpperCase() || "?"
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-xs border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-surface-700 dark:text-surface-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-300 dark:hover:border-primary-700 transition-colors cursor-pointer"
      title={name ? `${name} <${email}>` : email}
    >
      <span className="shrink-0 w-4 h-4 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-[9px] font-bold flex items-center justify-center">
        {initial}
      </span>
      <span className="truncate max-w-[160px]">{display}</span>
    </button>
  )
}

export function RecipientList({ to_list, cc_list, onContactClick }: RecipientListProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const toAddresses = parseJsonAddressList(to_list)
  const ccAddresses = parseJsonAddressList(cc_list)

  if (toAddresses.length === 0 && ccAddresses.length === 0) return null

  const totalAddresses = toAddresses.length + ccAddresses.length
  // Show expand button when there are many recipients (heuristic: > 6 addresses)
  const shouldShowToggle = totalAddresses > 6

  return (
    <div className="mt-2">
      <div className={`space-y-1.5 ${!expanded && shouldShowToggle ? "max-h-[4.5rem] overflow-hidden" : ""}`}>
        {toAddresses.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-xs text-surface-400 dark:text-surface-500 shrink-0 mt-0.5 w-10">
              {t("mail.to")}
            </span>
            <div className="flex flex-wrap gap-1">
              {toAddresses.map((a, i) => (
                <AddressChip
                  key={i}
                  name={a.name}
                  email={a.email}
                  onClick={(e) => onContactClick(a.name, a.email, e)}
                />
              ))}
            </div>
          </div>
        )}
        {ccAddresses.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-xs text-surface-400 dark:text-surface-500 shrink-0 mt-0.5 w-10">
              {t("mail.cc")}
            </span>
            <div className="flex flex-wrap gap-1">
              {ccAddresses.map((a, i) => (
                <AddressChip
                  key={i}
                  name={a.name}
                  email={a.email}
                  onClick={(e) => onContactClick(a.name, a.email, e)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {shouldShowToggle && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 ml-12 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1 transition-colors cursor-pointer"
        >
          {expanded ? (
            <>
              <ChevronUp size={12} />
              {t("mail.collapse", "收起")}
            </>
          ) : (
            <>
              <ChevronDown size={12} />
              {t("mail.expand", "展开")}
            </>
          )}
        </button>
      )}
    </div>
  )
}
