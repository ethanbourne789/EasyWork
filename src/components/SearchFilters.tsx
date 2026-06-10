import { useState } from "react"
import { SlidersHorizontal, Filter, Calendar } from "lucide-react"
import type { MailFolder } from "@/lib/mail-ipc"

export interface SearchFiltersState {
  from: string
  to: string
  subject: string
  dateFrom: string
  dateTo: string
  hasAttachment: boolean
  folderId: number | null
}

interface SearchFiltersProps {
  filters: SearchFiltersState
  onChange: (filters: SearchFiltersState) => void
  onClear: () => void
  folders: MailFolder[]
}

export function SearchFilters({ filters, onChange, onClear, folders }: SearchFiltersProps) {
  const [open, setOpen] = useState(false)
  const hasActive = filters.from || filters.to || filters.subject || filters.dateFrom || filters.dateTo || filters.hasAttachment || filters.folderId

  const update = (partial: Partial<SearchFiltersState>) => {
    onChange({ ...filters, ...partial })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
          hasActive ? "bg-primary-100 text-primary-700" : "text-surface-500 hover:bg-surface-100"
        }`}
      >
        <SlidersHorizontal size={12} />
        筛选
        {hasActive && <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-surface-200 rounded-lg shadow-lg z-50 p-3 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-surface-500 flex items-center gap-1"><Filter size={12} />高级筛选</span>
            {hasActive && <button onClick={onClear} className="text-xs text-red-500 hover:underline">清除</button>}
          </div>

          <FilterRow label="发件人">
            <input type="text" value={filters.from} onChange={e => update({ from: e.target.value })}
              placeholder="发件人包含..." className="flex-1 h-7 px-2 text-xs border border-surface-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </FilterRow>

          <FilterRow label="收件人">
            <input type="text" value={filters.to} onChange={e => update({ to: e.target.value })}
              placeholder="收件人包含..." className="flex-1 h-7 px-2 text-xs border border-surface-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </FilterRow>

          <FilterRow label="主题">
            <input type="text" value={filters.subject} onChange={e => update({ subject: e.target.value })}
              placeholder="主题包含..." className="flex-1 h-7 px-2 text-xs border border-surface-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </FilterRow>

          <FilterRow label={<Calendar size={12} />}>
            <input type="date" value={filters.dateFrom} onChange={e => update({ dateFrom: e.target.value })}
              className="flex-1 h-7 px-2 text-xs border border-surface-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500" />
            <span className="text-xs text-surface-400">—</span>
            <input type="date" value={filters.dateTo} onChange={e => update({ dateTo: e.target.value })}
              className="flex-1 h-7 px-2 text-xs border border-surface-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </FilterRow>

          <FilterRow label="文件夹">
            <select value={filters.folderId ?? ""} onChange={e => update({ folderId: e.target.value ? Number(e.target.value) : null })}
              className="flex-1 h-7 px-2 text-xs border border-surface-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500">
              <option value="">全部文件夹</option>
              {folders.filter(f => f.id).map(f => (
                <option key={f.id} value={f.id!}>{f.name}</option>
              ))}
            </select>
          </FilterRow>

          <label className="flex items-center gap-2 text-xs text-surface-600 cursor-pointer">
            <input type="checkbox" checked={filters.hasAttachment} onChange={e => update({ hasAttachment: e.target.checked })}
              className="rounded border-surface-300" />
            仅显示带附件的邮件
          </label>
        </div>
      )}

      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  )
}

function FilterRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-surface-400 w-12 shrink-0">{label}</span>
      {children}
    </div>
  )
}
