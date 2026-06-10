import { useState } from "react"
import { Star, Paperclip, ChevronDown, ChevronUp } from "lucide-react"
import { ShadowDomEmail } from "./ShadowDomEmail"
import type { MailMessageSummary } from "@/stores/mail-store"

interface ThreadMessageBubbleProps {
  message: MailMessageSummary
  body: { body_text: string; body_html: string } | null
  isSelected: boolean
  onClick: () => void
}

/**
 * Individual message bubble in a thread view.
 * Shows sender avatar, header, and expandable body.
 */
export function ThreadMessageBubble({
  message,
  body,
  isSelected,
  onClick,
}: ThreadMessageBubbleProps) {
  const [expanded, setExpanded] = useState(false)

  const initial = (message.from_name || message.from_email).charAt(0).toUpperCase()
  const dateStr = formatDate(message.date)

  return (
    <div
      className={`rounded-xl border transition-shadow ${
        isSelected
          ? "border-primary-300 bg-primary-50/30 shadow-sm"
          : "border-surface-200 bg-white hover:shadow-sm"
      }`}
    >
      {/* Header */}
      <button
        onClick={() => { onClick(); setExpanded(!expanded) }}
        className="flex items-start gap-3 w-full px-4 py-3 text-left"
      >
        <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {message.from_name || message.from_email}
              </span>
              {message.is_starred && <Star size={12} className="text-amber-400 fill-amber-400" />}
              {message.has_attachment && <Paperclip size={12} className="text-surface-400" />}
            </div>
            <span className="text-[10px] text-surface-400 whitespace-nowrap ml-2">{dateStr}</span>
          </div>
          <p className="text-xs text-surface-500 mt-0.5">{message.from_email}</p>
        </div>
        <div className="text-surface-400 mt-1">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Body */}
      {expanded && body && (
        <div className="px-4 pb-4 border-t border-surface-100 pt-3">
          {body.body_html ? (
            <ShadowDomEmail html={body.body_html} />
          ) : (
            <div className="text-sm text-surface-600 whitespace-pre-wrap leading-relaxed">
              {body.body_text || "(无内容)"}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    } else if (diffDays === 1) {
      return "昨天"
    } else if (diffDays < 7) {
      return `${diffDays}天前`
    } else {
      return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
    }
  } catch {
    return dateStr.slice(0, 10)
  }
}
