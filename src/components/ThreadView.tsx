import { useMemo } from "react"
import { Mail, ArrowLeft } from "lucide-react"
import type { MailMessageSummary } from "@/stores/mail-store"
import { ThreadMessageBubble } from "./ThreadMessageBubble"

interface ThreadViewProps {
  threadId: string
  messages: MailMessageSummary[]
  onBack: () => void
  onSelectMessage: (id: number) => void
  selectedMessageId: number | null
  messageBodies: Record<number, { body_text: string; body_html: string } | null>
}

/**
 * Bubble-style threaded conversation view.
 * Groups messages by thread_id and displays them chronologically.
 */
export function ThreadView({
  threadId,
  messages,
  onBack,
  onSelectMessage,
  selectedMessageId,
  messageBodies,
}: ThreadViewProps) {
  // Filter messages belonging to this thread, sorted by date ascending
  const threadMessages = useMemo(() => {
    return messages
      .filter(m => m.thread_id === threadId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [messages, threadId])

  const threadSubject = threadMessages[0]?.subject || "会话"

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Thread header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-200 shrink-0 bg-surface-50">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-surface-200 text-surface-500"
          title="返回"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate">{threadSubject}</h3>
          <p className="text-xs text-surface-400">
            {threadMessages.length} 条消息
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {threadMessages.length === 0 && (
          <div className="flex items-center justify-center h-full text-surface-400">
            <div className="text-center">
              <Mail size={32} className="mx-auto mb-2 text-surface-300" />
              <p className="text-sm">没有消息</p>
            </div>
          </div>
        )}
        {threadMessages.map((msg) => {
          const body = messageBodies[msg.id]
          return (
            <ThreadMessageBubble
              key={msg.id}
              message={msg}
              body={body}
              isSelected={selectedMessageId === msg.id}
              onClick={() => onSelectMessage(msg.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
