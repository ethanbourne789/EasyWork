import { useState, useEffect, useRef } from "react"
import type { MailContact } from "@/stores/mail-store"

interface ContactAutocompleteProps {
  value: string
  onChange: (value: string) => void
  contacts: MailContact[]
  placeholder?: string
  className?: string
}

/**
 * Autocomplete input for email recipients.
 * Matches against contact name and email as the user types.
 * Supports multiple recipients separated by semicolons.
 */
export function ContactAutocomplete({
  value,
  onChange,
  contacts,
  placeholder = "收件人邮箱",
  className = "",
}: ContactAutocompleteProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [cursorPos, setCursorPos] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Extract the current word being typed (last segment after last semicolon)
  const segments = value.split(";")
  const lastSegment = segments[segments.length - 1]?.trim() || ""
  const prefix = segments.length > 1 ? segments.slice(0, -1).join(";") + "; " : ""

  // Filter contacts based on last segment
  const suggestions = lastSegment.length > 0
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(lastSegment.toLowerCase()) ||
        c.email.toLowerCase().includes(lastSegment.toLowerCase())
      ).slice(0, 5)
    : []

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const handleSelect = (contact: MailContact) => {
    const displayValue = `${contact.name} <${contact.email}>`
    const newValue = prefix + displayValue + "; "
    onChange(newValue)
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  const displayValue = value

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={e => {
          onChange(e.target.value)
          setShowDropdown(true)
          setCursorPos(e.target.selectionStart || 0)
        }}
        onFocus={() => lastSegment.length > 0 && setShowDropdown(true)}
        placeholder={placeholder}
        className="w-full h-10 px-2 border-0 text-sm focus:outline-none bg-transparent"
        autoComplete="off"
      />
      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full mt-1 bg-white border border-surface-200 rounded-lg shadow-lg z-50 max-h-48 overflow-auto"
        >
          {suggestions.map(c => (
            <button
              key={c.id || c.email}
              onClick={() => handleSelect(c)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-surface-50 text-left"
            >
              <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700 shrink-0">
                {c.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-surface-400 truncate">{c.email}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
