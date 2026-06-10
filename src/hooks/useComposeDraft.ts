import { useState, useCallback, useEffect, useRef } from "react"

const DRAFT_KEY = "easywork_mail_draft"

export interface DraftData {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  savedAt: number
  accountId: number | null
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

  const saveDraft = useCallback((data: Omit<DraftData, "savedAt">) => {
    const draft: DraftData = { ...data, savedAt: Date.now() }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    draftRef.current = draft
    setHasDraft(true)
  }, [])

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
