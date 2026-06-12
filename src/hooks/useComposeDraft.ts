import { useState, useCallback, useEffect, useRef } from "react"
import type { MailRecipient } from "@/lib/parseAddressList"

const DRAFT_KEY = "easywork_mail_draft"

/**
 * 草稿数据结构。
 *
 * v1.1 兼容：
 * - 旧版本只有 to/cc/bcc 三个字符串。读取时若无 recipients 则从
 *   字符串降级解析。
 * - 写入时同时持久化 recipients 和 to/cc/bcc 字符串（双轨：老版本
 *   客户端读取也不会丢数据）。
 */
export interface DraftData {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  savedAt: number
  accountId: number | null
  /** v1.1: 结构化收件人（优先于 to/cc/bcc 字符串）。 */
  recipients?: MailRecipient[]
}

export function useComposeDraft() {
  const [hasDraft, setHasDraft] = useState(false)
  const draftRef = useRef<DraftData | null>(null)

  // Check for existing draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft: DraftData = JSON.parse(raw)
        if (draft.to || draft.subject || draft.body) {
          setHasDraft(true)
          draftRef.current = draft
        }
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY)
    }
  }, [])

  const saveDraft = useCallback(
    (data: Omit<DraftData, "savedAt">) => {
      const draft: DraftData = { ...data, savedAt: Date.now() }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      draftRef.current = draft
      setHasDraft(true)
    },
    [],
  )

  const loadDraft = useCallback((): DraftData | null => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }, [])

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY)
    draftRef.current = null
    setHasDraft(false)
  }, [])

  return { hasDraft, saveDraft, loadDraft, clearDraft, draftRef }
}
