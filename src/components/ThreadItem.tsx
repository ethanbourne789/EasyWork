import { Star, Paperclip } from "lucide-react"
import type { MailMessageSummary } from "@/stores/mail-store"

interface ThreadItemProps {
  message: MailMessageSummary
  replyCount: number
  isSelected: boolean
  onClick: () => void
  onStar: () => void
}

/**
 * Thread item in the message list sidebar.
 * Shows the latest message in a thread with a reply count badge.
 */
export function ThreadItem({
  message,
  replyCount,
  isSelected,
  onClick,
  onStar,
}: ThreadItemProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-surface-50 ${
        isSelected ? "bg-primary-50/50" : ""
      } ${!message.is_read ? "bg-blue-50/30" : ""}`}
    >
      <button onClick={(e) => { e.stopPropagation(); onStar() }}>
        <Star size={14} className={message.is_starred ? "text-amber-400 fill-amber-400" : "text-surface-300"} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm ${!message.is_read ? "font-semibold" : ""} truncate`}>
              {message.from_name || message.from_email}
            </span>
            {replyCount > 0 && (
              <span className="text-[10px] bg-surface-200 text-surface-500 px-1.5 py-0.5 rounded-full shrink-0">
                {replyCount + 1}
              </span>
            )}
          </div>
          <span className="text-[10px] text-surface-400 whitespace-nowrap ml-2">
            {message.date.includes("T") ? message.date.split("T")[0] : message.date.slice(0, 10)}
          </span>
        </div>
        <p className={`text-sm mt-0.5 truncate ${!message.is_read ? "font-semibold" : ""}`}>
          {message.subject}
        </p>
        <div className="flex items-center gap-1 mt-1">
          {message.has_attachment && <Paperclip size={12} className="text-surface-400" />}
          {!message.is_read && <div className="w-2 h-2 rounded-full bg-primary-500" />}
        </div>
      </div>
    </div>
  )
}
