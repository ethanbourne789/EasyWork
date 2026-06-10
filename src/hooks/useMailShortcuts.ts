import { useEffect } from "react"

export interface ShortcutHandlers {
  onNewCompose?: () => void
  onReply?: () => void
  onForward?: () => void
  onDelete?: () => void
  onArchive?: () => void
  onRefresh?: () => void
  onSearch?: () => void
}

/**
 * Global keyboard shortcuts for the email module.
 *
 * Shortcuts:
 *   N       - New compose
 *   R       - Reply (when a message is selected)
 *   F       - Forward (when a message is selected)
 *   D       - Delete selected message
 *   A       - Archive selected message
 *   Ctrl+F  - Focus search
 *   F5      - Refresh
 */
export function useMailShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in inputs/textareas/selects
      const tag = (e.target as HTMLElement).tagName
      const isEditable = ["INPUT", "TEXTAREA", "SELECT"].includes(tag)
      const isContentEditable = (e.target as HTMLElement).isContentEditable

      // Ctrl+F always works
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault()
        handlers.onSearch?.()
        return
      }

      // Don't trigger shortcuts when typing
      if (isEditable || isContentEditable) return

      // Single-key shortcuts
      switch (e.key.toLowerCase()) {
        case "n":
          e.preventDefault()
          handlers.onNewCompose?.()
          break
        case "r":
          e.preventDefault()
          handlers.onReply?.()
          break
        case "f":
          e.preventDefault()
          handlers.onForward?.()
          break
        case "d":
          e.preventDefault()
          handlers.onDelete?.()
          break
        case "a":
          e.preventDefault()
          handlers.onArchive?.()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handlers])
}
