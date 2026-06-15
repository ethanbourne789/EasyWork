import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useMailStore, type MailAccount, type MailContact } from "@/stores/mail-store"
import { useSidebarStore } from "@/stores/sidebar-store"
import * as mailIpc from "@/lib/mail-ipc"
import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useTranslation } from "react-i18next"
import "@/lib/i18n"
import {
  Search, Star, Paperclip, Inbox, Send, Archive, Trash2, Plus, Settings,
  RefreshCw, X, Reply, Forward, Trash,
  Mail, Users, FileText, Loader2, CheckCircle2, AlertCircle, CheckCheck,
  AlertTriangle, ChevronDown, Download, Menu, PanelLeftClose, PanelLeft, Pencil,
  Upload,
} from "lucide-react"
import { ShadowDomEmail } from "@/components/ShadowDomEmail"
import { RichTextEditor } from "@/components/RichTextEditor"
import { SearchFilters, type SearchFiltersState } from "@/components/SearchFilters"
import { useComposeDraft } from "@/hooks/useComposeDraft"
import { useMailShortcuts } from "@/hooks/useMailShortcuts"
import { RecipientInputRow, hasAnyRecipient } from "@/components/RecipientInputRow"
import { ContactPickerPanel } from "@/components/ContactPickerPanel"
import { ContactImportDialog } from "@/components/ContactImportDialog"
import { parseAddressList, renderRecipientList, type MailRecipient, type RecipientKind } from "@/lib/parseAddressList"
import { serializeVcf, type VcfContact } from "@/lib/vcf"
import { ContactGroupSidebar } from "@/components/ContactGroupSidebar"
import { ContactActionMenu } from "@/components/ContactActionMenu"
import { RecipientList } from "@/components/RecipientList"

// ==================== Provider Auto-Detect ====================

const PROVIDER_CONFIGS: Record<string, { imap: string; imapPort: number; smtp: string; smtpPort: number }> = {
  "gmail.com": { imap: "imap.gmail.com", imapPort: 993, smtp: "smtp.gmail.com", smtpPort: 465 },
  "qq.com": { imap: "imap.qq.com", imapPort: 993, smtp: "smtp.qq.com", smtpPort: 465 },
  "163.com": { imap: "imap.163.com", imapPort: 993, smtp: "smtp.163.com", smtpPort: 465 },
  "126.com": { imap: "imap.126.com", imapPort: 993, smtp: "smtp.126.com", smtpPort: 465 },
  "outlook.com": { imap: "outlook.office365.com", imapPort: 993, smtp: "smtp.office365.com", smtpPort: 587 },
  "hotmail.com": { imap: "outlook.office365.com", imapPort: 993, smtp: "smtp.office365.com", smtpPort: 587 },
  "live.com": { imap: "outlook.office365.com", imapPort: 993, smtp: "smtp.office365.com", smtpPort: 587 },
  "foxmail.com": { imap: "imap.qq.com", imapPort: 993, smtp: "smtp.qq.com", smtpPort: 465 },
  "aliyun.com": { imap: "imap.aliyun.com", imapPort: 993, smtp: "smtp.aliyun.com", smtpPort: 465 },
  "sina.com": { imap: "imap.sina.com", imapPort: 993, smtp: "smtp.sina.com", smtpPort: 465 },
  "yeah.net": { imap: "imap.yeah.net", imapPort: 993, smtp: "smtp.yeah.net", smtpPort: 465 },
  "sohu.com": { imap: "imap.sohu.com", imapPort: 993, smtp: "smtp.sohu.com", smtpPort: 465 },
}

function detectProvider(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() || ""
  return PROVIDER_CONFIGS[domain] || null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Format a stored ISO date (YYYY-MM-DD HH:MM:SS) or a raw email date header
 *  into a consistent short display format.
 *
 *  Backend parser (`mail/parser.rs::normalize_rfc2822_date`) stores dates as
 *  `YYYY-MM-DD HH:MM:SS` UTC. Some legacy rows may still hold the raw RFC
 *  2822 form. We handle both here, defending against:
 *    - `Wed, 10 Jun 2026 15:57:48 +0000 (UTC)`   — `(UTC)` suffix
 *    - `Tue, 12 May 2026 10:02:24 +0800 (CST)`   — `(CST)` suffix
 *    - `Wed, 13 May 2026 06:06:16 GMT`           — obsolete zone name
 */
function formatMailDate(dateStr: string): string {
  if (!dateStr) return ""
  try {
    let d: Date | null = null

    // Case 1: already-ISO (the new normal from the backend)
    // Backend stores local time WITHOUT timezone info (e.g. "2026-06-15 11:22:08" in CST).
    // We must NOT append "Z" — that would treat local time as UTC and shift by timezone offset.
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/.test(dateStr)) {
      // Parse as local time by constructing Date from components
      const parts = dateStr.replace(" ", "T").split("T")
      const datePart = parts[0]
      const timePart = parts[1] || "00:00:00"
      const [y, m, day] = datePart.split("-").map(Number)
      const [h, min, sec] = timePart.split(":").map(Number)
      d = new Date(y, m - 1, day, h || 0, min || 0, sec || 0)
    }

    // Case 2: strip a trailing `(ZoneName)` and try RFC 2822
    if (!d || isNaN(d.getTime())) {
      const stripped = dateStr.replace(/\s*\([^)]*\)\s*$/, "").trim()
      d = new Date(stripped)
    }

    // Case 3: replace all `(...)` zones inline and try again
    if (!d || isNaN(d.getTime())) {
      const cleaned = dateStr.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim()
      d = new Date(cleaned)
    }

    if (!d || isNaN(d.getTime())) {
      // Last-resort: just show the raw value, trimmed
      return dateStr.slice(0, 16).trim()
    }

    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = diffMs / 86400000

    // Today → show time only
    if (diffDays < 1 && d.getDate() === now.getDate() && d.getMonth() === now.getMonth()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
    // Within 7 days → show weekday
    if (diffDays >= 0 && diffDays < 7) {
      return d.toLocaleDateString([], { weekday: "short" })
    }
    // Future within a week, or anything else this year → month + day
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString([], { month: "short", day: "numeric" })
    }
    // Older → year included
    return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })
  } catch {
    return dateStr.slice(0, 16).trim()
  }
}

function stripHtml(html: string): string {
  const div = document.createElement("div")
  div.innerHTML = html
  return div.textContent || div.innerText || ""
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// ==================== Folder i18n ====================

const FOLDER_ROLE_ORDER: Record<string, number> = {
  inbox: 0, sent: 1, drafts: 2, trash: 3, junk: 4, archive: 5,
}

const FOLDER_ROLE_LABELS_ZH: Record<string, string> = {
  inbox: "收件箱", sent: "已发送", drafts: "草稿箱", trash: "垃圾箱", junk: "垃圾邮件", archive: "归档",
}

const FOLDER_ROLE_LABELS_EN: Record<string, string> = {
  inbox: "Inbox", sent: "Sent", drafts: "Drafts", trash: "Trash", junk: "Junk", archive: "Archive",
}

// ==================== Toast Notification ====================

function Toast({ message, type, onClose }: { message: string; type: "success" | "error" | "info"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm animate-in slide-in-from-bottom-4 ${
      type === "success" ? "bg-emerald-600 text-white"
        : type === "info" ? "bg-sky-600 text-white"
        : "bg-red-600 text-white"
    }`}>
      {type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
    </div>
  )
}

// ==================== Account Settings Modal ====================

function AccountSettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { accounts, addAccount: addAccountLocal, removeAccount: removeAccountLocal, updateAccount: updateAccountLocal, setAccounts, activeAccountId, setActiveAccountId } = useMailStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<MailAccount>({
    email: "", provider: "imap", imap_host: "", imap_port: 993,
    smtp_host: "", smtp_port: 465, username: "", password: "",
    use_tls: true, sync_interval_secs: 300, sync_period_days: 30,
  })
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savePhase, setSavePhase] = useState<"idle" | "writing" | "testing" | "syncing">("idle")
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mailIpc.listAccounts().then(ba => { if (ba.length > 0) setAccounts(ba) }).catch(() => {})
  }, [setAccounts])

  const handleEmailBlur = useCallback(async () => {
    if (!form.email.includes("@")) return
    if (!form.username.trim()) {
      const defaultName = form.email.split("@")[0] || ""
      setForm(f => ({ ...f, username: defaultName }))
    }
    // 1. Try the local preset list first (instant).
    const provider = detectProvider(form.email)
    if (provider) {
      setForm(f => ({ ...f, imap_host: provider.imap, imap_port: provider.imapPort, smtp_host: provider.smtp, smtp_port: provider.smtpPort, provider: "imap" }))
      return
    }
    // 2. Fall back to Mozilla autoconfig discovery (network).
    try {
      const cfg = await mailIpc.autodiscoverAccount(form.email)
      if (cfg.imap || cfg.smtp) {
        // BUG-13 fix: Map socket_type to use_tls
        // "ssl" and "starttls" → use_tls=true, "none" → use_tls=false
        const socketType = cfg.imap?.socket_type || cfg.smtp?.socket_type || "ssl"
        const useTls = socketType !== "none"
        setForm(f => ({
          ...f,
          imap_host: cfg.imap?.hostname || f.imap_host,
          imap_port: cfg.imap?.port || f.imap_port,
          smtp_host: cfg.smtp?.hostname || f.smtp_host,
          smtp_port: cfg.smtp?.port || f.smtp_port,
          use_tls: useTls,
          provider: "imap",
        }))
        console.log("Auto-configured from", cfg.source)
      }
    } catch (e) {
      // Silent fail — user can fill in manually
    }
  }, [form.email])

  // 保存流程状态机：idle → writing → testing → syncing → idle
  // 每阶段独立超时，互不阻塞；任何阶段失败均可回滚或重试
  const handleAdd = async () => {
    // ── 阶段 0: 前端校验（同步、快速） ──
    if (!form.email.includes("@")) { setError("请输入有效的邮箱地址"); return }
    if (!form.imap_host.trim()) { setError("请输入 IMAP 服务器地址"); return }
    if (!form.smtp_host.trim()) { setError("请输入 SMTP 服务器地址"); return }
    if (!form.password.trim()) { setError("请输入密码或授权码"); return }

    // 进入写入阶段
    setSaving(true)
    setSavePhase("writing")
    setError(null)
    setSyncResult(null)
    setTestResult(null)

    // 编辑模式：跳过测试连接直接更新（密码空时后端保留原密码）
    if (editingId) {
      try {
        await mailIpc.updateAccount({ ...form, id: editingId })
        updateAccountLocal({ ...form, id: editingId })
        setEditingId(null)
        setShowAdd(false)
        setForm({ email: "", provider: "imap", imap_host: "", imap_port: 993, smtp_host: "", smtp_port: 465, username: "", password: "", use_tls: true, sync_interval_secs: 300, sync_period_days: 30 })
        setSyncResult("账户已更新（如修改了密码请点击「测试连接」验证）")
        setSavePhase("idle")
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("update_account failed:", msg)
        setError(`更新失败: ${msg}`)
        setSavePhase("idle")
      } finally {
        setSaving(false)
      }
      return
    }

    // ── 新建模式：两阶段提交 + 后续同步分离 ──
    let insertedId: number | null = null
    try {
      // ── 阶段 A: 写入数据库（极快，应 < 200ms） ──
      insertedId = await mailIpc.addAccount(form)
      setSavePhase("testing")

      // ── 阶段 B: 测试连接（最慢，单独 10 秒超时保护） ──
      let connResult: string
      try {
        connResult = await Promise.race([
          mailIpc.testConnection(form),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("连接测试超时（10秒）")), 10000)
          ),
        ])
      } catch (testErr) {
        const testMsg = testErr instanceof Error ? testErr.message : "连接测试失败"
        setError(`账户已保存（id=${insertedId}），但连接测试失败：${testMsg}\n请在账户列表中点击「测试连接」重试`)
        // 不删除账户（已保存成功），让用户可手动重试
        setTestResult(testMsg)
        setSavePhase("idle")
        setSaving(false)
        return
      }

      setTestResult(connResult)
      const ok = connResult.includes("成功")
      if (!ok) {
        setError(connResult)
        // 测试失败，提示用户是否删除刚保存的账户
        const shouldDelete = confirm(
          `连接测试未通过：${connResult}\n\n是否删除已保存的账户？\n（点取消可保留并稍后手动测试）`
        )
        if (shouldDelete) {
          try {
            await mailIpc.deleteAccount(insertedId)
          } catch (rollbackErr) {
            const rmsg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
            console.error("rollback failed:", rmsg)
            setError(prev => `${prev}\n警告：回滚失败 (id=${insertedId})，请在账户管理中手动删除`)
          }
        } else {
          // 保留账户，标记为可手动重试
          addAccountLocal({ ...form, id: insertedId })
        }
        setSavePhase("idle")
        setSaving(false)
        return
      }

      // ── 阶段 C: 全部成功，加入本地状态 ──
      addAccountLocal({ ...form, id: insertedId })
      setActiveAccountId(insertedId!)
      setSyncResult("账户已添加")
      setShowAdd(false)
      onClose()
      setForm({ email: "", provider: "imap", imap_host: "", imap_port: 993, smtp_host: "", smtp_port: 465, username: "", password: "", use_tls: true, sync_interval_secs: 300, sync_period_days: 30 })

      // ── 阶段 D: 后台同步（不阻塞 UI，单独 setTimeout 0 让弹窗先关闭） ──
      setSavePhase("syncing")
      setTimeout(() => {
        mailIpc.syncAccount(insertedId!)
          .then(() => {
            mailIpc.fetchMessages(insertedId!)
              .then(result => { useMailStore.getState().setMessages(result.messages) })
              .catch(err => console.warn("fetchMessages after add failed:", err))
            setSyncResult("账户已添加，首次同步完成")
          })
          .catch(err => {
            console.warn("syncAccount after add failed:", err)
            setSyncResult("账户已添加（首次同步失败，可手动重试）")
          })
          .finally(() => {
            setSavePhase("idle")
            setSaving(false)
          })
      }, 0)
      // 立即把 saving 置 false（同步已在后台跑，不阻塞关闭）
      setSaving(false)
    } catch (err: unknown) {
      // 写入阶段或之前抛出：尚未有 insertedId，或 addAccount 本身失败
      const msg = err instanceof Error ? err.message : String(err)
      console.error("add_account failed:", msg)
      setError(`保存失败: ${msg}`)
      // 若已插入但后续报错，仍尝试回滚
      if (insertedId != null) {
        try {
          await mailIpc.deleteAccount(insertedId)
        } catch (rollbackErr) {
          const rmsg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
          console.error("rollback failed:", rmsg)
          setError(prev => `${prev}\n警告：回滚失败 (id=${insertedId})，请手动删除`)
        }
      }
      setSavePhase("idle")
      setSaving(false)
    }
  }

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleRemove = async (id: number) => {
    if (id == null) {
      setError(t("account.invalidId", "无法删除：账户 ID 无效"))
      return
    }
    setDeleting(true); setError(null)
    try {
      await mailIpc.deleteAccount(id)
      removeAccountLocal(id)
      setDeleteConfirmId(null)
      setSyncResult(t("account.deleteSuccess"))
      setError(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("delete_account failed:", msg)
      setError(`${t("account.deleteFailed", "删除失败")}: ${msg}`)
    } finally {
      setDeleting(false)
    }
  }

  const [editingId, setEditingId] = useState<number | null>(null)

  const startEdit = (acc: MailAccount) => {
    setEditingId(acc.id ?? null)
    setForm({
      email: acc.email, provider: acc.provider || "imap",
      imap_host: acc.imap_host, imap_port: acc.imap_port,
      smtp_host: acc.smtp_host, smtp_port: acc.smtp_port,
      username: acc.username, password: "",
      use_tls: acc.use_tls ?? true, sync_interval_secs: acc.sync_interval_secs ?? 300, sync_period_days: acc.sync_period_days ?? 30,
    })
    setShowAdd(true); setError(null); setTestResult(null)
  }

  const cancelEdit = () => {
    setEditingId(null); setShowAdd(false); setForm({ email: "", provider: "imap", imap_host: "", imap_port: 993, smtp_host: "", smtp_port: 465, username: "", password: "", use_tls: true, sync_interval_secs: 300, sync_period_days: 30 }); setError(null); setTestResult(null)
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const result = await Promise.race([
        mailIpc.testConnection(form),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("连接测试超时（15秒）")), 15000))
      ])
      setTestResult(result)
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : "连接失败")
    }
    finally { setTesting(false) }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/70" onClick={onClose}>
      <div className="w-[560px] max-h-[85vh] overflow-auto bg-white dark:bg-surface-900 rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("account.title")}</h2>
          <button onClick={onClose} className="text-surface-400 dark:text-surface-500 dark:text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 dark:text-surface-300"><X size={20} /></button>
        </div>

        {accounts.length === 0 && !showAdd && (
          <div className="text-center py-8">
            <Mail size={40} className="mx-auto text-surface-300 dark:text-surface-500 dark:text-surface-400 mb-3" />
            <p className="text-surface-500 dark:text-surface-400 font-medium">{t("account.noAccounts")}</p>
            <p className="text-surface-400 dark:text-surface-500 dark:text-surface-400 text-sm mt-1 mb-4">{t("account.noAccountsHint")}</p>
            <Button onClick={() => setShowAdd(true)}><Plus size={16} />{t("account.addAccount")}</Button>
          </div>
        )}

        {accounts.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-surface-500 dark:text-surface-400">邮箱账号</span>
              <Button size="sm" variant="outline" onClick={() => { setShowAdd(true) }}><Plus size={14} />{t("account.addAccount")}</Button>
            </div>

            {accounts.map(acc => (
              <Card key={acc.id} className={activeAccountId === acc.id ? "ring-2 ring-primary-500" : ""}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => acc.id && setActiveAccountId(acc.id)}>
                    <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold">{acc.email.charAt(0).toUpperCase()}</div>
                    <div>
                      <p className="font-medium text-sm">
                        {acc.email}
                        {acc.username && acc.username !== acc.email.split("@")[0] && (
                          <span className="ml-2 text-xs text-primary-500 bg-primary-50 dark:bg-primary-900/30 dark:text-primary-300 px-1.5 py-0.5 rounded">{acc.username}</span>
                        )}
                      </p>
                      <p className="text-xs text-surface-400 dark:text-surface-500 dark:text-surface-400">IMAP: {acc.imap_host}:{acc.imap_port}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {activeAccountId === acc.id && <Badge variant="success">{t("account.current")}</Badge>}
                    <Button variant="ghost" size="icon" onClick={() => startEdit(acc)} title="编辑"><Pencil size={14} className="text-surface-400 dark:text-surface-500 dark:text-surface-400 hover:text-blue-500" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(acc.id ?? null)} title="删除"><Trash2 size={14} className="text-surface-400 dark:text-surface-500 dark:text-surface-400 hover:text-red-500" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}

        {deleteConfirmId != null && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-3">
            <p className="text-sm text-red-700 dark:text-red-300 font-medium">
              {t("account.deleteConfirm")}<br />
              <span className="font-normal text-xs">{t("account.deleteConfirmHint")}</span>
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" onClick={() => handleRemove(deleteConfirmId)} disabled={deleting}>
                {deleting && <Loader2 size={14} className="animate-spin" />}
                {deleting ? t("account.deleting") : t("account.deleteConfirmBtn")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>{t("mail.cancel")}</Button>
            </div>
          </div>
        )}

        {showAdd && (
          <div className="space-y-3 border border-primary-200 dark:border-primary-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{editingId ? "编辑账号" : t("account.addAccount")}</h3>
              {editingId && (
                <Button size="sm" variant="ghost" onClick={cancelEdit}>{t("mail.cancel")}</Button>
              )}
            </div>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} onBlur={handleEmailBlur} placeholder="example@gmail.com" className="w-full h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 dark:focus:ring-primary-400" />
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder={t("account.displayName") + "（如: 工作、个人）"} className="h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 dark:focus:ring-primary-400" />
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={t("account.password")} className="h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 dark:focus:ring-primary-400" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={form.imap_host} onChange={e => setForm(f => ({ ...f, imap_host: e.target.value }))} placeholder={t("account.imapServer")} className="h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 dark:focus:ring-primary-400" />
              <input type="number" value={form.imap_port} onChange={e => setForm(f => ({ ...f, imap_port: Number(e.target.value) }))} placeholder={t("account.imapPort")} className="h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 dark:focus:ring-primary-400" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={form.smtp_host} onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))} placeholder={t("account.smtpServer")} className="h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 dark:focus:ring-primary-400" />
              <input type="number" value={form.smtp_port} onChange={e => setForm(f => ({ ...f, smtp_port: Number(e.target.value) }))} placeholder={t("account.smtpPort")} className="h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 dark:focus:ring-primary-400" />
            </div>
            {testResult && <div className={`text-xs p-2 rounded ${testResult.includes("成功") ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"}`}>{testResult}</div>}
            {error && <div className="text-xs p-2 rounded bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">{error}</div>}
            {syncResult && <div className="text-xs p-2 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">{syncResult}</div>}
            <div className="flex gap-2 items-center">
              <Button size="sm" onClick={handleAdd} disabled={saving}>
                {saving && <Loader2 size={14} className="animate-spin mr-1" />}
                {savePhase === "writing" ? "保存中..." :
                 savePhase === "testing" ? "测试连接..." :
                 savePhase === "syncing" ? "后台同步..." :
                 editingId ? "保存修改" : t("account.save")}
              </Button>
              <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || saving}>
                {testing && <Loader2 size={14} className="animate-spin mr-1" />}
                {testing ? "测试中..." : t("account.testConnection")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setError(null); setEditingId(null) }} disabled={saving}>{t("mail.cancel")}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== Contacts Modal ====================

function ContactsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { contacts, setContacts, activeAccountId, contactGroups, setContactGroups } = useMailStore()
  const [showAdd, setShowAdd] = useState(false)
  const [editingContact, setEditingContact] = useState<MailContact | null>(null)
  const [form, setForm] = useState({ name: "", email: "", phone: "", group_id: null as number | null, notes: "" })
  const [saving, setSaving] = useState(false)
  const [showVcfImport, setShowVcfImport] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)

  // Load contacts and groups on mount / account change
  useEffect(() => {
    if (activeAccountId) {
      mailIpc.listContacts(activeAccountId).then(setContacts).catch(() => {})
      mailIpc.listContactGroups(activeAccountId).then(setContactGroups).catch(() => {})
    }
  }, [activeAccountId, setContacts, setContactGroups])

  const refreshAll = useCallback(() => {
    if (!activeAccountId) return
    mailIpc.listContacts(activeAccountId).then(setContacts).catch(() => {})
    mailIpc.listContactGroups(activeAccountId).then(setContactGroups).catch(() => {})
  }, [activeAccountId, setContacts, setContactGroups])

  const handleAdd = async () => {
    if (!activeAccountId) return; setSaving(true)
    try {
      await mailIpc.addContact({ account_id: activeAccountId, name: form.name, display_name: form.name, email: form.email, phone: form.phone, group_id: form.group_id, group_name: "", notes: form.notes })
      await refreshAll()
      setShowAdd(false); setForm({ name: "", email: "", phone: "", group_id: null, notes: "" })
    } catch {} finally { setSaving(false) }
  }

  const handleEdit = async () => {
    if (!editingContact?.id) return; setSaving(true)
    try {
      await mailIpc.updateContact({ ...editingContact, name: form.name, display_name: form.name, email: form.email, phone: form.phone, group_id: form.group_id, group_name: "", notes: form.notes })
      await refreshAll()
      setEditingContact(null); setForm({ name: "", email: "", phone: "", group_id: null, notes: "" })
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    try { await mailIpc.deleteContact(id); await refreshAll() } catch {}
  }

  const openEdit = (c: MailContact) => {
    setEditingContact(c)
    setForm({ name: c.name, email: c.email, phone: c.phone, group_id: c.group_id ?? null, notes: c.notes })
  }

  const defaultContacts: MailContact[] = [
    { id: 1, account_id: 0, name: "张伟", email: "zhangwei@example.com", phone: "13800138000", group_name: "同事", notes: "" },
    { id: 2, account_id: 0, name: "李娜", email: "lina@example.com", phone: "13900139000", group_name: "朋友", notes: "" },
  ]

  const handleExportContacts = () => {
    const list = contacts.length > 0 ? contacts : defaultContacts
    const header = "姓名,邮箱,电话,分组,备注"
    const rows = list.map(c => {
      const groupName = c.group_id ? (contactGroups.find(g => g.id === c.group_id)?.name || "") : (c.group_name || "")
      return `"${c.name}","${c.email}","${c.phone}","${groupName}","${(c.notes || "").replace(/"/g, '""')}"`
    })
    const csv = [header, ...rows].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `contacts_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const handleExportVcf = () => {
    const list = contacts.length > 0 ? contacts : defaultContacts
    const cards: VcfContact[] = list.map((c) => {
      const [family, ...rest] = (c.name || "").split(/\s+/)
      const given = rest.join(" ")
      const groupName = c.group_id ? (contactGroups.find(g => g.id === c.group_id)?.name || "") : (c.group_name || "")
      return {
        fullName: c.name || c.email,
        structuredName: c.name
          ? { family: family || "", given: given || "", middle: "", prefix: "", suffix: "" }
          : undefined,
        emails: c.email ? [{ value: c.email, types: [] }] : [],
        phones: c.phone ? [{ value: c.phone, types: [] }] : [],
        organization: undefined,
        note: c.notes || undefined,
        categories: groupName ? [groupName] : [],
        addresses: [],
        raw: {},
      }
    })
    const vcf = serializeVcf(cards)
    const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `contacts_${new Date().toISOString().slice(0, 10)}.vcf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleVcfImportDone = async () => {
    if (!activeAccountId) return
    try { await refreshAll() } catch { /* ignore */ }
  }

  const handleImportContacts = () => {
    const input = document.createElement("input")
    input.type = "file"; input.accept = ".csv"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file || !activeAccountId) return
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      const dataLines = lines.slice(lines[0].includes("姓名") || lines[0].includes("name") ? 1 : 0)
      for (const line of dataLines) {
        const fields = parseCsvLine(line)
        if (fields.length >= 2) {
          try {
            await mailIpc.addContact({
              account_id: activeAccountId,
              name: fields[0].trim(),
              display_name: fields[0].trim(),
              email: fields[1].trim(),
              phone: fields[2]?.trim() || "",
              group_id: null,
              group_name: fields[3]?.trim() || "",
              notes: fields[4]?.trim() || "",
            })
          } catch {}
        }
      }
      await refreshAll()
    }
    input.click()
  }

  function parseCsvLine(line: string): string[] {
    const result: string[] = []
    let current = ""
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current); current = ""
      } else { current += ch }
    }
    result.push(current)
    return result
  }

  // Compute group counts
  const groupCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    contacts.forEach(c => {
      const gid = c.group_id ?? 0
      counts[gid] = (counts[gid] || 0) + 1
    })
    return counts
  }, [contacts])

  // Filter contacts by selected group
  const filteredContacts = useMemo(() => {
    if (selectedGroupId === null) return contacts
    if (selectedGroupId === 0) return contacts.filter(c => !c.group_id)
    return contacts.filter(c => c.group_id === selectedGroupId)
  }, [contacts, selectedGroupId])

  const displayContacts = filteredContacts.length > 0 ? filteredContacts : defaultContacts

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/70" onClick={onClose}>
      <div className="w-[640px] max-h-[80vh] overflow-hidden bg-white dark:bg-surface-900 rounded-2xl shadow-2xl flex" onClick={e => e.stopPropagation()}>
        {/* Left: Group sidebar */}
        <ContactGroupSidebar
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
          groupCounts={groupCounts}
          totalCount={contacts.length}
          onGroupsChanged={refreshAll}
        />
        {/* Right: Contact list */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between p-4 pb-2">
            <h2 className="text-lg font-bold text-surface-700 dark:text-surface-200">{t("contacts.title")}</h2>
            <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300"><X size={20} /></button>
          </div>
          <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => { setShowAdd(true); setEditingContact(null); setForm({ name: "", email: "", phone: "", group_id: selectedGroupId && selectedGroupId > 0 ? selectedGroupId : null, notes: "" }) }}>
              <Plus size={14} />{t("contacts.newContact")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportContacts}>
              <Download size={14} />{t("contacts.export")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleImportContacts}>
              <Upload size={14} />{t("contacts.import")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportVcf}>
              <Download size={14} />{t("contacts.exportVcf")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowVcfImport(true)} disabled={!activeAccountId}>
              <Upload size={14} />{t("contacts.importVcf")}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
            {displayContacts.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-surface-200 dark:border-surface-700 group hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer" onClick={() => openEdit(c)}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-surface-200 dark:bg-surface-700 flex items-center justify-center text-xs font-semibold">{c.name.charAt(0)}</div>
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-surface-400 dark:text-surface-500 dark:text-surface-400">{c.email}</p>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); c.id && handleDelete(c.id) }} className="opacity-0 group-hover:opacity-100 text-surface-400 dark:text-surface-500 dark:text-surface-400 hover:text-red-500 dark:hover:text-red-400 dark:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          {(showAdd || editingContact) && (
            <div className="border-t border-surface-200 dark:border-surface-700 p-4 space-y-2 bg-surface-50 dark:bg-surface-800/50">
              <input type="text" placeholder={t("contacts.name")} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm bg-white dark:bg-surface-900" />
              <input type="email" placeholder={t("contacts.email")} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm bg-white dark:bg-surface-900" />
              <input type="text" placeholder={t("contacts.phone")} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm bg-white dark:bg-surface-900" />
              <select
                value={form.group_id ?? ""}
                onChange={e => setForm(f => ({ ...f, group_id: e.target.value ? Number(e.target.value) : null }))}
                className="w-full h-9 px-3 border border-surface-300 dark:border-surface-600 rounded-lg text-sm bg-white dark:bg-surface-900"
              >
                <option value="">未分组</option>
                {contactGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <textarea placeholder={t("contacts.notes")} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full h-16 px-3 py-2 border border-surface-300 dark:border-surface-600 rounded-lg text-sm resize-none bg-white dark:bg-surface-900" />
              <div className="flex gap-2">
                <Button size="sm" onClick={editingContact ? handleEdit : handleAdd} disabled={saving}>{t("account.save")}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setEditingContact(null); setForm({ name: "", email: "", phone: "", group_id: null, notes: "" }) }}>{t("mail.cancel")}</Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* VCF 导入对话框 */}
      <ContactImportDialog
        accountId={activeAccountId}
        open={showVcfImport}
        onClose={() => setShowVcfImport(false)}
        onImported={handleVcfImportDone}
      />
    </div>
  )
}

// ==================== Signature Editor Modal ====================

function SignatureEditorModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { activeAccountId } = useMailStore()
  const storageKey = `easywork-signature-${activeAccountId ?? "default"}`
  const [html, setHtml] = useState(() => localStorage.getItem(storageKey) || "")

  const handleChange = (htmlContent: string, _textContent: string) => {
    setHtml(htmlContent)
  }

  const handleSave = () => {
    localStorage.setItem(storageKey, html)
    onClose()
  }

  const handleClear = () => {
    setHtml("")
    localStorage.removeItem(storageKey)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/70" onClick={onClose}>
      <div className="w-[600px] max-h-[85vh] overflow-auto bg-white dark:bg-surface-900 rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-surface-700 dark:text-surface-200">{t("mail.signatureSettings")}</h2>
          <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300"><X size={20} /></button>
        </div>
        <p className="text-xs text-surface-500 dark:text-surface-400">{t("mail.signatureSettingsHint")}</p>
        <RichTextEditor content={html} onChange={handleChange} placeholder={t("mail.signaturePlaceholder")} showImageButton />
        <div className="flex items-center justify-between pt-2 border-t border-surface-200 dark:border-surface-700">
          <button onClick={handleClear} className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
            {t("mail.signatureClear")}
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>{t("mail.cancel")}</Button>
            <Button size="sm" onClick={handleSave}>{t("account.save")}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== Compose Dialog ====================

function ComposeDialog() {
  const { t } = useTranslation()
  const { composeData, closeCompose, accounts, activeAccountId, setSyncStatus, contacts } = useMailStore()
  const { saveDraft, clearDraft, loadDraft } = useComposeDraft()
  const initialDraft = loadDraft()

  // Signature - stored as HTML in localStorage
  const getSignatureKey = (id: number | null) => `easywork-signature-${id ?? "default"}`
  const loadSignature = (id: number | null) => localStorage.getItem(getSignatureKey(id)) || ""
  const [signatureHtml, setSignatureHtml] = useState(loadSignature(activeAccountId))
  const [showSignature, setShowSignature] = useState(!!loadSignature(activeAccountId))
  const [showSignatureEditor, setShowSignatureEditor] = useState(false)

  // v1.1: 结构化收件人。初始化优先级：composeData.recipients > draft.recipients > 草稿字符串降级。
  const initRecipients = (): MailRecipient[] => {
    if (composeData?.recipients && composeData.recipients.length > 0) {
      return composeData.recipients
    }
    if (initialDraft?.recipients && initialDraft.recipients.length > 0) {
      return initialDraft.recipients
    }
    // 降级：解析 to/cc/bcc 字符串
    const out: MailRecipient[] = []
    if (composeData?.to || initialDraft?.to) {
      out.push(...parseAddressList(composeData?.to || initialDraft?.to, "to"))
    }
    if (composeData?.cc || initialDraft?.cc) {
      out.push(...parseAddressList(composeData?.cc || initialDraft?.cc, "cc"))
    }
    if (composeData?.bcc || initialDraft?.bcc) {
      out.push(...parseAddressList(composeData?.bcc || initialDraft?.bcc, "bcc"))
    }
    return out
  }
  const [recipients, setRecipients] = useState<MailRecipient[]>(initRecipients)
  const [pickerCollapsed, setPickerCollapsed] = useState(false)
  const [subject, setSubject] = useState(composeData?.subject || initialDraft?.subject || "")
  const [body, setBody] = useState(composeData?.body || initialDraft?.body || "")
  const [bodyHtml, setBodyHtml] = useState("")
  const [showCc, setShowCc] = useState(
    !!(composeData?.cc || initialDraft?.cc) ||
      recipients.some((r) => r.kind === "cc"),
  )
  const [showBcc, setShowBcc] = useState(
    !!(composeData?.bcc || initialDraft?.bcc) ||
      recipients.some((r) => r.kind === "bcc"),
  )
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<mailIpc.SendResult | null>(null)
  const [draftIndicator, setDraftIndicator] = useState("")
  const [pickerToast, setPickerToast] = useState<string | null>(null)

  // 派生 to/cc/bcc 字符串（用于发送 & 草稿 & ContactAutocomplete 回填）
  const to = useMemo(() => renderRecipientList(recipients, "to"), [recipients])
  const cc = useMemo(() => renderRecipientList(recipients, "cc"), [recipients])
  const bcc = useMemo(() => renderRecipientList(recipients, "bcc"), [recipients])

  // ── Draft autosave (Bug #1 fix) ──
  // Mirror the live field values into refs so the setInterval callback always
  // reads the latest values WITHOUT forcing the effect to re-subscribe on every
  // keystroke.
  const draftFieldsRef = useRef({
    to, cc, bcc, subject, body, activeAccountId, recipients,
  })
  const lastSerializedRef = useRef<string>("")
  const draftIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    draftFieldsRef.current = { to, cc, bcc, subject, body, activeAccountId, recipients }
  })

  useEffect(() => {
    // Save once on unmount (only if the snapshot was different from what we last wrote)
    return () => {
      const { to: u, cc: c, bcc: b, subject: s, body: bd, activeAccountId: aid, recipients: r } = draftFieldsRef.current
      const snapshot = JSON.stringify({ to: u, cc: c, bcc: b, subject: s, body: bd, accountId: aid, recipients: r })
      if ((u || s || bd || r.length > 0) && snapshot !== lastSerializedRef.current) {
        saveDraft({ to: u, cc: c, bcc: b, subject: s, body: bd, accountId: aid, recipients: r })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const tick = () => {
      const { to: u, cc: c, bcc: b, subject: s, body: bd, activeAccountId: aid, recipients: r } = draftFieldsRef.current
      if (!(u || c || b || s || bd || r.length > 0)) return
      const snapshot = JSON.stringify({ to: u, cc: c, bcc: b, subject: s, body: bd, accountId: aid, recipients: r })
      if (snapshot === lastSerializedRef.current) return
      lastSerializedRef.current = snapshot
      saveDraft({ to: u, cc: c, bcc: b, subject: s, body: bd, accountId: aid, recipients: r })
      setDraftIndicator(t("mail.draftSaved"))
      setTimeout(() => setDraftIndicator(""), 2000)
    }
    draftIntervalRef.current = setInterval(tick, 5000)
    return () => { if (draftIntervalRef.current) clearInterval(draftIntervalRef.current) }
  }, [activeAccountId, saveDraft, t])

  const handleSend = async () => {
    if (!activeAccountId || !accounts.length) return
    if (!hasAnyRecipient(recipients)) {
      setPickerToast(t("contacts.recipients.noRecipient"))
      setTimeout(() => setPickerToast(null), 2000)
      return
    }
    setSending(true); setSendResult(null)
    // Append signature HTML to body
    const finalBodyText = showSignature && signatureHtml ? body + "\n\n" + stripHtml(signatureHtml) : body
    const finalBodyHtml = showSignature && (signatureHtml || bodyHtml)
      ? (bodyHtml || `<div>${escapeHtml(body)}</div>`) + `<br><br>${signatureHtml}`
      : bodyHtml
    try {
      const result = await mailIpc.sendMail({
        account_id: activeAccountId, to, subject, body_text: finalBodyText,
        body_html: finalBodyHtml || undefined, cc: cc || undefined, bcc: bcc || undefined,
        in_reply_to: composeData?.inReplyTo, references: composeData?.references,
      })
      setSendResult(result)
      if (result.success) { setSyncStatus({ lastResult: t("mail.sendSuccess") }); clearDraft(); setTimeout(() => closeCompose(), 1500) }
    } catch (err: unknown) { setSendResult({ success: false, error: err instanceof Error ? err.message : String(err), linked_message_id: null, new_message_id: null } as mailIpc.SendResult) }
    finally { setSending(false) }
  }

  const handleClose = () => { clearDraft(); closeCompose() }

  const handleSignatureSaved = () => {
    const fresh = loadSignature(activeAccountId)
    setSignatureHtml(fresh)
    if (fresh) setShowSignature(true)
    setShowSignatureEditor(false)
  }

  // 联系人选择器 → 合并到 recipients
  const handlePickerAdd = useCallback(
    (picked: MailContact[], kind: RecipientKind) => {
      if (picked.length === 0) return
      // 自动展开对应 kind 的输入行
      if (kind === "cc" && !showCc) setShowCc(true)
      if (kind === "bcc" && !showBcc) setShowBcc(true)
      const existing = new Set(recipients.map((r) => r.email))
      const additions: MailRecipient[] = picked
        .filter((c) => c.email && !existing.has(c.email.toLowerCase()))
        .map((c) => ({
          email: c.email.toLowerCase(),
          name: c.name || undefined,
          contactId: c.id,
          kind,
        }))
      if (additions.length > 0) {
        setRecipients([...recipients, ...additions])
      }
    },
    [recipients, showCc, showBcc],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/70">
      <Card className="w-[90vw] max-w-[1080px] max-h-[85vh] flex flex-row shadow-2xl dark:shadow-black/30 overflow-hidden">
        {/* 主区：收件人 / 主题 / 正文 / 操作 */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between p-3 border-b border-surface-200 dark:border-surface-700">
            <h3 className="font-semibold text-sm text-surface-700 dark:text-surface-200">{composeData?.isReply ? t("mail.reply") : composeData?.isForward ? t("mail.forward") : t("mail.compose")}</h3>
            <button onClick={handleClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-auto">
            <RecipientInputRow
              recipients={recipients}
              kind="to"
              label={t("mail.to")}
              onChange={setRecipients}
              onNotify={(m) => { setPickerToast(m); setTimeout(() => setPickerToast(null), 2000) }}
              adornment={
                !showCc ? (
                  <button onClick={() => setShowCc(true)} className="text-xs text-primary-500 dark:text-primary-400 px-1">
                    {t("mail.addCc")}
                  </button>
                ) : undefined
              }
            />
            {showCc && (
              <RecipientInputRow
                recipients={recipients}
                kind="cc"
                label={t("mail.cc")}
                onChange={setRecipients}
                onNotify={(m) => { setPickerToast(m); setTimeout(() => setPickerToast(null), 2000) }}
                adornment={
                  !showBcc ? (
                    <button onClick={() => setShowBcc(true)} className="text-xs text-primary-500 dark:text-primary-400 px-1">
                      {t("mail.addBcc")}
                    </button>
                  ) : undefined
                }
              />
            )}
            {showBcc && (
              <RecipientInputRow
                recipients={recipients}
                kind="bcc"
                label={t("mail.bcc")}
                onChange={setRecipients}
                onNotify={(m) => { setPickerToast(m); setTimeout(() => setPickerToast(null), 2000) }}
              />
            )}
            <div className="flex items-center border-b border-surface-200 dark:border-surface-700">
              <span className="text-xs text-surface-400 dark:text-surface-500 w-12 shrink-0 px-3">{t("mail.subject")}</span>
              <input type="text" placeholder={t("mail.subject")} value={subject} onChange={e => setSubject(e.target.value)} className="flex-1 h-9 px-1 border-0 text-sm focus:outline-none bg-transparent text-surface-700 dark:text-surface-200" />
            </div>
            <div className="p-3">
              <RichTextEditor content={body} onChange={(html, text) => { setBody(text); setBodyHtml(html) }} placeholder={t("mail.body")} />
            </div>
            {/* Signature controls */}
            <div className="flex items-center gap-2 pt-1 px-3">
              <button onClick={() => { setShowSignature(!showSignature); if (!showSignature && signatureHtml) setBody(b => b + "\n\n" + stripHtml(signatureHtml)) }}
                className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors ${showSignature ? "text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30" : "text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300"}`}>
                ✎ {t("mail.signature")}
              </button>
              <button onClick={() => setShowSignatureEditor(true)} className="text-xs text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300 underline">
                {t("mail.manageSignature")}
              </button>
            </div>
            {draftIndicator && <div className="text-xs text-surface-400 dark:text-surface-500 italic px-3 py-1">{draftIndicator}</div>}
            {sendResult && (
              <div className={`flex items-center gap-2 p-2 mx-3 rounded-lg text-xs ${sendResult.success ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"}`}>
                {sendResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{sendResult.success ? t("mail.sendSuccess") : sendResult.error}
              </div>
            )}
            {pickerToast && (
              <div className="mx-3 mb-1 text-xs text-amber-600 dark:text-amber-400 italic">
                {pickerToast}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between p-3 border-t border-surface-200 dark:border-surface-700">
            <span className="text-xs text-surface-400 dark:text-surface-500">
              {accounts.find(a => a.id === activeAccountId)?.email || "..."}
              {recipients.filter(r => r.kind === "to").length > 1 && (
                <span className="ml-2 text-primary-500 dark:text-primary-400">
                  {t("contacts.recipients.broadcast", { n: recipients.filter(r => r.kind === "to").length })}
                </span>
              )}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleClose}>{t("mail.cancel")}</Button>
              <Button size="sm" onClick={handleSend} disabled={sending || !hasAnyRecipient(recipients) || !subject}>
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{t("mail.send")}
              </Button>
            </div>
          </div>
        </div>
        {/* 侧栏：联系人选择器 */}
        <ContactPickerPanel
          contacts={contacts}
          recipients={recipients}
          onAddTo={handlePickerAdd}
          onNotify={(m) => { setPickerToast(m); setTimeout(() => setPickerToast(null), 2000) }}
          collapsed={pickerCollapsed}
          onToggleCollapse={() => setPickerCollapsed((c) => !c)}
          className="h-full"
        />
      </Card>
      {showSignatureEditor && <SignatureEditorModal onClose={handleSignatureSaved} />}
    </div>
  )
}

// ==================== Draft Recovery ====================

function DraftRecoveryDialog({ onRecover, onDiscard }: { onRecover: () => void; onDiscard: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/70">
      <Card className="w-[380px] shadow-2xl">
        <CardContent className="p-5 space-y-3">
          <h3 className="font-semibold">{t("mail.draftRecoveryTitle")}</h3>
          <p className="text-sm text-surface-500 dark:text-surface-400">{t("mail.draftRecoveryMsg")}</p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={onDiscard}>{t("mail.discard")}</Button>
            <Button size="sm" onClick={onRecover}>{t("mail.continue")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ==================== Folder name helpers ====================

function getFolderLabel(role: string, name: string, remoteId: string, lang: string): string {
  if (role && lang === "zh" && FOLDER_ROLE_LABELS_ZH[role]) return FOLDER_ROLE_LABELS_ZH[role]
  if (role && lang === "en" && FOLDER_ROLE_LABELS_EN[role]) return FOLDER_ROLE_LABELS_EN[role]
  return name || remoteId
}

function getFolderSortOrder(f: { role: string; name: string }): number {
  if (f.role && f.role in FOLDER_ROLE_ORDER) return FOLDER_ROLE_ORDER[f.role]
  return 100
}

// Account color palette for multi-account identification
const ACCOUNT_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
  { bg: "bg-purple-100 dark:bg-purple-900/40", text: "text-purple-700 dark:text-purple-300", border: "border-purple-200 dark:border-purple-800" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-300", border: "border-rose-200 dark:border-rose-800" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-200 dark:border-cyan-800" },
]

function getAccountColor(email: string) {
  let hash = 0
  for (let i = 0; i < email.length; i++) { hash = ((hash << 5) - hash) + email.charCodeAt(i); hash |= 0 }
  return ACCOUNT_COLORS[Math.abs(hash) % ACCOUNT_COLORS.length]
}

// ==================== Main Email Page ====================

function EmailPage() {
  const { t } = useTranslation()
  const {
    messages, selectedMessageId, messageBody,
    selectMessage, markRead, toggleStar, removeMessage,
    activeFolder, setActiveFolder, openCompose, composeOpen, accounts,
    activeAccountId, activeFolderId, setMessages, setLoadingMessages,
    syncStatus, setSyncStatus, setMessageBody,
    searchQuery, setSearchQuery, folderUnreadCounts, setFolderUnreadCounts,
    decrementFolderUnread,
    contactFilterEmail, contactFilterName, setContactFilter,
  } = useMailStore()

  // Contact action menu state
  const [contactMenu, setContactMenu] = useState<{ name: string; email: string; x: number; y: number } | null>(null)
  const [messageHeaders, setMessageHeaders] = useState<{ to_list: string; cc_list: string } | null>(null)

  const [dbFolders, setDbFolders] = useState<mailIpc.MailFolder[]>([])
  const [attachments, setAttachments] = useState<mailIpc.AttachmentInfo[]>([])
  const [downloadingAtts, setDownloadingAtts] = useState<Set<number>>(new Set())
  const [cidMap, setCidMap] = useState<Record<string, string>>({})
  const [remoteImagesEnabled, setRemoteImagesEnabled] = useState(true)
  const [previewAtt, setPreviewAtt] = useState<{ att: mailIpc.AttachmentInfo; dataUrl: string; type: "image" | "text" | "pdf" } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Load remote images setting
  useEffect(() => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    if (isTauri) {
      mailIpc.getRemoteImagesEnabled().then(setRemoteImagesEnabled).catch(() => {})
    }
  }, [])
  const [page, setPage] = useState(1)
  const [totalMessages, setTotalMessages] = useState(0)
  const PAGE_SIZE = 30
  const totalPages = Math.max(1, Math.ceil(totalMessages / PAGE_SIZE))
  const [starredFilter, setStarredFilter] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { hasDraft, clearDraft } = useComposeDraft()
  const [showDraftRecovery, setShowDraftRecovery] = useState(hasDraft)
  const [showSettings, setShowSettings] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  // Bug #6 fix: collapse state now lives in the shared sidebar store so the
  // global Sidebar (in @/components/Sidebar) and the email module's local
  // folder rail stay in sync. Removing the duplicated local state eliminates
  // a class of bugs where the two views drift out of agreement.
  const sidebarOpen = useSidebarStore((s) => !s.collapsed)
  const setSidebarOpen = useSidebarStore((s) => s.toggle)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null)
  const [showMobileList, setShowMobileList] = useState(true)
  const [searchFilters, setSearchFilters] = useState<SearchFiltersState>({
    from: "", to: "", subject: "", dateFrom: "", dateTo: "", hasAttachment: false, folderId: null,
  })

  const lang = localStorage.getItem("easywork-lang") || "zh"

  // Load accounts on mount — critical: activeAccountId starts as null and no other
  // component loads accounts automatically. Without this, the auto-sync useEffect
  // never fires and the inbox stays empty until the user opens Settings.
  // v1.3: Load cached messages immediately, then sync in background.
  useEffect(() => {
    const initAccounts = async () => {
      try {
        const ba = await mailIpc.listAccounts()
        if (ba.length > 0) {
          useMailStore.getState().setAccounts(ba)
          // Immediately load cached messages from SQLite (no IMAP wait)
          const accountIds = ba.map(a => a.id).filter((id): id is number => id != null)
          mailIpc.fetchMessagesMulti(accountIds, activeFolder, 1, PAGE_SIZE).then(result => {
            setMessages(result.messages)
            setTotalMessages(result.total)
          }).catch(() => {})
        }
      } catch {
        // silently ignore — user can add accounts via Settings
      }
    }
    initAccounts()
  }, [])

  // Refresh emails when window regains focus (e.g., after clicking notification)
  useEffect(() => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
    if (!isTauri) return

    const handleFocus = () => {
      if (accounts.length > 0) {
        // Refresh messages from all accounts when window is focused
        const accountIds = accounts.map(a => a.id).filter((id): id is number => id != null)
        mailIpc.fetchMessagesMulti(accountIds, activeFolder, 1, PAGE_SIZE).then(result => {
          setMessages(result.messages)
          setTotalMessages(result.total)
        }).catch(() => {})
      }
    }

    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [accounts, activeFolder, PAGE_SIZE, setMessages, setTotalMessages, setFolderUnreadCounts])

  // Auto-collapse sidebar on laptop / smaller screens.
  // (Bug #6) We now drive the shared sidebar store directly so the global
  // Sidebar component in @/components/Sidebar reacts the same way.
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1440) useSidebarStore.getState().setCollapsed(true)
      else useSidebarStore.getState().setCollapsed(false)
    }
    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Load folders (re-fetch when switching accounts — after initial auto-sync)
  useEffect(() => {
    if (activeAccountId && syncedAccountIds.current.has(activeAccountId)) {
      // Re-fetch folders when switching to an already-synced account
      mailIpc.listFolders(activeAccountId).then(folders => {
        setDbFolders(folders)
        mailIpc.folderUnreadCounts(activeAccountId).then(counts => {
          const map: Record<number, number> = {}
          counts.forEach(([fid, c]) => { map[fid] = c })
          setFolderUnreadCounts(map)
        }).catch(() => {})
      }).catch(() => setDbFolders([]))
    }
  }, [activeAccountId, setFolderUnreadCounts])

  // ---- Auto-sync on accounts change (initial load & account changes) ----
  // Uses per-account tracking so each account gets its first sync exactly once.
  // v1.3: Skip initial sync if we already loaded from cache (initAccounts did it).
  const syncedAccountIds = useRef<Set<number>>(new Set())
  const initialLoadDone = useRef(false)

  useEffect(() => {
    if (accounts.length === 0) return

    // Track which accounts need syncing
    const accountsToSync = accounts.filter(acc => acc.id && !syncedAccountIds.current.has(acc.id))
    accountsToSync.forEach(acc => acc.id && syncedAccountIds.current.add(acc.id))

    const doAutoSync = async () => {
      // v1.3: On initial mount, we already loaded cached messages.
      // Just sync in background without blocking the UI.
      const isInitialMount = !initialLoadDone.current
      if (isInitialMount) {
        initialLoadDone.current = true
        // Show subtle sync indicator
        setSyncStatus({ syncing: true, lastResult: null, lastError: null })
      } else {
        setSyncStatus({ syncing: true, lastResult: null, lastError: null })
      }

      // Wait a brief moment for any prior effects to settle
      await new Promise(r => setTimeout(r, isInitialMount ? 100 : 500))

      // Sync all accounts that haven't been synced yet
      for (const acc of accountsToSync) {
        if (!acc.id) continue
        try {
          const result = await mailIpc.syncAccount(acc.id)
          if (result.messages_new > 0) {
            setToast({ message: `${acc.email}: ${result.messages_new} 封新邮件`, type: "success" })
          }
        } catch {
          console.warn(`Sync failed for account ${acc.email}`)
        }
      }

      // Refresh messages from all accounts using multi-account query
      const accountIds = accounts.map(a => a.id).filter((id): id is number => id != null)
      try {
        const result = await mailIpc.fetchMessagesMulti(accountIds, activeFolder, 1, PAGE_SIZE)
        setMessages(result.messages)
        setTotalMessages(result.total)
        setPage(1)
      } catch {}

      setSyncStatus({ syncing: false, lastSyncAt: new Date().toLocaleTimeString(), lastResult: "同步完成" })
    }

    doAutoSync()
  }, [accounts])

  // Sorted folders — deduplicate by role (some IMAP servers return both EN and CN names)
  const sortedFolders = useMemo(() => {
    const seen = new Set<string>()
    const uniq: typeof dbFolders = []
    const lang = t("sidebar.dashboard", "Dashboard") === "Dashboard" ? "en" : "zh"
    // Prefer CN-named folders in Chinese locale, EN-named in English locale
    const preferCN = lang === "zh"
    for (const f of dbFolders) {
      if (seen.has(f.role)) continue
      seen.add(f.role)
      // If a duplicate role exists, pick the folder with the most readable name
      const dupes = dbFolders.filter(d => d.role === f.role)
      const best = dupes.length > 1
        ? dupes.reduce((best, d) => {
            const nameA = best.name
            const nameB = d.name
            const aCN = /[\u4e00-\u9fff]/.test(nameA)
            const bCN = /[\u4e00-\u9fff]/.test(nameB)
            if (preferCN && bCN && !aCN) return d
            if (preferCN && aCN && !bCN) return best
            if (!preferCN && !bCN && aCN) return d
            if (!preferCN && !aCN && bCN) return best
            return nameA.length < nameB.length ? best : d
          }, dupes[0])
        : f
      uniq.push(best)
    }
    return uniq.sort((a, b) => getFolderSortOrder(a) - getFolderSortOrder(b))
  }, [dbFolders])

  const folderIcons: Record<string, typeof Inbox> = {
    inbox: Inbox, sent: Send, drafts: FileText, trash: Trash2, junk: AlertTriangle, archive: Archive,
  }

  // Select message
  const handleSelectMessage = useCallback(async (id: number | null) => {
    selectMessage(id)
    if (id === null) { setAttachments([]); setCidMap({}); setPreviewAtt(null); setMessageHeaders(null); return }
    try {
      const body = await mailIpc.getMessageBody(id)
      setMessageBody(body)
      // Fetch headers for to_list / cc_list display
      const headers = await mailIpc.getMessageHeaders(id).catch(() => null)
      setMessageHeaders(headers ? { to_list: headers.to_list, cc_list: headers.cc_list || "[]" } : null)
      const atts = await mailIpc.listMessageAttachments(id).catch(() => [] as mailIpc.AttachmentInfo[])
      setAttachments(atts)
      // Build CID map for inline images using dedicated API
      const cidPaths = await mailIpc.getMessageCidMap(id).catch(() => ({}))
      // Convert file paths to data URLs for Shadow DOM rendering
      const cidDataUrls: Record<string, string> = {}
      for (const [cid, path] of Object.entries(cidPaths)) {
        try {
          const b64 = await mailIpc.readFileAsBase64(path)
          const ext = path.split(".").pop()?.toLowerCase() || ""
          const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream"
          cidDataUrls[cid] = `data:${mime};base64,${b64}`
        } catch {}
      }
      setCidMap(cidDataUrls)
      setShowMobileList(false)
    } catch { setMessageBody({ body_text: "(无法加载)", body_html: "" }); setAttachments([]); setCidMap({}); setMessageHeaders(null) }
  }, [selectMessage, setMessageBody])

  // Download a lazy attachment (local_path is empty) or open an already-downloaded one
  const handleDownloadAttachment = useCallback(async (att: mailIpc.AttachmentInfo) => {
    // If already downloaded, open directly
    if (att.local_path) {
      mailIpc.openFile(att.local_path).catch(() => {})
      return
    }
    // Lazy attachment: download from IMAP first
    setDownloadingAtts(prev => new Set(prev).add(att.id))
    try {
      const path = await mailIpc.downloadAttachment(att.id, selectedMessageId!)
      // Update the local attachments state so the UI re-renders with the path
      setAttachments(prev => prev.map(a =>
        a.id === att.id ? { ...a, local_path: path } : a
      ))
      // Open the file after download
      mailIpc.openFile(path).catch(() => {})
    } catch (err) {
      setToast({ message: `下载附件失败: ${err}`, type: "error" })
    } finally {
      setDownloadingAtts(prev => {
        const next = new Set(prev)
        next.delete(att.id)
        return next
      })
    }
  }, [selectedMessageId, setToast])

  // Preview attachment inline (image / text / pdf)
  const handlePreviewAttachment = useCallback(async (att: mailIpc.AttachmentInfo) => {
    const ct = (att.content_type || "").toLowerCase()
    let type: "image" | "text" | "pdf" | null = null
    if (ct.startsWith("image/")) type = "image"
    else if (ct === "application/pdf") type = "pdf"
    else if (ct.startsWith("text/")) type = "text"

    if (!type) {
      // No preview support, open with system default
      if (att.local_path) { mailIpc.openFile(att.local_path).catch(() => {}) }
      else { await handleDownloadAttachment(att) }
      return
    }

    setPreviewLoading(true)
    try {
      let path = att.local_path
      if (!path) {
        path = await mailIpc.downloadAttachment(att.id, selectedMessageId!)
        setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, local_path: path } : a))
      }
      const b64 = await mailIpc.readFileAsBase64(path)
      let dataUrl: string
      if (type === "image") dataUrl = `data:${att.content_type};base64,${b64}`
      else if (type === "pdf") dataUrl = `data:application/pdf;base64,${b64}`
      else dataUrl = `data:${att.content_type || "text/plain"};base64,${b64}`
      setPreviewAtt({ att, dataUrl, type })
    } catch (err) {
      setToast({ message: `预览失败: ${err}`, type: "error" })
    } finally {
      setPreviewLoading(false)
    }
  }, [selectedMessageId, setToast, handleDownloadAttachment])

  // Sync & Refresh (merged) - 同步所有账户
  const handleSync = useCallback(async () => {
    if (accounts.length === 0) return
    setSyncStatus({ syncing: true })
    let timedOut = false
    try {
      // Sync all accounts with per-account timeout protection
      let totalNew = 0
      const PER_ACCOUNT_TIMEOUT_MS = 45000 // 45s per account

      for (const acc of accounts) {
        if (!acc.id) continue
        try {
          const result = await Promise.race([
            mailIpc.syncAccount(acc.id),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`账户 ${acc.email} 同步超时`)), PER_ACCOUNT_TIMEOUT_MS)
            ),
          ])
          totalNew += result.messages_new
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          const isBusy = typeof msg === "string" && msg.includes("已在同步中")
          if (msg.includes("超时")) {
            timedOut = true
          }
          if (!isBusy) {
            console.warn(`Sync failed for account ${acc.email}: ${msg}`)
          }
        }
      }

      if (totalNew > 0) {
        setToast({ message: `${totalNew} 封新邮件`, type: "success" })
      }
      if (timedOut) {
        setToast({ message: "部分账户同步超时，请稍后重试", type: "error" })
      }

      // Load messages from all accounts
      const accountIds = accounts.map(a => a.id).filter((id): id is number => id != null)
      const allMessages = await mailIpc.fetchMessagesMulti(accountIds, activeFolder, 1, PAGE_SIZE)
      setMessages(allMessages.messages)
      setTotalMessages(allMessages.total)
      setPage(1)

      setSyncStatus({ syncing: false, lastSyncAt: new Date().toLocaleTimeString() })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setToast({
        message: `同步失败: ${msg}`,
        type: "error",
      })
      setSyncStatus({ syncing: false })
    }
  }, [accounts, activeFolder, PAGE_SIZE, setMessages, setSyncStatus, setFolderUnreadCounts])

  // Mark all messages as read - 标记所有账户的邮件为已读
  const handleMarkAllRead = useCallback(async () => {
    if (accounts.length === 0) return
    try {
      let total = 0
      for (const acc of accounts) {
        if (!acc.id) continue
        const count = await mailIpc.markFolderRead(acc.id, null)
        total += count
      }
      if (total > 0) {
        // Update local state
        setMessages(messages.map(m => ({ ...m, is_read: true })))
        // Clear unread counts
        setFolderUnreadCounts({})
        setToast({ message: `已将 ${total} 封邮件标记为已读`, type: "success" })
        setTimeout(() => setToast(null), 2000)
      } else {
        setToast({ message: "没有未读邮件", type: "info" })
        setTimeout(() => setToast(null), 2000)
      }
    } catch (err) {
      setToast({ message: `标记已读失败: ${err}`, type: "error" })
      setTimeout(() => setToast(null), 3000)
    }
  }, [accounts, messages, setMessages, setFolderUnreadCounts])

  // Search - 跨所有账户搜索
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { handleSync(); return }
    setLoadingMessages(true)
    try {
      const accountIds = accounts.map(a => a.id).filter((id): id is number => id != null)
      setMessages(await mailIpc.searchMessagesMulti(accountIds, searchQuery) as any)
    }
    catch { setToast({ message: "搜索失败", type: "error" }) }
    finally { setLoadingMessages(false) }
  }, [accounts, searchQuery, setMessages, setLoadingMessages, handleSync])

  // Pagination - 跨所有账户分页
  const handleGoToPage = useCallback(async (targetPage: number) => {
    if (accounts.length === 0 || targetPage < 1 || targetPage > totalPages) return
    setLoadingMessages(true)
    try {
      const accountIds = accounts.map(a => a.id).filter((id): id is number => id != null)
      const result = await mailIpc.fetchMessagesMulti(accountIds, activeFolder, targetPage, PAGE_SIZE)
      setMessages(result.messages)
      setTotalMessages(result.total)
      setPage(targetPage)
    } catch {
      setToast({ message: "加载失败", type: "error" })
    } finally {
      setLoadingMessages(false)
    }
  }, [accounts, activeFolder, totalPages, setMessages, setLoadingMessages])

  // Delete / Archive
  const handleDelete = useCallback(async (msgId: number) => {
    try { await mailIpc.deleteMessage(msgId); removeMessage(msgId); setToast({ message: t("mail.deleted"), type: "success" }) } catch {}
  }, [removeMessage, t])
  const handleArchive = useCallback(async (msgId: number) => {
    try { await mailIpc.archiveMessage(msgId); removeMessage(msgId); setToast({ message: t("mail.archived"), type: "success" }) } catch {}
  }, [removeMessage, t])

  // Reply / Forward
  const handleReply = useCallback(async (msgId: number) => {
    const msg = messages.find(m => m.id === msgId); if (!msg) return
    try {
      const headers = await mailIpc.getMessageHeaders(msgId).catch(() => null)
      openCompose({ to: msg.from_email, subject: `Re: ${msg.subject.replace(/^(Re|回复|答复|Fwd|转发)[:：]\s*/i, "")}`, body: `\n\n---\n${msg.from_name} <${msg.from_email}> 于 ${msg.date} 写道:\n`, isReply: true, replyMessageId: msgId, inReplyTo: headers?.message_id })
    } catch { openCompose({ to: msg.from_email, subject: `Re: ${msg.subject}`, body: `\n\n---\n${msg.from_name} <${msg.from_email}> 于 ${msg.date} 写道:\n`, isReply: true, replyMessageId: msgId }) }
  }, [messages, openCompose])

  const handleForward = useCallback((msgId: number) => {
    const msg = messages.find(m => m.id === msgId); if (!msg) return
    openCompose({ to: "", subject: `Fwd: ${msg.subject}`, body: `\n\n--- 转发邮件 ---\n${t("mail.from")}: ${msg.from_name} <${msg.from_email}>\n日期: ${msg.date}\n主题: ${msg.subject}\n`, isForward: true })
  }, [messages, openCompose, t])

  // Contact action handlers
  const handleContactActionAdd = useCallback(async (name: string, email: string) => {
    if (!activeAccountId) return
    try {
      const existing = await mailIpc.findContactByEmail(email, activeAccountId)
      if (existing) {
        setToast({ message: "该联系人已在通讯录中", type: "info" })
        return
      }
      await mailIpc.addContact({
        account_id: activeAccountId,
        name: name || email.split("@")[0],
        display_name: name || email.split("@")[0],
        email,
        phone: "",
        group_id: null,
        group_name: "",
        notes: "",
      })
      setToast({ message: `已添加 ${name || email} 到通讯录`, type: "success" })
    } catch {
      setToast({ message: "添加联系人失败", type: "error" })
    }
  }, [activeAccountId])

  const handleContactActionViewMessages = useCallback(async (email: string, name: string) => {
    try {
      const result = await mailIpc.searchMessagesByEmail(email, undefined, 50)
      setMessages(result.messages)
      setTotalMessages(result.total)
      setContactFilter(email, name)
      selectMessage(null)
      setMessageBody(null)
      setMessageHeaders(null)
    } catch {
      setToast({ message: "搜索往来邮件失败", type: "error" })
    }
  }, [setMessages, setTotalMessages, setContactFilter, selectMessage, setMessageBody])

  const handleContactActionReply = useCallback((email: string, name: string, subject: string) => {
    openCompose({
      to: email,
      subject: `Re: ${subject.replace(/^(Re|回复|答复|Fwd|转发)[:：]\s*/i, "")}`,
      body: `\n\n---\n${name} <${email}> 写道:\n`,
      isReply: true,
    })
  }, [openCompose])

  // Folder click
  const handleFolderClick = useCallback((role: string, folderId: number | null) => {
    setActiveFolder(role, folderId); setStarredFilter(false)
    setPage(1)
    if (folderId) {
      setLoadingMessages(true)
      mailIpc.fetchMessages(activeAccountId!, folderId, 1, PAGE_SIZE).then(r => {
        setMessages(r.messages)
        setTotalMessages(r.total)
      }).finally(() => setLoadingMessages(false))
    } else {
      mailIpc.fetchMessages(activeAccountId!, undefined, 1, PAGE_SIZE).then(r => {
        setMessages(r.messages)
        setTotalMessages(r.total)
      })
    }
  }, [activeAccountId, setActiveFolder, setMessages, setLoadingMessages])

  // Keyboard shortcuts
  useMailShortcuts({
    onNewCompose: () => openCompose(),
    onReply: () => selectedMessageId && handleReply(selectedMessageId),
    onForward: () => selectedMessageId && handleForward(selectedMessageId),
    onDelete: () => selectedMessageId && handleDelete(selectedMessageId),
    onArchive: () => selectedMessageId && handleArchive(selectedMessageId),
    onRefresh: () => handleSync(),
    onSearch: () => searchInputRef.current?.focus(),
  })

  // Display messages with filters (newest first)
  const displayMessages = useMemo(() => {
    let msgs = starredFilter
      ? messages.filter(m => m.is_starred)
      : messages
    if (searchFilters.from) msgs = msgs.filter(m => m.from_name.toLowerCase().includes(searchFilters.from.toLowerCase()) || m.from_email.toLowerCase().includes(searchFilters.from.toLowerCase()))
    if (searchFilters.subject) msgs = msgs.filter(m => m.subject.toLowerCase().includes(searchFilters.subject.toLowerCase()))
    if (searchFilters.hasAttachment) msgs = msgs.filter(m => m.has_attachment)
    if (searchFilters.dateFrom) msgs = msgs.filter(m => m.date >= searchFilters.dateFrom)
    if (searchFilters.dateTo) msgs = msgs.filter(m => m.date.split("T")[0] <= searchFilters.dateTo)
    // Sort newest first by date
    return [...msgs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [messages, starredFilter, activeAccountId, searchFilters])

  const selectedMessage = selectedMessageId ? displayMessages.find(m => m.id === selectedMessageId) : null

  const handleDraftRecover = () => { setShowDraftRecovery(false); openCompose() }
  const handleDraftDiscard = () => { clearDraft(); setShowDraftRecovery(false) }

  // Mobile back to list
  const handleMobileBack = () => { setShowMobileList(true); selectMessage(null) }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-surface-900">
      {/* Content — 顶部 Toolbar 整块已删除（消除顶部的空白区域）。
          原 mobile sidebar toggle 移至 sidebar 顶部；原 account selector
          整合到 sidebar 的 account indicator 区块。 */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar - collapsible. Layout: top = mobile toggle + folders & filter; bottom (mt-auto) = sync / compose / settings / collapse toggle. */}
        <div className={`${sidebarOpen ? "w-48 lg:w-52" : "w-12"} shrink-0 border-r border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/40 p-2 overflow-y-auto transition-all duration-200 flex flex-col gap-0.5`}>
          {/* Mobile-only sidebar toggle (lifted from the now-removed top Toolbar) */}
          <button onClick={() => setSidebarOpen()}
            className="lg:hidden mb-1 p-1.5 rounded-lg text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 flex items-center gap-2 text-sm"
            title="切换侧边栏">
            <Menu size={16} />{sidebarOpen && <span>切换侧边栏</span>}
          </button>

          {/* System folders (sorted: inbox, sent, drafts, trash, junk, archive) */}
          {sortedFolders.length > 0 ? (
            sortedFolders.map(f => {
              const isActive = activeFolder === (f.role || f.remote_id)
              const Icon = folderIcons[f.role] || Inbox
              const count = (f.id && folderUnreadCounts[f.id]) || 0
              return sidebarOpen ? (
                <button key={f.id || f.remote_id}
                  onClick={() => handleFolderClick(f.role || f.remote_id, f.id)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium" : "text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800"
                  }`}>
                  <span className="flex items-center gap-2 truncate"><Icon size={15} />{getFolderLabel(f.role, f.name, f.remote_id, lang)}</span>
                  {count > 0 && <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] bg-primary-500 text-white px-1 rounded-full shrink-0 font-semibold shadow-sm animate-badge-pop">{count > 99 ? "99+" : count}</span>}
                </button>
              ) : (
                <button key={f.id || f.remote_id}
                  onClick={() => handleFolderClick(f.role || f.remote_id, f.id)}
                  title={getFolderLabel(f.role, f.name, f.remote_id, lang)}
                  className={`flex items-center justify-center w-full p-2 rounded-lg transition-colors relative ${
                    isActive ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 hover:text-surface-700 dark:hover:text-surface-200 dark:text-surface-200"
                  }`}>
                  <Icon size={18} />
                  {count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center text-[9px] bg-primary-500 text-white rounded-full font-semibold shadow-sm px-0.5">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </button>
              )
            })
          ) : sidebarOpen ? (
            <>
              <SidebarFolderBtn icon={Inbox} label={getFolderLabel("inbox", "", "INBOX", lang)} active={activeFolder === "inbox"} onClick={() => handleFolderClick("inbox", null)} />
              <SidebarFolderBtn icon={Send} label={getFolderLabel("sent", "", "Sent", lang)} active={activeFolder === "sent"} onClick={() => handleFolderClick("sent", null)} />
              <SidebarFolderBtn icon={FileText} label={getFolderLabel("drafts", "", "Drafts", lang)} active={activeFolder === "drafts"} onClick={() => handleFolderClick("drafts", null)} />
              <SidebarFolderBtn icon={Trash2} label={getFolderLabel("trash", "", "Trash", lang)} active={activeFolder === "trash"} onClick={() => handleFolderClick("trash", null)} />
            </>
          ) : (
            <>
              <SidebarIconBtn icon={Inbox} title={getFolderLabel("inbox", "", "INBOX", lang)} active={activeFolder === "inbox"} onClick={() => handleFolderClick("inbox", null)} />
              <SidebarIconBtn icon={Send} title={getFolderLabel("sent", "", "Sent", lang)} active={activeFolder === "sent"} onClick={() => handleFolderClick("sent", null)} />
              <SidebarIconBtn icon={FileText} title={getFolderLabel("drafts", "", "Drafts", lang)} active={activeFolder === "drafts"} onClick={() => handleFolderClick("drafts", null)} />
              <SidebarIconBtn icon={Trash2} title={getFolderLabel("trash", "", "Trash", lang)} active={activeFolder === "trash"} onClick={() => handleFolderClick("trash", null)} />
            </>
          )}

          {sidebarOpen ? (
            <div className="pt-2 mt-2 border-t border-surface-200 dark:border-surface-700">
              {/* Starred filter */}
              <button onClick={() => setStarredFilter(!starredFilter)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                  starredFilter ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium" : "text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800"
                }`}>
                <Star size={15} className={starredFilter ? "text-amber-400 dark:text-amber-300 fill-amber-400 dark:fill-amber-300" : ""} />{t("mail.starred")}
              </button>

              {/* Account indicator — 多账户聚合视图，显示所有账户 */}
              {accounts.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 dark:text-surface-400 uppercase mb-1">{t("mail.account")}</p>
                  <div className="space-y-1">
                    {accounts.map(acc => (
                      <div key={acc.id} className="flex items-center gap-2 w-full px-1 py-1 text-xs truncate text-surface-600 dark:text-surface-300">
                        <div className="w-5 h-5 rounded bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-[10px] font-bold text-primary-700 dark:text-primary-300 shrink-0">{acc.email.charAt(0).toUpperCase()}</div>
                        <span className="truncate">{acc.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contacts */}
              <button onClick={() => setShowContacts(true)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 transition-colors">
                <Users size={15} />{t("mail.contacts")}
              </button>
            </div>
          ) : (
            <div className="pt-2 mt-2 border-t border-surface-200 dark:border-surface-700 flex flex-col items-center gap-0.5">
              {/* Starred filter */}
              <button onClick={() => setStarredFilter(!starredFilter)}
                title={t("mail.starred")}
                className={`flex items-center justify-center w-full p-2 rounded-lg transition-colors ${
                  starredFilter ? "text-amber-500 dark:text-amber-400" : "text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 hover:text-surface-700 dark:hover:text-surface-200 dark:text-surface-200"
                }`}>
                <Star size={16} className={starredFilter ? "fill-amber-400 dark:fill-amber-300" : ""} />
              </button>

              {/* Contacts */}
              <button onClick={() => setShowContacts(true)}
                title={t("mail.contacts")}
                className="flex items-center justify-center w-full p-2 rounded-lg text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 hover:text-surface-700 dark:hover:text-surface-200 dark:text-surface-200 transition-colors">
                <Users size={16} />
              </button>
            </div>
          )}

          {/* ── Position 3 (per user request): Sync / Compose / Settings + sidebar collapse toggle.
              Pushed to the bottom of the sidebar via mt-auto. In expanded mode the
              Compose button keeps a label; in collapsed mode it shrinks to an icon
              to match the existing icon-button style. ── */}
          <div className="mt-auto pt-2 border-t border-surface-200 dark:border-surface-700 flex flex-col gap-0.5">
            {/* Mark all as read */}
            <button onClick={handleMarkAllRead}
              title="将所有邮件标记为已读"
              className={`${sidebarOpen ? "flex items-center gap-2 px-3 py-2 text-sm" : "flex items-center justify-center w-full p-2"} rounded-lg transition-colors text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800`}>
              <CheckCheck size={sidebarOpen ? 15 : 18} />
              {sidebarOpen && <span>全部已读</span>}
            </button>

            {/* Sync */}
            <button onClick={handleSync} disabled={syncStatus.syncing}
              title="同步邮件"
              className={`${sidebarOpen ? "flex items-center gap-2 px-3 py-2 text-sm" : "flex items-center justify-center w-full p-2"} rounded-lg transition-colors text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 disabled:opacity-50`}>
              <RefreshCw size={sidebarOpen ? 15 : 18} className={syncStatus.syncing ? "animate-spin" : ""} />
              {sidebarOpen && <span>同步</span>}
            </button>

            {/* Compose */}
            <button onClick={() => openCompose()}
              title={t("mail.compose")}
              className={`${sidebarOpen ? "flex items-center gap-2 px-3 py-2 text-sm bg-primary-600 text-white hover:bg-primary-700" : "flex items-center justify-center w-full p-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"} rounded-lg transition-colors`}>
              <Plus size={sidebarOpen ? 15 : 18} />
              {sidebarOpen && <span>{t("mail.compose")}</span>}
            </button>

            {/* Settings */}
            <button onClick={() => setShowSettings(true)}
              title="设置"
              className={`${sidebarOpen ? "flex items-center gap-2 px-3 py-2 text-sm" : "flex items-center justify-center w-full p-2"} rounded-lg transition-colors text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800`}>
              <Settings size={sidebarOpen ? 15 : 18} />
              {sidebarOpen && <span>设置</span>}
            </button>

            {/* Desktop sidebar collapse toggle */}
            <button onClick={() => setSidebarOpen()}
              title="切换侧边栏"
              className={`${sidebarOpen ? "flex items-center gap-2 px-3 py-2 text-sm" : "flex items-center justify-center w-full p-2"} rounded-lg transition-colors text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800`}>
              {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeft size={18} />}
              {sidebarOpen && <span>收起侧边栏</span>}
            </button>
          </div>
        </div>

        {/* Message list + detail */}
        <div className="flex-1 flex min-w-0">
            {/* Message list - hidden on mobile when viewing detail */}
            <div className={`${!showMobileList ? "hidden lg:flex" : "flex"} flex-col lg:w-[360px] w-full shrink-0 border-r border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 overflow-auto`}>
              <div className="p-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500 dark:text-surface-400" />
                    <input ref={searchInputRef} type="text" placeholder={t("mail.search")} value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
                      className="w-full h-8 pl-7 pr-7 text-xs bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 dark:focus:ring-primary-400" />
                    {searchQuery && <button onClick={() => { setSearchQuery(""); handleSync() }} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500 dark:text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 dark:text-surface-300"><X size={12} /></button>}
                  </div>
                  <SearchFilters filters={searchFilters} onChange={setSearchFilters} onClear={() => setSearchFilters({ from: "", to: "", subject: "", dateFrom: "", dateTo: "", hasAttachment: false, folderId: null })} folders={dbFolders} />
                </div>
              </div>

              <div className="flex-1 divide-y divide-surface-100 dark:divide-surface-800">
                {contactFilterEmail && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800">
                    <Mail size={14} className="text-primary-500 dark:text-primary-400" />
                    <span className="text-sm text-primary-700 dark:text-primary-300">
                      与 {contactFilterName || contactFilterEmail} 的往来邮件 ({messages.length} 封)
                    </span>
                    <button
                      onClick={() => {
                        setContactFilter(null, null)
                        const accountIds = accounts.map(a => a.id).filter((id): id is number => id != null)
                        mailIpc.fetchMessagesMulti(accountIds, activeFolder, 1, PAGE_SIZE).then(result => {
                          setMessages(result.messages)
                          setTotalMessages(result.total)
                        }).catch(() => {})
                      }}
                      className="ml-auto text-xs text-primary-500 hover:text-primary-700 dark:hover:text-primary-300"
                    >
                      清除筛选
                    </button>
                  </div>
                )}
                {displayMessages.length === 0 && (
                  <div className="px-4 py-16 text-center">
                    <Inbox size={40} className="mx-auto text-surface-300 dark:text-surface-500 dark:text-surface-400 mb-3" />
                    {activeAccountId ? (searchQuery ? (
                      <><p className="text-sm text-surface-500 dark:text-surface-400 font-medium">{t("mail.emptySearch")}</p><p className="text-xs text-surface-400 dark:text-surface-500 dark:text-surface-400 mt-1">{t("mail.emptySearchHint")}</p></>
                    ) : (
                      <><p className="text-sm text-surface-500 dark:text-surface-400 font-medium">{t("mail.noMessages")}</p><p className="text-xs text-surface-400 dark:text-surface-500 dark:text-surface-400 mt-1 mb-3">{t("mail.noMessagesHint")}</p><Button size="sm" onClick={handleSync} disabled={syncStatus.syncing}><RefreshCw size={14} className={syncStatus.syncing ? "animate-spin" : ""} />{t("mail.syncNow")}</Button></>
                    )) : (
                      <><p className="text-sm text-surface-500 dark:text-surface-400 font-medium">{t("mail.noAccount")}</p><p className="text-xs text-surface-400 dark:text-surface-500 dark:text-surface-400 mt-1">{t("mail.noAccountHint")}</p></>
                    )}
                  </div>
                )}

                {displayMessages.map(msg => (
                  <div key={msg.id}
                    onClick={() => { handleSelectMessage(msg.id); if (!msg.is_read) { markRead(msg.id, true); if (activeFolderId) decrementFolderUnread(activeFolderId); mailIpc.markMessageRead(msg.id, true).catch(() => {}) } }}
                    className={`flex items-start gap-2 lg:gap-3 px-3 lg:px-4 py-2.5 lg:py-3 cursor-pointer transition-colors hover:bg-surface-50 dark:hover:bg-surface-800/50 ${selectedMessageId === msg.id ? "bg-primary-50/50 dark:bg-primary-900/20" : ""} ${!msg.is_read ? "bg-blue-50/30 dark:bg-blue-900/20" : ""}`}>
                    <button onClick={e => { e.stopPropagation(); toggleStar(msg.id); mailIpc.toggleMessageStar(msg.id).catch(() => {}) }}>
                      <Star size={13} className={msg.is_starred ? "text-amber-400 dark:text-amber-300 fill-amber-400 dark:fill-amber-300" : "text-surface-300 dark:text-surface-500 dark:text-surface-400"} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs lg:text-sm ${!msg.is_read ? "font-semibold" : ""} truncate`}>{msg.from_name || msg.from_email}</span>
                        <span className="text-[9px] lg:text-[10px] text-surface-400 dark:text-surface-500 dark:text-surface-400 shrink-0">{formatMailDate(msg.date)}</span>
                      </div>
                      <p className={`text-xs lg:text-sm mt-0.5 truncate ${!msg.is_read ? "font-semibold" : ""}`}>{msg.subject}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {msg.has_attachment && <Paperclip size={10} className="text-surface-400 dark:text-surface-500 dark:text-surface-400" />}
                        {!msg.is_read && <div className="w-1.5 h-1.5 rounded-full bg-primary-50 dark:bg-primary-900/300" />}
                      </div>
                    </div>
                  </div>
                ))}
                {displayMessages.length >= PAGE_SIZE && page < totalPages && (
                  <div className="px-4 py-2 text-center">
                    <Button variant="ghost" size="sm" onClick={() => handleGoToPage(page + 1)}><ChevronDown size={14} />{t("mail.loadMore")}</Button>
                  </div>
                )}
                {/* Pagination controls */}
                {totalPages > 1 && displayMessages.length > 0 && (
                  <div className="flex items-center justify-center gap-1 px-4 py-3 border-t border-surface-100 dark:border-surface-800">
                    <button
                      onClick={() => handleGoToPage(1)}
                      disabled={page <= 1}
                      className="p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleGoToPage(page - 1)}
                      disabled={page <= 1}
                      className="p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronDown size={14} className="rotate-90" />
                    </button>
                    <span className="text-xs text-surface-400 dark:text-surface-500 px-2 select-none whitespace-nowrap">
                      {page} / {totalPages}
                    </span>
                    <button
                      onClick={() => handleGoToPage(page + 1)}
                      disabled={page >= totalPages}
                      className="p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronDown size={14} className="-rotate-90" />
                    </button>
                    <button
                      onClick={() => handleGoToPage(totalPages)}
                      disabled={page >= totalPages}
                      className="p-1 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Message detail - full width on mobile */}
            <div className={`flex-1 bg-white dark:bg-surface-900 overflow-auto ${showMobileList ? "hidden lg:block" : "block"}`}>
              {selectedMessage ? (
                <div className="p-2 lg:p-4">
                  {/* Mobile back button */}
                  <button onClick={handleMobileBack} className="lg:hidden flex items-center gap-1 text-sm text-primary-500 dark:text-primary-400 mb-3">
                    <ChevronDown size={16} className="rotate-90" />返回
                  </button>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-0.5 flex-wrap">
                      <Button variant="ghost" size="sm" onClick={() => selectedMessageId && handleReply(selectedMessageId)}><Reply size={14} />{t("mail.reply")}</Button>
                      <Button variant="ghost" size="sm" onClick={() => selectedMessageId && handleForward(selectedMessageId)}><Forward size={14} />{t("mail.forward")}</Button>
                      <Button variant="ghost" size="sm" onClick={() => selectedMessageId && handleArchive(selectedMessageId)}><Archive size={14} />{t("mail.archiveAction")}</Button>
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-500 dark:text-red-400" onClick={() => selectedMessageId && handleDelete(selectedMessageId)}><Trash size={14} />{t("mail.delete")}</Button>
                  </div>
                  <h2 className="text-lg lg:text-xl font-semibold mb-2">{selectedMessage.subject}</h2>
                  <div className="flex items-center justify-between pb-3 border-b border-surface-200 dark:border-surface-700 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-sm lg:text-base">{(selectedMessage.from_name || selectedMessage.from_email).charAt(0)}</div>
                      <div>
                        <button
                          onClick={(e) => setContactMenu({ name: selectedMessage.from_name, email: selectedMessage.from_email, x: e.clientX, y: e.clientY })}
                          className="font-medium text-sm text-surface-700 dark:text-surface-200 hover:text-primary-600 dark:hover:text-primary-400 hover:underline transition-colors cursor-pointer"
                        >
                          {selectedMessage.from_name || selectedMessage.from_email}
                        </button>
                        <p className="text-xs text-surface-400 dark:text-surface-500 dark:text-surface-400">{selectedMessage.from_email}</p>
                        {selectedMessage.account_email && (() => {
                          const c = getAccountColor(selectedMessage.account_email)
                          return <span className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text}`}>
                            <Mail size={10} />收件账户：{selectedMessage.account_email}
                          </span>
                        })()}
                        <RecipientList
                          to_list={messageHeaders?.to_list || "[]"}
                          cc_list={messageHeaders?.cc_list || "[]"}
                          onContactClick={(name, email, e) => setContactMenu({ name, email, x: e.clientX, y: e.clientY })}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-surface-400 dark:text-surface-500 dark:text-surface-400">{selectedMessage.date.replace("T", " ")}</span>
                  </div>
                  {attachments.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-surface-500 dark:text-surface-400 mb-1.5 flex items-center gap-1"><Paperclip size={12} />{attachments.length} {t("mail.attachments")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {attachments.map(att => {
                          const isDownloading = downloadingAtts.has(att.id)
                          const ct = (att.content_type || "").toLowerCase()
                          const isPreviewable = ct.startsWith("image/") || ct === "application/pdf" || ct.startsWith("text/")
                          return (
                            <button
                              key={att.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isDownloading) return
                                if (isPreviewable) { handlePreviewAttachment(att) }
                                else if (att.local_path) { mailIpc.openFile(att.local_path).catch(() => {}) }
                                else { handleDownloadAttachment(att) }
                              }}
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors cursor-pointer max-w-[240px] ${
                                isPreviewable
                                  ? "bg-primary-50/60 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/30 text-primary-700 dark:text-primary-300"
                                  : "bg-surface-50 dark:bg-surface-800/50 border-surface-200 dark:border-surface-700 hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-300"
                              }`}
                              title={att.filename}
                            >
                              <FileText size={12} className="shrink-0" />
                              <span className="truncate">{att.filename}</span>
                              <span className="text-surface-400 dark:text-surface-500 dark:text-surface-400 shrink-0 text-[10px]">{formatFileSize(att.size)}</span>
                              {isDownloading && <Loader2 size={12} className="text-primary-500 dark:text-primary-400 animate-spin shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {previewAtt && (
                    <div className="mb-3 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-surface-50 dark:bg-surface-800/50 border-b border-surface-200 dark:border-surface-700">
                        <div className="flex items-center gap-2 text-xs">
                          <FileText size={14} />
                          <span className="font-medium truncate">{previewAtt.att.filename}</span>
                          <span className="text-surface-400 dark:text-surface-500">{formatFileSize(previewAtt.att.size)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {previewAtt.att.local_path && (
                            <Button variant="ghost" size="sm" onClick={() => mailIpc.openFile(previewAtt.att.local_path).catch(() => {})}>
                              <Download size={12} />打开
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setPreviewAtt(null)}>
                            <X size={14} />
                          </Button>
                        </div>
                      </div>
                      <div className="bg-white dark:bg-surface-900 max-h-[500px] overflow-auto">
                        {previewLoading ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 size={24} className="text-primary-500 dark:text-primary-400 animate-spin" />
                          </div>
                        ) : previewAtt.type === "image" ? (
                          <img src={previewAtt.dataUrl} alt={previewAtt.att.filename} className="max-w-full h-auto" />
                        ) : previewAtt.type === "pdf" ? (
                          <iframe src={previewAtt.dataUrl} className="w-full h-[500px]" title={previewAtt.att.filename} />
                        ) : previewAtt.type === "text" ? (
                          <pre className="p-4 text-xs overflow-auto whitespace-pre-wrap font-mono">{atob(previewAtt.dataUrl.split(",")[1])}</pre>
                        ) : null}
                      </div>
                    </div>
                  )}
                  <div className="text-surface-700 dark:text-surface-200">
                    {messageBody?.body_html ? (
                      <ShadowDomEmail html={messageBody.body_html} cidMap={cidMap} remoteImagesEnabled={remoteImagesEnabled} />
                    ) : messageBody?.body_text ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">{messageBody.body_text}</div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-surface-400 dark:text-surface-500 dark:text-surface-400">
                  <div className="text-center"><Mail size={48} className="mx-auto mb-3 text-surface-300 dark:text-surface-500 dark:text-surface-400" /><p className="text-sm">{t("mail.selectMessage")}</p></div>
                </div>
              )}
            </div>
          </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Modals */}
      {composeOpen && <ComposeDialog />}
      {showDraftRecovery && <DraftRecoveryDialog onRecover={handleDraftRecover} onDiscard={handleDraftDiscard} />}
      {showSettings && <AccountSettingsModal onClose={() => setShowSettings(false)} />}
      {showContacts && <ContactsModal onClose={() => setShowContacts(false)} />}

      {/* Contact action menu */}
      {contactMenu && (
        <ContactActionMenu
          name={contactMenu.name}
          email={contactMenu.email}
          position={{ x: contactMenu.x, y: contactMenu.y }}
          onClose={() => setContactMenu(null)}
          onAddToContacts={() => handleContactActionAdd(contactMenu.name, contactMenu.email)}
          onViewMessages={() => handleContactActionViewMessages(contactMenu.email, contactMenu.name)}
          onReply={() => handleContactActionReply(contactMenu.email, contactMenu.name, selectedMessage?.subject || "")}
        />
      )}

    </div>
  )
}

// Sidebar folder button helper
function SidebarFolderBtn({ icon: Icon, label, active, count, onClick }: { icon: typeof Inbox; label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium" : "text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800"
      }`}>
      <span className="flex items-center gap-2 truncate"><Icon size={15} />{label}</span>
      {count !== undefined && count > 0 && (
        <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] bg-primary-500 text-white px-1 rounded-full shrink-0 font-semibold shadow-sm">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  )
}

// Sidebar icon-only button helper (for collapsed state)
function SidebarIconBtn({ icon: Icon, title, active, onClick }: { icon: typeof Inbox; title: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-full p-2 rounded-lg transition-colors ${
        active ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300" : "text-surface-500 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 hover:text-surface-700 dark:hover:text-surface-200 dark:text-surface-200"
      }`}>
      <Icon size={18} />
    </button>
  )
}

export const Route = createFileRoute("/email")({ component: EmailPage })
