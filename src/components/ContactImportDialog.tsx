import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, X, Upload, FileText, AlertTriangle, CheckCircle2 } from "lucide-react"
import { parseVcf, type VcfContact } from "@/lib/vcf"
import * as mailIpc from "@/lib/mail-ipc"
import { useMailStore, type MailContact } from "@/stores/mail-store"

interface ContactImportDialogProps {
  /** 当前激活的邮箱账户 ID。null 时禁用导入按钮。 */
  accountId: number | null
  open: boolean
  onClose: () => void
  /** 导入成功后的回调（用于刷新列表等）。 */
  onImported?: (result: { imported: number; skipped: number }) => void
}

interface ImportRow {
  /** 内部稳定 key（用 email + index，VCF 没 email 时回退 name + index）。 */
  key: string
  /** 原始 VCF 解析结果。 */
  contact: VcfContact
  /** 用于提交的主邮箱（contacts.emails[0].value）。 */
  primaryEmail: string
  /** 第一个 group_name（来自 CATEGORIES）。 */
  groupName: string
  /** 用户当前是否勾选。 */
  selected: boolean
  /** 不可导入的原因：no_email | duplicate | null。 */
  reason: "no_email" | "duplicate" | null
}

interface ImportResult {
  imported: number
  skipped: number
}

/**
 * VCF 导入对话框。
 *
 * 流程：
 *   1. 用户选择 .vcf 文件
 *   2. 解析 → 表格预览（姓名 / 邮箱 / 分组 / 状态）
 *   3. 跳过：①无邮箱 ②与现有通讯录邮箱重复（同账户）
 *   4. 用户可单选/全选
 *   5. 点击「导入」批量调用 add_contact Tauri 命令
 *
 * 设计要点：
 *   - 纯前端解析，VCF 库复用 src/lib/vcf.ts（vCard 3.0/4.0）
 *   - 错误以红色 banner 显示（行号 + 原因）
 *   - 不修改 / 阻止 ContactsModal 的 CSV 路径，本对话框仅作为 VCF 入口
 */
export function ContactImportDialog({ accountId, open, onClose, onImported }: ContactImportDialogProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  // 每次打开对话框时重置状态
  useEffect(() => {
    if (open) {
      setRows([])
      setParseError(null)
      setResult(null)
      setParsing(false)
      setImporting(false)
    }
  }, [open])

  /** 重复检测需要现有联系人数据 — 仅在打开对话框后拉取一次。 */
  useEffect(() => {
    if (open && accountId) {
      mailIpc.listContacts(accountId).catch(() => [])
    }
  }, [open, accountId])

  const existingEmails = useMailStore((s) => s.contacts)
  const existingEmailSet = useMemo(
    () => new Set(existingEmails.map((c) => c.email.toLowerCase().trim()).filter(Boolean)),
    [existingEmails],
  )

  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true)
      setParseError(null)
      setResult(null)
      setRows([])
      try {
        const text = await file.text()
        const contacts = parseVcf(text)
        if (contacts.length === 0) {
          setParseError(t("contacts.importDialog.empty"))
          return
        }
        const next: ImportRow[] = contacts.map((c, i) => {
          const email = (c.emails[0]?.value || "").toLowerCase().trim()
          const group = c.categories[0] || ""
          let reason: ImportRow["reason"] = null
          if (!email) reason = "no_email"
          else if (existingEmailSet.has(email)) reason = "duplicate"
          return {
            key: email || `${c.fullName || "card"}-${i}`,
            contact: c,
            primaryEmail: email,
            groupName: group,
            selected: reason === null,
            reason,
          }
        })
        setRows(next)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setParseError(t("contacts.importDialog.parseError", { msg }))
      } finally {
        setParsing(false)
      }
    },
    [existingEmailSet, t],
  )

  /** 触发文件选择器点击。 */
  const pickFile = () => fileInputRef.current?.click()

  /** 解析后的总览统计。 */
  const stats = useMemo(() => {
    const total = rows.length
    const importable = rows.filter((r) => r.reason === null).length
    const noEmail = rows.filter((r) => r.reason === "no_email").length
    const duplicate = rows.filter((r) => r.reason === "duplicate").length
    const selected = rows.filter((r) => r.selected).length
    return { total, importable, noEmail, duplicate, selected }
  }, [rows])

  /** 切换单行的选中状态。 */
  const toggleRow = (key: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, selected: !r.selected } : r)))
  }

  /** 全选 / 取消全选 — 只对可导入行生效（no_email / duplicate 不可选）。 */
  const setAllSelected = (selected: boolean) => {
    setRows((prev) => prev.map((r) => (r.reason === null ? { ...r, selected } : r)))
  }

  /** 执行导入：循环 add_contact，统计结果。 */
  const handleImport = async () => {
    if (!accountId) return
    const selectedRows = rows.filter((r) => r.selected && r.reason === null)
    if (selectedRows.length === 0) return
    setImporting(true)
    let imported = 0
    let skipped = 0
    for (const row of selectedRows) {
      const c = row.contact
      const contact: MailContact = {
        account_id: accountId,
        name: c.fullName || c.structuredName?.given || c.emails[0]?.value || "",
        email: row.primaryEmail,
        phone: c.phones[0]?.value || "",
        group_name: row.groupName,
        notes: [c.organization, c.note].filter(Boolean).join(" — "),
      }
      try {
        await mailIpc.addContact(contact)
        imported++
      } catch {
        // 重复（unique 约束）/ 写入失败 → 计入 skipped
        skipped++
      }
    }
    setResult({ imported, skipped })
    setImporting(false)
    onImported?.({ imported, skipped })
    // 刷新 store 中的 contacts（去重检测集合）
    try {
      const refreshed = await mailIpc.listContacts(accountId)
      useMailStore.getState().setContacts(refreshed)
    } catch {
      /* ignore */
    }
  }

  if (!open) return null

  const selectedImportable = rows.filter((r) => r.selected && r.reason === null).length

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 dark:bg-black/70" onClick={onClose}>
      <div
        className="w-[560px] max-h-[85vh] overflow-auto bg-white dark:bg-surface-900 rounded-2xl shadow-2xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-surface-700 dark:text-surface-200">
            {t("contacts.importDialog.vcfTitle")}
          </h2>
          <button
            onClick={onClose}
            className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* Hint */}
        <p className="text-xs text-surface-500 dark:text-surface-400">
          {t("contacts.importDialog.vcfHint")}
        </p>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".vcf,text/vcard,text/x-vcard"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
            // allow re-selecting same file
            e.target.value = ""
          }}
        />

        {/* Drop zone / pick button */}
        {rows.length === 0 && !parsing && (
          <button
            type="button"
            onClick={pickFile}
            disabled={!accountId}
            className="w-full flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-xl text-surface-500 dark:text-surface-400 hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={28} />
            <span className="text-sm font-medium">{t("contacts.importDialog.clickToSelect")}</span>
            <span className="text-[11px] text-surface-400">.vcf / text/vcard</span>
          </button>
        )}

        {/* Parsing state */}
        {parsing && (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-surface-500 dark:text-surface-400">
            <Loader2 size={16} className="animate-spin" />
            {t("contacts.importDialog.parsing")}
          </div>
        )}

        {/* Parse error */}
        {parseError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{parseError}</span>
          </div>
        )}

        {/* Result banner */}
        {result && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-sm">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <span>
              {t("contacts.importDialog.done", { imported: result.imported, skipped: result.skipped })}
            </span>
          </div>
        )}

        {/* Parsed table */}
        {rows.length > 0 && (
          <>
            <div className="flex items-center justify-between text-xs text-surface-500 dark:text-surface-400">
              <span>{t("contacts.importDialog.parsedCount", { n: rows.length })}</span>
              <div className="flex items-center gap-3">
                <span>
                  {stats.duplicate > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {t("contacts.importDialog.duplicate", { n: stats.duplicate, defaultValue: `${stats.duplicate} 重复` })}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setAllSelected(true)}
                  className="hover:text-primary-500"
                  disabled={selectedImportable === stats.importable}
                >
                  {t("contacts.importDialog.selectAll")}
                </button>
                <span className="text-surface-300">/</span>
                <button
                  onClick={() => setAllSelected(false)}
                  className="hover:text-primary-500"
                  disabled={selectedImportable === 0}
                >
                  {t("contacts.importDialog.deselectAll")}
                </button>
              </div>
            </div>

            <div className="border border-surface-200 dark:border-surface-700 rounded-lg max-h-[40vh] overflow-y-auto divide-y divide-surface-100 dark:divide-surface-800">
              {rows.map((row) => {
                const disabled = row.reason !== null
                return (
                  <label
                    key={row.key}
                    className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${
                      disabled ? "opacity-60" : "hover:bg-surface-50 dark:hover:bg-surface-800/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={row.selected}
                      disabled={disabled}
                      onChange={() => toggleRow(row.key)}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {row.contact.fullName || row.contact.structuredName?.given || "(无姓名)"}
                        </span>
                        {row.reason === "no_email" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            {t("contacts.importDialog.noEmailSkip")}
                          </span>
                        )}
                        {row.reason === "duplicate" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            {t("contacts.importDialog.duplicateTag", { defaultValue: "重复" })}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-surface-500 dark:text-surface-400 truncate">
                        {row.primaryEmail || t("contacts.importDialog.skipNoEmail")}
                        {row.groupName && <span className="ml-2 text-surface-400">· {row.groupName}</span>}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  setRows([])
                  setResult(null)
                  setParseError(null)
                  pickFile()
                }}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                disabled={importing}
              >
                <FileText size={12} className="inline mr-1" />
                {t("contacts.importDialog.pickAnother")}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="h-8 px-3 text-xs rounded-md text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800"
                  disabled={importing}
                >
                  {t("mail.cancel")}
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || selectedImportable === 0}
                  className="h-8 px-3 text-xs rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center gap-1.5"
                >
                  {importing && <Loader2 size={12} className="animate-spin" />}
                  {t("contacts.importDialog.importCount", { n: selectedImportable })}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
