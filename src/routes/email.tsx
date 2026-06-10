import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useMailStore, type MailAccount, type MailContact } from "@/stores/mail-store"
import * as mailIpc from "@/lib/mail-ipc"
import { demoEmails } from "@/data/demo-data"
import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useTranslation } from "react-i18next"
import "@/lib/i18n"
import {
  Search, Star, Paperclip, Inbox, Send, Archive, Trash2, Plus, Settings,
  RefreshCw, X, Reply, Forward, Trash,
  Mail, Users, FileText, Loader2, CheckCircle2, AlertCircle,
  AlertTriangle, ChevronDown, Download, MessageSquare, Globe, Menu, PanelLeftClose, PanelLeft,
} from "lucide-react"
import { ShadowDomEmail } from "@/components/ShadowDomEmail"
import { ThreadView } from "@/components/ThreadView"
import { ThreadItem } from "@/components/ThreadItem"
import { ContactAutocomplete } from "@/components/ContactAutocomplete"
import { RichTextEditor } from "@/components/RichTextEditor"
import { SearchFilters, type SearchFiltersState } from "@/components/SearchFilters"
import { useComposeDraft } from "@/hooks/useComposeDraft"
import { useMailShortcuts } from "@/hooks/useMailShortcuts"

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

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm animate-in slide-in-from-bottom-4 ${
      type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
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
  const { accounts, addAccount: addAccountLocal, removeAccount: removeAccountLocal, setAccounts, activeAccountId, setActiveAccountId } = useMailStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<MailAccount>({
    email: "", provider: "imap", imap_host: "", imap_port: 993,
    smtp_host: "", smtp_port: 465, username: "", password: "",
    use_tls: true, sync_interval_secs: 300, sync_period_days: 30,
  })
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    mailIpc.listAccounts().then(ba => { if (ba.length > 0) setAccounts(ba) }).catch(() => {})
  }, [setAccounts])

  const handleEmailBlur = useCallback(() => {
    const provider = detectProvider(form.email)
    if (provider) {
      setForm(f => ({ ...f, imap_host: provider.imap, imap_port: provider.imapPort, smtp_host: provider.smtp, smtp_port: provider.smtpPort, username: f.email.split("@")[0], provider: "imap" }))
    }
  }, [form.email])

  const handleAdd = async () => {
    setSaving(true); setError(null); setSyncResult(null)
    try {
      const accountId = await mailIpc.addAccount(form)
      const connResult = await mailIpc.testConnection(form)
      setTestResult(connResult)
      if (!connResult.includes("成功")) { setError(connResult); setSaving(false); return }
      setSyncResult("正在同步...")
      await mailIpc.syncAccount(accountId)
      setSyncResult("同步完成")
      addAccountLocal({ ...form, id: accountId })
      const refreshed = await mailIpc.listAccounts(); setAccounts(refreshed)
      const msgs = await mailIpc.fetchMessages(accountId); useMailStore.getState().setMessages(msgs)
      setShowAdd(false)
      setForm({ email: "", provider: "imap", imap_host: "", imap_port: 993, smtp_host: "", smtp_port: 465, username: "", password: "", use_tls: true, sync_interval_secs: 300, sync_period_days: 30 })
    } catch (err: unknown) { setError(`操作失败: ${err instanceof Error ? err.message : String(err)}`) }
    finally { setSaving(false) }
  }

  const handleRemove = async (id: number) => {
    try { await mailIpc.deleteAccount(id); removeAccountLocal(id) } catch {}
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try { setTestResult(await mailIpc.testConnection(form)) }
    catch { setTestResult("连接失败") }
    finally { setTesting(false) }
  }

  const [lang, setLang] = useState(() => localStorage.getItem("easywork-lang") || "zh")
  const toggleLang = () => {
    const next = lang === "zh" ? "en" : "zh"
    setLang(next); localStorage.setItem("easywork-lang", next)
    import("i18next").then(i18n => i18n.default.changeLanguage(next))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[560px] max-h-[85vh] overflow-auto bg-white rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("account.title")}</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600"><X size={20} /></button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={toggleLang}><Globe size={14} />{lang === "zh" ? "EN" : "中文"}</Button>
        </div>

        {accounts.length === 0 && !showAdd && (
          <div className="text-center py-8">
            <Mail size={40} className="mx-auto text-surface-300 mb-3" />
            <p className="text-surface-500 font-medium">{t("account.noAccounts")}</p>
            <p className="text-surface-400 text-sm mt-1 mb-4">{t("account.noAccountsHint")}</p>
            <Button onClick={() => setShowAdd(true)}><Plus size={16} />{t("account.addAccount")}</Button>
          </div>
        )}

        {accounts.map(acc => (
          <Card key={acc.id} className={activeAccountId === acc.id ? "ring-2 ring-primary-500" : ""}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => acc.id && setActiveAccountId(acc.id)}>
                <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center text-primary-700 font-bold">{acc.email.charAt(0).toUpperCase()}</div>
                <div><p className="font-medium text-sm">{acc.email}</p><p className="text-xs text-surface-400">IMAP: {acc.imap_host}:{acc.imap_port}</p></div>
              </div>
              <div className="flex items-center gap-1">
                {activeAccountId === acc.id && <Badge variant="success">{t("account.current")}</Badge>}
                <Button variant="ghost" size="icon" onClick={() => acc.id && handleRemove(acc.id)}><Trash2 size={14} className="text-surface-400 hover:text-red-500" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {showAdd && (
          <div className="space-y-3 border border-primary-200 rounded-xl p-4">
            <h3 className="font-semibold text-sm">{t("account.addAccount")}</h3>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} onBlur={handleEmailBlur} placeholder="example@gmail.com" className="w-full h-9 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder={t("account.username")} className="h-9 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={t("account.password")} className="h-9 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={form.imap_host} onChange={e => setForm(f => ({ ...f, imap_host: e.target.value }))} placeholder={t("account.imapServer")} className="h-9 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <input type="number" value={form.imap_port} onChange={e => setForm(f => ({ ...f, imap_port: Number(e.target.value) }))} placeholder={t("account.imapPort")} className="h-9 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={form.smtp_host} onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))} placeholder={t("account.smtpServer")} className="h-9 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              <input type="number" value={form.smtp_port} onChange={e => setForm(f => ({ ...f, smtp_port: Number(e.target.value) }))} placeholder={t("account.smtpPort")} className="h-9 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            {testResult && <div className={`text-xs p-2 rounded ${testResult.includes("成功") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{testResult}</div>}
            {error && <div className="text-xs p-2 rounded bg-red-50 text-red-700">{error}</div>}
            {syncResult && <div className="text-xs p-2 rounded bg-blue-50 text-blue-700">{syncResult}</div>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : null}{t("account.save")}</Button>
              <Button size="sm" variant="outline" onClick={handleTest} disabled={testing}>{t("account.testConnection")}</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setError(null) }}>{t("mail.cancel")}</Button>
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
  const { contacts, setContacts, activeAccountId } = useMailStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", phone: "", group_name: "", notes: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (activeAccountId) { mailIpc.listContacts(activeAccountId).then(setContacts).catch(() => {}) }
  }, [activeAccountId, setContacts])

  const handleAdd = async () => {
    if (!activeAccountId) return; setSaving(true)
    try {
      await mailIpc.addContact({ account_id: activeAccountId, name: form.name, email: form.email, phone: form.phone, group_name: form.group_name, notes: form.notes })
      setContacts(await mailIpc.listContacts(activeAccountId))
      setShowAdd(false); setForm({ name: "", email: "", phone: "", group_name: "", notes: "" })
    } catch {} finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    try { await mailIpc.deleteContact(id); setContacts(contacts.filter(c => c.id !== id)) } catch {}
  }

  const defaultContacts: MailContact[] = [
    { id: 1, account_id: 0, name: "张伟", email: "zhangwei@example.com", phone: "13800138000", group_name: "同事", notes: "" },
    { id: 2, account_id: 0, name: "李娜", email: "lina@example.com", phone: "13900139000", group_name: "朋友", notes: "" },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[480px] max-h-[80vh] overflow-auto bg-white rounded-2xl shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("contacts.title")}</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600"><X size={20} /></button>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={14} />{t("contacts.newContact")}</Button>
        {(contacts.length > 0 ? contacts : defaultContacts).map(c => (
          <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-surface-200 group hover:bg-surface-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-200 flex items-center justify-center text-xs font-semibold">{c.name.charAt(0)}</div>
              <div><p className="text-sm font-medium">{c.name}</p><p className="text-xs text-surface-400">{c.email}</p></div>
            </div>
            <button onClick={() => c.id && handleDelete(c.id)} className="opacity-0 group-hover:opacity-100 text-surface-400 hover:text-red-500"><Trash2 size={14} /></button>
          </div>
        ))}
        {showAdd && (
          <div className="space-y-2 border border-primary-200 rounded-xl p-4">
            <input type="text" placeholder={t("contacts.name")} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full h-9 px-3 border border-surface-300 rounded-lg text-sm" />
            <input type="email" placeholder={t("contacts.email")} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full h-9 px-3 border border-surface-300 rounded-lg text-sm" />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={saving}>{t("account.save")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>{t("mail.cancel")}</Button>
            </div>
          </div>
        )}
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
  const [to, setTo] = useState(composeData?.to || initialDraft?.to || "")
  const [cc, setCc] = useState(composeData?.cc || initialDraft?.cc || "")
  const [bcc, setBcc] = useState(composeData?.bcc || initialDraft?.bcc || "")
  const [subject, setSubject] = useState(composeData?.subject || initialDraft?.subject || "")
  const [body, setBody] = useState(composeData?.body || initialDraft?.body || "")
  const [bodyHtml, setBodyHtml] = useState("")
  const [showCc, setShowCc] = useState(!!(composeData?.cc || initialDraft?.cc))
  const [showBcc, setShowBcc] = useState(!!(composeData?.bcc || initialDraft?.bcc))
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<mailIpc.SendResult | null>(null)
  const [draftIndicator, setDraftIndicator] = useState("")

  const draftIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => {
    draftIntervalRef.current = setInterval(() => {
      if (to || cc || bcc || subject || body) {
        saveDraft({ to, cc, bcc, subject, body, accountId: activeAccountId })
        setDraftIndicator(t("mail.draftSaved")); setTimeout(() => setDraftIndicator(""), 2000)
      }
    }, 5000)
    return () => { if (draftIntervalRef.current) clearInterval(draftIntervalRef.current) }
  }, [to, cc, bcc, subject, body, activeAccountId, saveDraft, t])

  useEffect(() => {
    return () => { if (to || subject || body) saveDraft({ to, cc, bcc, subject, body, accountId: activeAccountId }) }
  }, []) // eslint-disable-line

  const handleSend = async () => {
    if (!activeAccountId || !accounts.length) return
    setSending(true); setSendResult(null)
    try {
      const result = await mailIpc.sendMail({
        account_id: activeAccountId, to, subject, body_text: body,
        body_html: bodyHtml || undefined, cc: cc || undefined, bcc: bcc || undefined,
        in_reply_to: composeData?.inReplyTo, references: composeData?.references,
      })
      setSendResult(result)
      if (result.success) { setSyncStatus({ lastResult: t("mail.sendSuccess") }); clearDraft(); setTimeout(() => closeCompose(), 1500) }
    } catch (err: unknown) { setSendResult({ success: false, error: err instanceof Error ? err.message : String(err) }) }
    finally { setSending(false) }
  }

  const handleClose = () => { clearDraft(); closeCompose() }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-[90vw] max-w-[680px] max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-3 border-b border-surface-200">
          <h3 className="font-semibold text-sm">{composeData?.isReply ? t("mail.reply") : composeData?.isForward ? t("mail.forward") : t("mail.compose")}</h3>
          <button onClick={handleClose} className="text-surface-400 hover:text-surface-600"><X size={16} /></button>
        </div>
        <div className="flex-1 p-3 space-y-1 overflow-auto">
          <div className="flex items-center border-b border-surface-200">
            <span className="text-xs text-surface-400 w-10 shrink-0">{t("mail.to")}</span>
            <ContactAutocomplete value={to} onChange={setTo} contacts={contacts} className="flex-1" />
            {!showCc && <button onClick={() => setShowCc(true)} className="text-xs text-primary-500 px-2 shrink-0">{t("mail.addCc")}</button>}
          </div>
          {showCc && (
            <div className="flex items-center border-b border-surface-200">
              <span className="text-xs text-surface-400 w-10 shrink-0">{t("mail.cc")}</span>
              <ContactAutocomplete value={cc} onChange={setCc} contacts={contacts} className="flex-1" />
              {!showBcc && <button onClick={() => setShowBcc(true)} className="text-xs text-primary-500 px-2 shrink-0">{t("mail.addBcc")}</button>}
            </div>
          )}
          {showBcc && (
            <div className="flex items-center border-b border-surface-200">
              <span className="text-xs text-surface-400 w-10 shrink-0">{t("mail.bcc")}</span>
              <ContactAutocomplete value={bcc} onChange={setBcc} contacts={contacts} className="flex-1" />
            </div>
          )}
          <div className="flex items-center border-b border-surface-200">
            <span className="text-xs text-surface-400 w-10 shrink-0">{t("mail.subject")}</span>
            <input type="text" placeholder={t("mail.subject")} value={subject} onChange={e => setSubject(e.target.value)} className="flex-1 h-9 px-1 border-0 text-sm focus:outline-none" />
          </div>
          <RichTextEditor content={body} onChange={(html, text) => { setBody(text); setBodyHtml(html) }} placeholder={t("mail.body")} />
          {draftIndicator && <div className="text-xs text-surface-400 italic">{draftIndicator}</div>}
          {sendResult && (
            <div className={`flex items-center gap-2 p-2 rounded-lg text-xs ${sendResult.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {sendResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{sendResult.success ? t("mail.sendSuccess") : sendResult.error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between p-3 border-t border-surface-200">
          <span className="text-xs text-surface-400">{accounts.find(a => a.id === activeAccountId)?.email || "..."}</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose}>{t("mail.cancel")}</Button>
            <Button size="sm" onClick={handleSend} disabled={sending || !to || !subject}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{t("mail.send")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ==================== Draft Recovery ====================

function DraftRecoveryDialog({ onRecover, onDiscard }: { onRecover: () => void; onDiscard: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-[380px] shadow-2xl">
        <CardContent className="p-5 space-y-3">
          <h3 className="font-semibold">{t("mail.draftRecoveryTitle")}</h3>
          <p className="text-sm text-surface-500">{t("mail.draftRecoveryMsg")}</p>
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
  } = useMailStore()

  const [dbFolders, setDbFolders] = useState<mailIpc.MailFolder[]>([])
  const [attachments, setAttachments] = useState<mailIpc.AttachmentInfo[]>([])
  const [page, setPage] = useState(1)
  const [messageBodies, setMessageBodies] = useState<Record<number, { body_text: string; body_html: string } | null>>({})
  const [threadViewId, setThreadViewId] = useState<string | null>(null)
  const [starredFilter, setStarredFilter] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { hasDraft, clearDraft } = useComposeDraft()
  const [showDraftRecovery, setShowDraftRecovery] = useState(hasDraft)
  const [showSettings, setShowSettings] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true
    return window.innerWidth >= 1440
  })
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [showMobileList, setShowMobileList] = useState(true)
  const [searchFilters, setSearchFilters] = useState<SearchFiltersState>({
    from: "", to: "", subject: "", dateFrom: "", dateTo: "", hasAttachment: false, folderId: null,
  })

  const lang = localStorage.getItem("easywork-lang") || "zh"

  // Auto-collapse sidebar on laptop / smaller screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1440) setSidebarOpen(false)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Load folders
  useEffect(() => {
    if (activeAccountId) {
      mailIpc.listFolders(activeAccountId).then(folders => {
        setDbFolders(folders)
        mailIpc.folderUnreadCounts(activeAccountId).then(counts => {
          const map: Record<number, number> = {}
          counts.forEach(([fid, c]) => { map[fid] = c })
          setFolderUnreadCounts(map)
        }).catch(() => {})
      }).catch(() => setDbFolders([]))
    } else { setDbFolders([]) }
  }, [activeAccountId, setFolderUnreadCounts])

  // Sorted folders
  const sortedFolders = useMemo(() => {
    return [...dbFolders].sort((a, b) => getFolderSortOrder(a) - getFolderSortOrder(b))
  }, [dbFolders])

  const folderIcons: Record<string, typeof Inbox> = {
    inbox: Inbox, sent: Send, drafts: FileText, trash: Trash2, junk: AlertTriangle, archive: Archive,
  }

  // Select message
  const handleSelectMessage = useCallback(async (id: number | null) => {
    selectMessage(id)
    if (id === null) { setAttachments([]); return }
    try {
      const body = await mailIpc.getMessageBody(id)
      setMessageBody(body)
      setMessageBodies(prev => ({ ...prev, [id]: body }))
      setAttachments(await mailIpc.listMessageAttachments(id).catch(() => []))
      setShowMobileList(false)
    } catch { setMessageBody({ body_text: "(无法加载)", body_html: "" }); setAttachments([]) }
  }, [selectMessage, setMessageBody])

  // Sync & Refresh (merged)
  const handleSync = useCallback(async () => {
    if (!activeAccountId) return
    setSyncStatus({ syncing: true })
    try {
      const result = await mailIpc.syncAccount(activeAccountId)
      setToast({ message: `${result.folders_count} 个文件夹, ${result.messages_new} 封新邮件`, type: "success" })
      let folderId: number | undefined
      const folder = dbFolders.find(f => f.role === activeFolder || f.remote_id === activeFolder)
      folderId = folder?.id ?? dbFolders.find(f => f.role === "inbox")?.id ?? undefined
      const allMessages = await mailIpc.fetchMessages(activeAccountId, folderId, 1, 50)
      setMessages(allMessages)
      // Refresh unread counts after sync
      mailIpc.folderUnreadCounts(activeAccountId).then(counts => {
        const map: Record<number, number> = {}
        counts.forEach(([fid, c]) => { map[fid] = c })
        setFolderUnreadCounts(map)
      }).catch(() => {})
      setSyncStatus({ syncing: false, lastSyncAt: new Date().toLocaleTimeString() })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setToast({ message: `同步失败: ${msg}`, type: "error" })
      setSyncStatus({ syncing: false })
    }
  }, [activeAccountId, activeFolder, dbFolders, setMessages, setSyncStatus, setFolderUnreadCounts])

  // Search
  const handleSearch = useCallback(async () => {
    if (!activeAccountId || !searchQuery.trim()) { handleSync(); return }
    setLoadingMessages(true)
    try { setMessages(await mailIpc.searchMessages(activeAccountId, searchQuery) as any) }
    catch { setToast({ message: "搜索失败", type: "error" }) }
    finally { setLoadingMessages(false) }
  }, [activeAccountId, searchQuery, setMessages, setLoadingMessages, handleSync])

  // Pagination
  const handleLoadMore = useCallback(async () => {
    if (!activeAccountId) return
    const nextPage = page + 1
    try { const more = await mailIpc.fetchMessages(activeAccountId, undefined, nextPage, 50); if (more.length > 0) { setMessages([...messages, ...more]); setPage(nextPage) } } catch {}
  }, [activeAccountId, page, messages, setMessages])

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

  // Folder click
  const handleFolderClick = useCallback((role: string, folderId: number | null) => {
    setActiveFolder(role, folderId); setStarredFilter(false); setThreadViewId(null)
    if (folderId) {
      setLoadingMessages(true)
      mailIpc.fetchMessages(activeAccountId!, folderId).then(setMessages).finally(() => setLoadingMessages(false))
    } else {
      mailIpc.fetchMessages(activeAccountId!).then(setMessages)
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

  // Auto-refresh on mount
  useEffect(() => {
    if (activeAccountId) { handleSync() }
  }, [activeAccountId])

  // Thread groups
  const threadGroups = useMemo(() => {
    if (starredFilter || searchQuery) return {}
    const groups: Record<string, { messages: typeof messages; latestSubject: string }> = {}
    for (const msg of messages) {
      const tid = (msg as any).thread_id || `msg_${msg.id}`
      if (!groups[tid]) groups[tid] = { messages: [], latestSubject: msg.subject }
      groups[tid].messages.push(msg)
    }
    return groups
  }, [messages, starredFilter, searchQuery])

  // Display messages with filters
  const displayMessages = useMemo(() => {
    let msgs = starredFilter
      ? messages.filter(m => m.is_starred)
      : messages.length > 0 ? messages : (activeAccountId ? [] : demoEmails.map((e, i) => ({
          id: i + 1, account_id: 0, remote_uid: i + 1, subject: e.subject,
          from_name: e.fromName, from_email: e.from, date: e.date,
          is_read: e.read, is_starred: e.starred, has_attachment: e.hasAttachment, size: 0,
        })))
    if (searchFilters.from) msgs = msgs.filter(m => m.from_name.toLowerCase().includes(searchFilters.from.toLowerCase()) || m.from_email.toLowerCase().includes(searchFilters.from.toLowerCase()))
    if (searchFilters.subject) msgs = msgs.filter(m => m.subject.toLowerCase().includes(searchFilters.subject.toLowerCase()))
    if (searchFilters.hasAttachment) msgs = msgs.filter(m => m.has_attachment)
    if (searchFilters.dateFrom) msgs = msgs.filter(m => m.date >= searchFilters.dateFrom)
    if (searchFilters.dateTo) msgs = msgs.filter(m => m.date.split("T")[0] <= searchFilters.dateTo)
    return msgs
  }, [messages, starredFilter, activeAccountId, searchFilters])

  const selectedMessage = selectedMessageId ? displayMessages.find(m => m.id === selectedMessageId) : null

  const handleDraftRecover = () => { setShowDraftRecovery(false); openCompose() }
  const handleDraftDiscard = () => { clearDraft(); setShowDraftRecovery(false) }

  // Mobile back to list
  const handleMobileBack = () => { setShowMobileList(true); selectMessage(null) }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)] -m-6 bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-200 bg-white shrink-0 gap-2">
        <div className="flex items-center gap-1">
          {/* Mobile sidebar toggle */}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100 lg:hidden" title="切换侧边栏">
            <Menu size={18} />
          </button>
          {/* Desktop sidebar toggle */}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100" title="切换侧边栏">
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        </div>
        <div className="flex items-center gap-1">
          {/* Account selector */}
          {accounts.length > 1 && (
            <select value={activeAccountId ?? ""} onChange={e => useMailStore.getState().setActiveAccountId(Number(e.target.value) || null)}
              className="h-8 px-2 text-xs border border-surface-200 rounded-lg bg-surface-50 max-w-[160px]">
              {accounts.map(a => <option key={a.id} value={a.id ?? ""}>{a.email}</option>)}
            </select>
          )}
          {/* Sync (single button) */}
          <Button variant="ghost" size="sm" onClick={handleSync} disabled={syncStatus.syncing} title="同步邮件">
            <RefreshCw size={15} className={syncStatus.syncing ? "animate-spin" : ""} />
          </Button>
          {/* Compose */}
          <Button size="sm" onClick={() => openCompose()} className="gap-1">
            <Plus size={15} />{t("mail.compose")}
          </Button>
          {/* Settings dropdown */}
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)} title="设置">
            <Settings size={16} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar - collapsible */}
        {sidebarOpen && (
          <div className="w-48 lg:w-52 shrink-0 border-r border-surface-200 bg-surface-50/50 p-2 space-y-0.5 overflow-auto">
            {/* System folders (sorted: inbox, sent, drafts, trash, junk, archive) */}
            {sortedFolders.length > 0 ? (
              sortedFolders.map(f => {
                const isActive = activeFolder === (f.role || f.remote_id)
                const Icon = folderIcons[f.role] || Inbox
                const count = (f.id && folderUnreadCounts[f.id]) || 0
                return (
                  <button key={f.id || f.remote_id}
                    onClick={() => handleFolderClick(f.role || f.remote_id, f.id)}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive ? "bg-primary-50 text-primary-700 font-medium" : "text-surface-600 hover:bg-surface-100"
                    }`}>
                    <span className="flex items-center gap-2 truncate"><Icon size={15} />{getFolderLabel(f.role, f.name, f.remote_id, lang)}</span>
                    {count > 0 && <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] bg-primary-500 text-white px-1 rounded-full shrink-0 font-semibold shadow-sm animate-badge-pop">{count > 99 ? "99+" : count}</span>}
                  </button>
                )
              })
            ) : (
              <>
                <SidebarFolderBtn icon={Inbox} label={getFolderLabel("inbox", "", "INBOX", lang)} active={activeFolder === "inbox"} onClick={() => handleFolderClick("inbox", null)} />
                <SidebarFolderBtn icon={Send} label={getFolderLabel("sent", "", "Sent", lang)} active={activeFolder === "sent"} onClick={() => handleFolderClick("sent", null)} />
                <SidebarFolderBtn icon={FileText} label={getFolderLabel("drafts", "", "Drafts", lang)} active={activeFolder === "drafts"} onClick={() => handleFolderClick("drafts", null)} />
                <SidebarFolderBtn icon={Trash2} label={getFolderLabel("trash", "", "Trash", lang)} active={activeFolder === "trash"} onClick={() => handleFolderClick("trash", null)} />
              </>
            )}

            <div className="pt-2 mt-2 border-t border-surface-200">
              {/* Starred filter */}
              <button onClick={() => { setStarredFilter(!starredFilter); setThreadViewId(null) }}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                  starredFilter ? "bg-amber-50 text-amber-700 font-medium" : "text-surface-600 hover:bg-surface-100"
                }`}>
                <Star size={15} className={starredFilter ? "text-amber-400 fill-amber-400" : ""} />{t("mail.starred")}
              </button>

              {/* Account indicator */}
              {accounts.length > 0 && (
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold text-surface-400 uppercase mb-1">{t("mail.account")}</p>
                  {accounts.map(acc => (
                    <button key={acc.id}
                      onClick={() => useMailStore.getState().setActiveAccountId(acc.id ?? null)}
                      className={`flex items-center gap-2 w-full px-1 py-1 text-xs rounded transition-colors truncate ${
                        activeAccountId === acc.id ? "text-primary-700 font-medium" : "text-surface-500 hover:bg-surface-100"
                      }`}>
                      <div className="w-5 h-5 rounded bg-primary-100 flex items-center justify-center text-[10px] font-bold text-primary-700">{acc.email.charAt(0).toUpperCase()}</div>
                      <span className="truncate">{acc.email.split("@")[0]}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Contacts */}
              <button onClick={() => setShowContacts(true)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-surface-600 hover:bg-surface-100 transition-colors">
                <Users size={15} />{t("mail.contacts")}
              </button>
            </div>
          </div>
        )}

        {/* Thread view or message list + detail */}
        {threadViewId ? (
          <div className="flex-1 min-w-0">
            <ThreadView threadId={threadViewId} messages={messages} onBack={() => setThreadViewId(null)}
              onSelectMessage={id => handleSelectMessage(id)} selectedMessageId={selectedMessageId} messageBodies={messageBodies} />
          </div>
        ) : (
          <div className="flex-1 flex min-w-0">
            {/* Message list - hidden on mobile when viewing detail */}
            <div className={`${!showMobileList ? "hidden lg:flex" : "flex"} flex-col lg:w-[360px] w-full shrink-0 border-r border-surface-200 bg-white overflow-auto`}>
              <div className="p-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" />
                    <input ref={searchInputRef} type="text" placeholder={t("mail.search")} value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
                      className="w-full h-8 pl-7 pr-7 text-xs bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500" />
                    {searchQuery && <button onClick={() => { setSearchQuery(""); handleSync() }} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"><X size={12} /></button>}
                  </div>
                  <SearchFilters filters={searchFilters} onChange={setSearchFilters} onClear={() => setSearchFilters({ from: "", to: "", subject: "", dateFrom: "", dateTo: "", hasAttachment: false, folderId: null })} folders={dbFolders} />
                </div>
              </div>

              <div className="flex-1 divide-y divide-surface-100">
                {displayMessages.length === 0 && (
                  <div className="px-4 py-16 text-center">
                    <Inbox size={40} className="mx-auto text-surface-300 mb-3" />
                    {activeAccountId ? (searchQuery ? (
                      <><p className="text-sm text-surface-500 font-medium">{t("mail.emptySearch")}</p><p className="text-xs text-surface-400 mt-1">{t("mail.emptySearchHint")}</p></>
                    ) : (
                      <><p className="text-sm text-surface-500 font-medium">{t("mail.noMessages")}</p><p className="text-xs text-surface-400 mt-1 mb-3">{t("mail.noMessagesHint")}</p><Button size="sm" onClick={handleSync} disabled={syncStatus.syncing}><RefreshCw size={14} className={syncStatus.syncing ? "animate-spin" : ""} />{t("mail.syncNow")}</Button></>
                    )) : (
                      <><p className="text-sm text-surface-500 font-medium">{t("mail.noAccount")}</p><p className="text-xs text-surface-400 mt-1">{t("mail.noAccountHint")}</p></>
                    )}
                  </div>
                )}

                {/* Thread grouping */}
                {!starredFilter && !searchQuery && Object.keys(threadGroups).length > 0 ? (
                  Object.values(threadGroups).map(group => {
                    const latest = group.messages[0]
                    const replyCount = group.messages.length - 1
                    return (
                      <ThreadItem key={latest.id} message={latest} replyCount={replyCount}
                        isSelected={selectedMessageId === latest.id}
                        onClick={() => {
                          if (replyCount > 0 && (latest as any).thread_id) { setThreadViewId((latest as any).thread_id) }
                          else { handleSelectMessage(latest.id); if (!latest.is_read) { markRead(latest.id, true); if (activeFolderId) decrementFolderUnread(activeFolderId); mailIpc.markMessageRead(latest.id, true).catch(() => {}) } }
                        }}
                        onStar={() => { toggleStar(latest.id); mailIpc.toggleMessageStar(latest.id).catch(() => {}) }}
                      />
                    )
                  })
                ) : displayMessages.map(msg => (
                  <div key={msg.id}
                    onClick={() => { handleSelectMessage(msg.id); if (!msg.is_read) { markRead(msg.id, true); if (activeFolderId) decrementFolderUnread(activeFolderId); mailIpc.markMessageRead(msg.id, true).catch(() => {}) } }}
                    className={`flex items-start gap-2 lg:gap-3 px-3 lg:px-4 py-2.5 lg:py-3 cursor-pointer transition-colors hover:bg-surface-50 ${selectedMessageId === msg.id ? "bg-primary-50/50" : ""} ${!msg.is_read ? "bg-blue-50/30" : ""}`}>
                    <button onClick={e => { e.stopPropagation(); toggleStar(msg.id); mailIpc.toggleMessageStar(msg.id).catch(() => {}) }}>
                      <Star size={13} className={msg.is_starred ? "text-amber-400 fill-amber-400" : "text-surface-300"} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs lg:text-sm ${!msg.is_read ? "font-semibold" : ""} truncate`}>{msg.from_name || msg.from_email}</span>
                        <span className="text-[9px] lg:text-[10px] text-surface-400 shrink-0">{msg.date.includes("T") ? msg.date.split("T")[0] : msg.date.slice(0, 10)}</span>
                      </div>
                      <p className={`text-xs lg:text-sm mt-0.5 truncate ${!msg.is_read ? "font-semibold" : ""}`}>{msg.subject}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {msg.has_attachment && <Paperclip size={10} className="text-surface-400" />}
                        {!msg.is_read && <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />}
                      </div>
                    </div>
                  </div>
                ))}
                {displayMessages.length >= 50 && (
                  <div className="px-4 py-2 text-center">
                    <Button variant="ghost" size="sm" onClick={handleLoadMore}><ChevronDown size={14} />{t("mail.loadMore")}</Button>
                  </div>
                )}
              </div>
            </div>

            {/* Message detail - full width on mobile */}
            <div className={`flex-1 bg-white overflow-auto ${showMobileList ? "hidden lg:block" : "block"}`}>
              {selectedMessage ? (
                <div className="p-3 lg:p-6">
                  {/* Mobile back button */}
                  <button onClick={handleMobileBack} className="lg:hidden flex items-center gap-1 text-sm text-primary-500 mb-3">
                    <ChevronDown size={16} className="rotate-90" />返回
                  </button>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-0.5 flex-wrap">
                      <Button variant="ghost" size="sm" onClick={() => selectedMessageId && handleReply(selectedMessageId)}><Reply size={14} />{t("mail.reply")}</Button>
                      <Button variant="ghost" size="sm" onClick={() => selectedMessageId && handleForward(selectedMessageId)}><Forward size={14} />{t("mail.forward")}</Button>
                      <Button variant="ghost" size="sm" onClick={() => selectedMessageId && handleArchive(selectedMessageId)}><Archive size={14} />{t("mail.archiveAction")}</Button>
                      {(selectedMessage as any).thread_id && (selectedMessage as any).thread_id !== `msg_${selectedMessage.id}` && (
                        <Button variant="ghost" size="sm" onClick={() => setThreadViewId((selectedMessage as any).thread_id || `msg_${selectedMessage.id}`)}><MessageSquare size={14} />{t("mail.thread")}</Button>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => selectedMessageId && handleDelete(selectedMessageId)}><Trash size={14} />{t("mail.delete")}</Button>
                  </div>
                  <h2 className="text-lg lg:text-xl font-semibold mb-2">{selectedMessage.subject}</h2>
                  <div className="flex items-center justify-between pb-3 border-b border-surface-200 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm lg:text-base">{(selectedMessage.from_name || selectedMessage.from_email).charAt(0)}</div>
                      <div><p className="font-medium text-sm">{selectedMessage.from_name || selectedMessage.from_email}</p><p className="text-xs text-surface-400">{selectedMessage.from_email}</p></div>
                    </div>
                    <span className="text-xs text-surface-400">{selectedMessage.date.replace("T", " ")}</span>
                  </div>
                  {attachments.length > 0 && (
                    <div className="mb-3 p-2 lg:p-3 bg-surface-50 rounded-lg">
                      <p className="text-xs font-medium text-surface-500 mb-1.5"><Paperclip size={12} className="inline mr-1" />{attachments.length} {t("mail.attachments")}</p>
                      <div className="space-y-1">
                        {attachments.map(att => (
                          <div key={att.id} className="flex items-center justify-between text-xs p-2 bg-white rounded border border-surface-200">
                            <span className="truncate flex-1">{att.filename}</span>
                            <span className="text-surface-400 mx-2">{formatFileSize(att.size)}</span>
                            <Download size={14} className="text-surface-400 hover:text-primary-500 cursor-pointer" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="text-surface-700">
                    {messageBody?.body_html ? (
                      <ShadowDomEmail html={messageBody.body_html} />
                    ) : messageBody?.body_text ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">{messageBody.body_text}</div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-surface-400">
                  <div className="text-center"><Mail size={48} className="mx-auto mb-3 text-surface-300" /><p className="text-sm">{t("mail.selectMessage")}</p></div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Modals */}
      {composeOpen && <ComposeDialog />}
      {showDraftRecovery && <DraftRecoveryDialog onRecover={handleDraftRecover} onDiscard={handleDraftDiscard} />}
      {showSettings && <AccountSettingsModal onClose={() => setShowSettings(false)} />}
      {showContacts && <ContactsModal onClose={() => setShowContacts(false)} />}

    </div>
  )
}

// Sidebar folder button helper
function SidebarFolderBtn({ icon: Icon, label, active, count, onClick }: { icon: typeof Inbox; label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? "bg-primary-50 text-primary-700 font-medium" : "text-surface-600 hover:bg-surface-100"
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

export const Route = createFileRoute("/email")({ component: EmailPage })
