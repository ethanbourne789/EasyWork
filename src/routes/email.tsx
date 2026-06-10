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
  Mail, UserPlus, Users, FileText, Loader2, CheckCircle2, AlertCircle, CloudLightning,
  AlertTriangle, ChevronDown, Download, MessageSquare, Globe,
} from "lucide-react"
import { ShadowDomEmail } from "@/components/ShadowDomEmail"
import { ThreadView } from "@/components/ThreadView"
import { ThreadItem } from "@/components/ThreadItem"
import { ContactAutocomplete } from "@/components/ContactAutocomplete"
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

// ==================== Account Management ====================

function AccountManager() {
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
    mailIpc.listAccounts().then((backendAccounts) => {
      if (backendAccounts.length > 0) setAccounts(backendAccounts)
    }).catch(() => {})
  }, [setAccounts])

  const handleEmailBlur = useCallback(() => {
    const provider = detectProvider(form.email)
    if (provider) {
      setForm(f => ({
        ...f,
        imap_host: provider.imap, imap_port: provider.imapPort,
        smtp_host: provider.smtp, smtp_port: provider.smtpPort,
        username: f.email.split("@")[0], provider: "imap",
      }))
    }
  }, [form.email])

  const handleAdd = async () => {
    setSaving(true); setError(null); setSyncResult(null)
    try {
      const accountId = await mailIpc.addAccount(form)
      const connResult = await mailIpc.testConnection(form)
      setTestResult(connResult)
      if (!connResult.includes("成功")) { setError(connResult); setSaving(false); return }
      setSyncResult("正在同步文件夹和邮件...")
      const syncRes = await mailIpc.syncAccount(accountId)
      setSyncResult(`同步完成: ${syncRes.folders_count} 个文件夹, ${syncRes.messages_new} 封新邮件`)
      addAccountLocal({ ...form, id: accountId })
      const refreshedAccounts = await mailIpc.listAccounts()
      setAccounts(refreshedAccounts)
      const messages = await mailIpc.fetchMessages(accountId)
      useMailStore.getState().setMessages(messages)
      setShowAdd(false); setForm({ email: "", provider: "imap", imap_host: "", imap_port: 993, smtp_host: "", smtp_port: 465, username: "", password: "", use_tls: true, sync_interval_secs: 300, sync_period_days: 30 })
    } catch (err: unknown) {
      setError(`操作失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally { setSaving(false) }
  }

  const handleRemove = async (id: number) => {
    try { await mailIpc.deleteAccount(id); removeAccountLocal(id) }
    catch (err: unknown) { setError(`删除失败: ${err instanceof Error ? err.message : String(err)}`) }
  }

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setError(null)
    try { const result = await mailIpc.testConnection(form); setTestResult(result) }
    catch (err: unknown) { setTestResult(`连接失败: ${err instanceof Error ? err.message : String(err)}`) }
    finally { setTesting(false) }
  }

  const [lang, setLang] = useState(() => localStorage.getItem("easywork-lang") || "zh")
  const toggleLang = () => {
    const next = lang === "zh" ? "en" : "zh"
    setLang(next); localStorage.setItem("easywork-lang", next)
    import("i18next").then(i18n => i18n.default.changeLanguage(next))
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("account.title")}</h1>
          <p className="text-surface-500 text-sm mt-1">{t("account.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={toggleLang}><Globe size={14} />{lang === "zh" ? "EN" : "中文"}</Button>
          <Button onClick={() => { setShowAdd(true); setTestResult(null) }}><Plus size={16} />{t("account.addAccount")}</Button>
        </div>
      </div>

      {accounts.length === 0 && !showAdd && (
        <Card className="border-dashed"><CardContent className="p-12 text-center">
          <Mail size={48} className="mx-auto text-surface-300 mb-4" />
          <p className="text-surface-500 font-medium">{t("account.noAccounts")}</p>
          <p className="text-surface-400 text-sm mt-1 mb-4">{t("account.noAccountsHint")}</p>
          <Button onClick={() => setShowAdd(true)}><Plus size={16} />{t("account.addAccount")}</Button>
        </CardContent></Card>
      )}

      {accounts.map((acc) => (
        <Card key={acc.id} className={`hover:shadow-sm transition-shadow cursor-pointer ${activeAccountId === acc.id ? "ring-2 ring-primary-500" : ""}`}
          onClick={() => acc.id && setActiveAccountId(acc.id)}>
          <CardContent className="p-4"><div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-lg">{acc.email.charAt(0).toUpperCase()}</div>
              <div><p className="font-medium">{acc.email}</p><p className="text-xs text-surface-400">IMAP: {acc.imap_host}:{acc.imap_port} · SMTP: {acc.smtp_host}:{acc.smtp_port}</p></div>
            </div>
            <div className="flex items-center gap-2">
              {activeAccountId === acc.id && <Badge variant="success">{t("account.current")}</Badge>}
              <Badge variant="success">{t("account.connected")}</Badge>
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); acc.id && handleRemove(acc.id) }}><Trash2 size={16} className="text-surface-400 hover:text-red-500" /></Button>
            </div>
          </div></CardContent>
        </Card>
      ))}

      {showAdd && (
        <Card className="border-primary-200"><CardContent className="p-6 space-y-4">
          <h3 className="font-semibold text-lg">{t("account.addAccount")}</h3>
          <div><label className="text-sm font-medium text-surface-700 block mb-1">{t("account.emailAddress")}</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} onBlur={handleEmailBlur} placeholder="example@gmail.com" className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium text-surface-700 block mb-1">{t("account.username")}</label><input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
            <div><label className="text-sm font-medium text-surface-700 block mb-1">{t("account.password")}</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium text-surface-700 block mb-1">{t("account.imapServer")}</label><input type="text" value={form.imap_host} onChange={e => setForm(f => ({ ...f, imap_host: e.target.value }))} className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
            <div><label className="text-sm font-medium text-surface-700 block mb-1">{t("account.imapPort")}</label><input type="number" value={form.imap_port} onChange={e => setForm(f => ({ ...f, imap_port: Number(e.target.value) }))} className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium text-surface-700 block mb-1">{t("account.smtpServer")}</label><input type="text" value={form.smtp_host} onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))} className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
            <div><label className="text-sm font-medium text-surface-700 block mb-1">{t("account.smtpPort")}</label><input type="number" value={form.smtp_port} onChange={e => setForm(f => ({ ...f, smtp_port: Number(e.target.value) }))} className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" /></div>
          </div>
          <div className="flex items-center gap-4">
            <div><label className="text-sm font-medium text-surface-700 block mb-1">{t("account.syncPeriod")}</label>
              <select value={form.sync_period_days} onChange={e => setForm(f => ({ ...f, sync_period_days: Number(e.target.value) }))} className="h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value={7}>{t("account.last7Days")}</option><option value={30}>{t("account.last30Days")}</option><option value={90}>{t("account.last90Days")}</option><option value={365}>{t("account.lastYear")}</option><option value={0}>{t("account.allMail")}</option>
              </select>
            </div>
            <div><label className="text-sm font-medium text-surface-700 block mb-1">{t("account.syncInterval")}</label>
              <select value={form.sync_interval_secs} onChange={e => setForm(f => ({ ...f, sync_interval_secs: Number(e.target.value) }))} className="h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value={60}>{t("account.minute")}</option><option value={300}>{t("account.minutes5")}</option><option value={900}>{t("account.minutes15")}</option><option value={1800}>{t("account.minutes30")}</option>
              </select>
            </div>
          </div>
          {testResult && <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult.includes("成功") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{testResult.includes("成功") ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}{testResult}</div>}
          {error && <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-700"><AlertCircle size={16} />{error}</div>}
          {syncResult && <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-blue-50 text-blue-700"><RefreshCw size={16} className="animate-spin" />{syncResult}</div>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAdd} disabled={saving || testing}>{saving ? <Loader2 size={16} className="animate-spin" /> : null}{saving ? t("account.saving") : t("account.save")}</Button>
            <Button variant="outline" onClick={handleTest} disabled={testing}>{testing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}{t("account.testConnection")}</Button>
            <Button variant="ghost" onClick={() => { setShowAdd(false); setTestResult(null); setError(null); setSyncResult(null) }}>{t("mail.cancel")}</Button>
          </div>
        </CardContent></Card>
      )}
    </div>
  )
}

// ==================== Contacts ====================

function ContactsManager() {
  const { t } = useTranslation()
  const { contacts, setContacts, activeAccountId } = useMailStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", phone: "", group_name: "", notes: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (activeAccountId) { mailIpc.listContacts(activeAccountId).then(setContacts).catch(() => {}) }
  }, [activeAccountId, setContacts])

  const handleAdd = async () => {
    if (!activeAccountId) return; setSaving(true); setError(null)
    try {
      await mailIpc.addContact({ account_id: activeAccountId, name: form.name, email: form.email, phone: form.phone, group_name: form.group_name, notes: form.notes })
      const updated = await mailIpc.listContacts(activeAccountId); setContacts(updated)
      setShowAdd(false); setForm({ name: "", email: "", phone: "", group_name: "", notes: "" })
    } catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    try { await mailIpc.deleteContact(id); setContacts(contacts.filter(c => c.id !== id)) }
    catch (err: unknown) { setError(err instanceof Error ? err.message : String(err)) }
  }

  const defaultContacts: MailContact[] = [
    { id: 1, account_id: 0, name: "张伟", email: "zhangwei@example.com", phone: "13800138000", group_name: "同事", notes: "技术部" },
    { id: 2, account_id: 0, name: "李娜", email: "lina@example.com", phone: "13900139000", group_name: "朋友", notes: "" },
    { id: 3, account_id: 0, name: "王磊", email: "wanglei@company.com", phone: "13700137000", group_name: "同事", notes: "项目经理" },
    { id: 4, account_id: 0, name: "陈静", email: "chenjing@example.com", phone: "13600136000", group_name: "家人", notes: "" },
  ]
  const allContacts = contacts.length > 0 ? contacts : defaultContacts
  const groups = [...new Set(allContacts.map(c => c.group_name).filter(Boolean))]

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold tracking-tight">{t("contacts.title")}</h1><p className="text-surface-500 text-sm mt-1">{t("contacts.subtitle")}</p></div>
        <Button onClick={() => setShowAdd(true)}><Plus size={16} />{t("contacts.newContact")}</Button>
      </div>
      {error && <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-700"><AlertCircle size={16} />{error}</div>}
      {groups.length > 0 && <div className="flex gap-2 flex-wrap">{groups.map(g => <Badge key={g} variant="default">{g}</Badge>)}</div>}
      <div className="grid gap-3">
        {allContacts.map((c) => (
          <Card key={c.id} className="hover:shadow-sm transition-shadow group">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-200 flex items-center justify-center text-surface-600 font-semibold">{c.name.charAt(0)}</div>
                <div><p className="font-medium">{c.name}</p><p className="text-xs text-surface-400">{c.email} · {c.phone}</p></div>
              </div>
              <div className="flex items-center gap-2"><Badge variant="default">{c.group_name}</Badge><button onClick={() => c.id && handleDelete(c.id)} className="opacity-0 group-hover:opacity-100 text-surface-400 hover:text-red-500 transition-opacity"><Trash2 size={14} /></button></div>
            </CardContent>
          </Card>
        ))}
      </div>
      {showAdd && (
        <Card className="border-primary-200"><CardContent className="p-6 space-y-3">
          <h3 className="font-semibold">{t("contacts.newContact")}</h3>
          <input type="text" placeholder={t("contacts.name")} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <input type="email" placeholder={t("contacts.email")} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <input type="tel" placeholder={t("contacts.phone")} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <input type="text" placeholder={t("contacts.group")} value={form.group_name} onChange={e => setForm(f => ({ ...f, group_name: e.target.value }))} className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <div className="flex gap-2 pt-2"><Button onClick={handleAdd} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : null}{t("account.save")}</Button><Button variant="ghost" onClick={() => setShowAdd(false)}>{t("mail.cancel")}</Button></div>
        </CardContent></Card>
      )}
    </div>
  )
}

// ==================== Compose Dialog ====================

function ComposeDialog() {
  const { t } = useTranslation()
  const { composeData, closeCompose, accounts, activeAccountId, setSyncStatus, contacts } = useMailStore()
  const { saveDraft, clearDraft, loadDraft, hasDraft } = useComposeDraft()
  const initialDraft = loadDraft()
  const [to, setTo] = useState(composeData?.to || initialDraft?.to || "")
  const [cc, setCc] = useState(composeData?.cc || initialDraft?.cc || "")
  const [bcc, setBcc] = useState(composeData?.bcc || initialDraft?.bcc || "")
  const [subject, setSubject] = useState(composeData?.subject || initialDraft?.subject || "")
  const [body, setBody] = useState(composeData?.body || initialDraft?.body || "")
  const [showCc, setShowCc] = useState(!!(composeData?.cc || initialDraft?.cc))
  const [showBcc, setShowBcc] = useState(!!(composeData?.bcc || initialDraft?.bcc))
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<mailIpc.SendResult | null>(null)
  const [draftIndicator, setDraftIndicator] = useState("")

  // Auto-save draft every 5 seconds
  const draftIntervalRef = useRef<ReturnType<typeof setInterval>>()
  useEffect(() => {
    draftIntervalRef.current = setInterval(() => {
      if (to || cc || bcc || subject || body) {
        saveDraft({ to, cc, bcc, subject, body, accountId: activeAccountId })
        setDraftIndicator(t("mail.draftSaved"))
        setTimeout(() => setDraftIndicator(""), 2000)
      }
    }, 5000)
    return () => { if (draftIntervalRef.current) clearInterval(draftIntervalRef.current) }
  }, [to, cc, bcc, subject, body, activeAccountId, saveDraft, t])

  // Save draft on unmount if there's content
  useEffect(() => {
    return () => { if (to || subject || body) saveDraft({ to, cc, bcc, subject, body, accountId: activeAccountId }) }
  }, []) // eslint-disable-line

  const handleSend = async () => {
    if (!activeAccountId || !accounts.length) return
    setSending(true); setSendResult(null)
    try {
      const result = await mailIpc.sendMail({
        account_id: activeAccountId, to, subject, body_text: body,
        body_html: undefined, cc: cc || undefined, bcc: bcc || undefined,
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
      <Card className="w-[680px] max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-200">
          <h3 className="font-semibold">{composeData?.isReply ? t("mail.reply") : composeData?.isForward ? t("mail.forward") : t("mail.compose")}</h3>
          <button onClick={handleClose} className="text-surface-400 hover:text-surface-600"><X size={18} /></button>
        </div>
        <div className="flex-1 p-4 space-y-2 overflow-auto">
          <div className="flex items-center border-b border-surface-200">
            <span className="text-xs text-surface-400 w-12 shrink-0">{t("mail.to")}</span>
            <ContactAutocomplete value={to} onChange={setTo} contacts={contacts} placeholder={t("mail.to")} className="flex-1" />
            {!showCc && <button onClick={() => setShowCc(true)} className="text-xs text-primary-500 hover:text-primary-600 px-2 shrink-0">{t("mail.addCc")}</button>}
          </div>
          {showCc && (
            <div className="flex items-center border-b border-surface-200">
              <span className="text-xs text-surface-400 w-12 shrink-0">{t("mail.cc")}</span>
              <ContactAutocomplete value={cc} onChange={setCc} contacts={contacts} placeholder="cc@example.com" className="flex-1" />
              {!showBcc && <button onClick={() => setShowBcc(true)} className="text-xs text-primary-500 hover:text-primary-600 px-2 shrink-0">{t("mail.addBcc")}</button>}
            </div>
          )}
          {showBcc && (
            <div className="flex items-center border-b border-surface-200">
              <span className="text-xs text-surface-400 w-12 shrink-0">{t("mail.bcc")}</span>
              <ContactAutocomplete value={bcc} onChange={setBcc} contacts={contacts} placeholder="bcc@example.com" className="flex-1" />
            </div>
          )}
          <div className="flex items-center border-b border-surface-200">
            <span className="text-xs text-surface-400 w-12 shrink-0">{t("mail.subject")}</span>
            <input type="text" placeholder={t("mail.subject")} value={subject} onChange={e => setSubject(e.target.value)} className="flex-1 h-10 px-2 border-0 text-sm focus:outline-none" />
          </div>
          <textarea placeholder={t("mail.body")} value={body} onChange={e => setBody(e.target.value)} rows={12} className="w-full px-2 py-3 border-0 text-sm focus:outline-none resize-none" />
          {draftIndicator && <div className="text-xs text-surface-400 italic">{draftIndicator}</div>}
          {sendResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${sendResult.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {sendResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}{sendResult.success ? t("mail.sendSuccess") : sendResult.error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between p-4 border-t border-surface-200">
          <span className="text-xs text-surface-400">{t("mail.from")}: {accounts.find(a => a.id === activeAccountId)?.email || "..."}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose}>{t("mail.cancel")}</Button>
            <Button onClick={handleSend} disabled={sending || !to || !subject}>
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{t("mail.send")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ==================== Draft Recovery Dialog ====================

function DraftRecoveryDialog({ onRecover, onDiscard }: { onRecover: () => void; onDiscard: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-[400px] shadow-2xl">
        <CardContent className="p-6 space-y-4">
          <h3 className="font-semibold text-lg">{t("mail.draftRecoveryTitle")}</h3>
          <p className="text-sm text-surface-500">{t("mail.draftRecoveryMsg")}</p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onDiscard}>{t("mail.discard")}</Button>
            <Button onClick={onRecover}>{t("mail.continue")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ==================== Main Email Page ====================

function EmailPage() {
  const { t } = useTranslation()
  const {
    messages, selectedMessageId, messageBody,
    selectMessage, markRead, toggleStar, removeMessage,
    activeView, activeFolder, activeFolderId,
    setActiveView, setActiveFolder, openCompose, composeOpen, accounts,
    activeAccountId, setMessages, loadingMessages, setLoadingMessages,
    syncStatus, setSyncStatus, setMessageBody,
    searchQuery, setSearchQuery, folderUnreadCounts, setFolderUnreadCounts,
    contacts, setAccounts,
  } = useMailStore()

  const [dbFolders, setDbFolders] = useState<mailIpc.MailFolder[]>([])
  const refreshingRef = useRef(false)
  const [attachments, setAttachments] = useState<mailIpc.AttachmentInfo[]>([])
  const [page, setPage] = useState(1)
  const [messageBodies, setMessageBodies] = useState<Record<number, { body_text: string; body_html: string } | null>>({})
  const [threadViewId, setThreadViewId] = useState<string | null>(null)
  const [starredFilter, setStarredFilter] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { hasDraft, loadDraft, clearDraft } = useComposeDraft()
  const [showDraftRecovery, setShowDraftRecovery] = useState(hasDraft)

  // Load folders and unread counts
  useEffect(() => {
    if (activeAccountId) {
      mailIpc.listFolders(activeAccountId).then(folders => {
        setDbFolders(folders)
        mailIpc.folderUnreadCounts(activeAccountId).then(counts => {
          const map: Record<number, number> = {}
          counts.forEach(([folderId, count]) => { map[folderId] = count })
          setFolderUnreadCounts(map)
        }).catch(() => {})
      }).catch(() => setDbFolders([]))
    } else { setDbFolders([]) }
  }, [activeAccountId, setFolderUnreadCounts])

  const folderIcons: Record<string, typeof Inbox> = { inbox: Inbox, sent: Send, drafts: FileText, trash: Trash2, junk: AlertTriangle, archive: Archive }

  const folders = dbFolders.length > 0
    ? dbFolders.map((f) => ({
        id: f.role || f.remote_id, folderId: f.id, remoteId: f.remote_id,
        icon: folderIcons[f.role] || Inbox, label: f.name || f.remote_id,
        count: (f.id && folderUnreadCounts[f.id]) || 0,
      }))
    : [{ id: "inbox", folderId: null, remoteId: "INBOX", icon: Inbox, label: t("mail.inbox"), count: 0 },
       { id: "sent", folderId: null, remoteId: "Sent", icon: Send, label: t("mail.sent"), count: 0 },
       { id: "drafts", folderId: null, remoteId: "Drafts", icon: FileText, label: t("mail.drafts"), count: 0 },
       { id: "trash", folderId: null, remoteId: "Trash", icon: Trash2, label: t("mail.trash"), count: 0 }]

  // Load email body and attachments
  const handleSelectMessage = useCallback(async (id: number | null) => {
    selectMessage(id)
    if (id === null) { setAttachments([]); return }
    try {
      const body = await mailIpc.getMessageBody(id)
      setMessageBody(body)
      setMessageBodies(prev => ({ ...prev, [id]: body }))
      const atts = await mailIpc.listMessageAttachments(id).catch(() => [])
      setAttachments(atts)
    } catch { setMessageBody({ body_text: t("mail.loadingBody"), body_html: "" }); setAttachments([]) }
  }, [selectMessage, setMessageBody, t])

  // Sync
  const handleSync = useCallback(async () => {
    if (!activeAccountId) return
    setSyncStatus({ syncing: true, lastError: null, lastResult: null })
    try {
      const result = await mailIpc.syncAccount(activeAccountId)
      const statusMsg = `${result.folders_count} folders, ${result.messages_new} new / ${result.messages_total} total`
      setSyncStatus({ syncing: false, lastResult: statusMsg, lastSyncAt: new Date().toLocaleTimeString() })
      if (result.error) setSyncStatus({ lastError: result.error })
    } catch (err: unknown) { setSyncStatus({ syncing: false, lastError: `Sync failed: ${err instanceof Error ? err.message : String(err)}` }) }
  }, [activeAccountId, setSyncStatus])

  // Refresh messages
  const handleRefresh = useCallback(async (resetPage = true) => {
    if (!activeAccountId || refreshingRef.current) return
    refreshingRef.current = true; setLoadingMessages(true); if (resetPage) setPage(1)
    try {
      await handleSync()
      let folderId: number | undefined
      if (activeFolder !== "inbox" && activeFolder !== "sent" && activeFolder !== "drafts" && activeFolder !== "trash") {
        folderId = dbFolders.find(f => f.remote_id === activeFolder || f.role === activeFolder)?.id ?? undefined
      } else { folderId = dbFolders.find(f => f.role === "inbox")?.id ?? undefined }
      const allMessages = await mailIpc.fetchMessages(activeAccountId, folderId, 1, 50)
      setMessages(allMessages)
    } catch (err: unknown) { setSyncStatus({ lastError: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`, syncing: false }) }
    finally { setLoadingMessages(false); refreshingRef.current = false }
  }, [activeAccountId, activeFolder, dbFolders, handleSync, setMessages, setLoadingMessages, setSyncStatus])

  // Search
  const handleSearch = useCallback(async () => {
    if (!activeAccountId || !searchQuery.trim()) { handleRefresh(); return }
    setLoadingMessages(true)
    try { setMessages(await mailIpc.searchMessages(activeAccountId, searchQuery) as unknown as typeof messages) }
    catch (err: unknown) { setSyncStatus({ lastError: `搜索失败: ${err instanceof Error ? err.message : String(err)}` }) }
    finally { setLoadingMessages(false) }
  }, [activeAccountId, searchQuery, setMessages, setLoadingMessages, setSyncStatus, handleRefresh])

  // Pagination
  const handleLoadMore = useCallback(async () => {
    if (!activeAccountId) return; const nextPage = page + 1
    try { const more = await mailIpc.fetchMessages(activeAccountId, undefined, nextPage, 50); if (more.length > 0) { setMessages([...messages, ...more]); setPage(nextPage) } } catch {}
  }, [activeAccountId, page, messages, setMessages])

  // Delete / Archive
  const handleDelete = useCallback(async (msgId: number) => { try { await mailIpc.deleteMessage(msgId); removeMessage(msgId); setSyncStatus({ lastResult: t("mail.deleted") }) } catch {} }, [removeMessage, setSyncStatus, t])
  const handleArchive = useCallback(async (msgId: number) => { try { await mailIpc.archiveMessage(msgId); removeMessage(msgId); setSyncStatus({ lastResult: t("mail.archived") }) } catch {} }, [removeMessage, setSyncStatus, t])

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
  const handleFolderClick = useCallback((folderId: string, dbFolderId: number | null) => { setActiveFolder(folderId, dbFolderId); setThreadViewId(null) }, [setActiveFolder])

  // Thread view - group messages by thread_id
  const threadGroups = useMemo(() => {
    if (starredFilter) return {}
    const groups: Record<string, { messages: typeof messages; latestSubject: string; latestFrom: string; latestDate: string }> = {}
    for (const msg of messages) {
      const tid = msg.thread_id || `msg_${msg.id}`
      if (!groups[tid]) groups[tid] = { messages: [], latestSubject: msg.subject, latestFrom: msg.from_name || msg.from_email, latestDate: msg.date }
      groups[tid].messages.push(msg)
    }
    return groups
  }, [messages, starredFilter])

  // Keyboard shortcuts
  useMailShortcuts({
    onNewCompose: () => openCompose(),
    onReply: () => selectedMessageId && handleReply(selectedMessageId),
    onForward: () => selectedMessageId && handleForward(selectedMessageId),
    onDelete: () => selectedMessageId && handleDelete(selectedMessageId),
    onArchive: () => selectedMessageId && handleArchive(selectedMessageId),
    onRefresh: () => handleRefresh(),
    onSearch: () => searchInputRef.current?.focus(),
  })

  // Auto-refresh on account/folder change
  useEffect(() => {
    if (activeAccountId) {
      mailIpc.listFolders(activeAccountId).then(folders => {
        setDbFolders(folders)
        mailIpc.folderUnreadCounts(activeAccountId).then(counts => { const map: Record<number, number> = {}; counts.forEach(([fid, c]) => { map[fid] = c }); setFolderUnreadCounts(map) }).catch(() => {})
      }).catch(() => setDbFolders([]))
      handleRefresh()
    }
  }, [activeAccountId, activeFolder])

  // Display messages
  const displayMessages = starredFilter
    ? messages.filter(m => m.is_starred)
    : messages.length > 0 ? messages : (activeAccountId ? [] : demoEmails.map((e, i) => ({
        id: i + 1, account_id: 0, remote_uid: i + 1,
        subject: e.subject, from_name: e.fromName, from_email: e.from,
        date: e.date, is_read: e.read, is_starred: e.starred,
        has_attachment: e.hasAttachment, size: 0,
      })))

  const selectedMessage = selectedMessageId ? displayMessages.find(m => m.id === selectedMessageId) : null

  // Draft recovery
  const handleDraftRecover = () => { setShowDraftRecovery(false); openCompose() }
  const handleDraftDiscard = () => { clearDraft(); setShowDraftRecovery(false) }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)] -m-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-200 bg-white shrink-0">
        <div className="flex items-center gap-1">
          <Button variant={activeView === "inbox" ? "secondary" : "ghost"} size="sm" onClick={() => { setActiveView("inbox"); setThreadViewId(null) }}><Mail size={14} />{t("mail.inbox")}</Button>
          <Button variant={starredFilter ? "secondary" : "ghost"} size="sm" onClick={() => { setStarredFilter(!starredFilter); setThreadViewId(null) }}><Star size={14} className={starredFilter ? "text-amber-400" : ""} />{t("mail.starred")}</Button>
          <Button variant={activeView === "account" ? "secondary" : "ghost"} size="sm" onClick={() => setActiveView("account")}><Settings size={14} />{t("mail.account")}</Button>
          <Button variant={activeView === "contacts" ? "secondary" : "ghost"} size="sm" onClick={() => setActiveView("contacts")}><Users size={14} />{t("mail.contacts")}</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleRefresh()} disabled={syncStatus.syncing}><RefreshCw size={16} className={syncStatus.syncing || loadingMessages ? "animate-spin" : ""} /></Button>
          <Button variant="ghost" size="sm" onClick={handleSync} disabled={syncStatus.syncing || !activeAccountId}><CloudLightning size={16} />{t("mail.syncNow")}</Button>
          {accounts.length > 1 && (
            <select value={activeAccountId ?? ""} onChange={e => { const id = Number(e.target.value); useMailStore.getState().setActiveAccountId(id || null) }} className="h-8 px-2 text-xs border border-surface-200 rounded-lg bg-surface-50">
              {accounts.map(a => <option key={a.id} value={a.id ?? ""}>{a.email}</option>)}
            </select>
          )}
          <Button onClick={() => openCompose()}><Plus size={16} />{t("mail.compose")}</Button>
        </div>
      </div>

      {/* Sync status bar */}
      {(syncStatus.lastResult || syncStatus.lastError) && (
        <div className={`flex items-center gap-2 px-4 py-2 text-xs border-b shrink-0 ${syncStatus.lastError ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
          {syncStatus.lastError ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
          <span>{syncStatus.lastError || syncStatus.lastResult}</span>
          {syncStatus.lastSyncAt && <span className="text-surface-400 ml-auto">{syncStatus.lastSyncAt}</span>}
          <button onClick={() => setSyncStatus({ lastResult: null, lastError: null })} className="ml-2 hover:opacity-70"><X size={14} /></button>
        </div>
      )}

      {/* Content */}
      {activeView === "account" ? (
        <div className="flex-1 overflow-auto p-6"><AccountManager /></div>
      ) : activeView === "contacts" ? (
        <div className="flex-1 overflow-auto p-6"><ContactsManager /></div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Folder sidebar */}
          <div className="w-44 shrink-0 border-r border-surface-200 bg-white p-3 space-y-1 overflow-auto">
            {folders.map((f) => (
              <button key={f.id} onClick={() => handleFolderClick(f.id, f.folderId)}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors ${activeFolder === f.id ? "bg-primary-50 text-primary-700 font-medium" : "text-surface-600 hover:bg-surface-100"}`}>
                <span className="flex items-center gap-2 truncate"><f.icon size={16} />{f.label}</span>
                {f.count > 0 && <span className="text-xs bg-primary-500 text-white px-1.5 py-0.5 rounded-full shrink-0 ml-1 font-medium">{f.count}</span>}
              </button>
            ))}
            <div className="pt-3 mt-3 border-t border-surface-100">
              <p className="text-[10px] font-semibold text-surface-400 uppercase px-3 mb-2">{t("mail.account")}</p>
              {accounts.length > 0 ? accounts.map((acc) => (
                <button key={acc.id} onClick={() => useMailStore.getState().setActiveAccountId(acc.id ?? null)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs w-full rounded transition-colors ${activeAccountId === acc.id ? "bg-primary-50 text-primary-700" : "text-surface-500 hover:bg-surface-100"}`}>
                  <div className="w-5 h-5 rounded bg-primary-100 flex items-center justify-center text-[10px] font-bold text-primary-700">{acc.email.charAt(0).toUpperCase()}</div>
                  <span className="truncate">{acc.email}</span>
                </button>
              )) : <div className="px-3 text-xs text-surface-400">{t("mail.noAccount")}<button onClick={() => setActiveView("account")} className="text-primary-500 hover:underline ml-1">{t("mail.configure")}</button></div>}
            </div>
          </div>

          {/* Thread view mode */}
          {threadViewId ? (
            <div className="flex-1 min-w-0">
              <ThreadView
                threadId={threadViewId}
                messages={messages}
                onBack={() => setThreadViewId(null)}
                onSelectMessage={(id) => handleSelectMessage(id)}
                selectedMessageId={selectedMessageId}
                messageBodies={messageBodies}
              />
            </div>
          ) : (
            <>
              {/* Message list */}
              <div className="w-96 shrink-0 border-r border-surface-200 bg-white overflow-auto">
                <div className="p-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                    <input ref={searchInputRef} type="text" placeholder={t("mail.search")} value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
                      className="w-full h-8 pl-8 pr-8 text-xs bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500" />
                    {searchQuery && <button onClick={() => { setSearchQuery(""); handleRefresh() }} className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"><X size={12} /></button>}
                  </div>
                </div>
                <div className="divide-y divide-surface-100">
                  {displayMessages.length === 0 && (
                    <div className="px-4 py-12 text-center">
                      <Inbox size={40} className="mx-auto text-surface-300 mb-3" />
                      {activeAccountId ? (searchQuery ? <><p className="text-sm text-surface-500 font-medium">{t("mail.emptySearch")}</p><p className="text-xs text-surface-400 mt-1">{t("mail.emptySearchHint")}</p></> :
                        <><p className="text-sm text-surface-500 font-medium">{t("mail.noMessages")}</p><p className="text-xs text-surface-400 mt-1 mb-3">{t("mail.noMessagesHint")}</p><Button size="sm" onClick={handleSync} disabled={syncStatus.syncing}><CloudLightning size={14} />{t("mail.syncNow")}</Button></>) :
                        <><p className="text-sm text-surface-500 font-medium">{t("mail.noAccount")}</p><p className="text-xs text-surface-400 mt-1 mb-3">{t("mail.noAccountHint")}</p><Button size="sm" onClick={() => setActiveView("account")}><Settings size={14} />{t("mail.configure")}</Button></>)}
                    </div>
                  )}
                  {/* Group by thread when not starred and not searching */}
                  {!starredFilter && !searchQuery && Object.keys(threadGroups).length > 0 ? (
                    Object.values(threadGroups).map((group) => {
                      const latest = group.messages[0]
                      const replyCount = group.messages.length - 1
                      return (
                        <ThreadItem
                          key={latest.id}
                          message={latest}
                          replyCount={replyCount}
                          isSelected={selectedMessageId === latest.id}
                          onClick={() => { if (replyCount > 0 && latest.thread_id) { setThreadViewId(latest.thread_id) } else { handleSelectMessage(latest.id); if (!latest.is_read) { markRead(latest.id, true); mailIpc.markMessageRead(latest.id, true).catch(() => {}) } } }}
                          onStar={() => { toggleStar(latest.id); mailIpc.toggleMessageStar(latest.id).catch(() => {}) }}
                        />
                      )
                    })
                  ) : displayMessages.map((msg) => (
                    <div key={msg.id}
                      onClick={() => { handleSelectMessage(msg.id); if (!msg.is_read) { markRead(msg.id, true); mailIpc.markMessageRead(msg.id, true).catch(() => {}) } }}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-surface-50 ${selectedMessageId === msg.id ? "bg-primary-50/50" : ""} ${!msg.is_read ? "bg-blue-50/30" : ""}`}>
                      <button onClick={(e) => { e.stopPropagation(); toggleStar(msg.id); mailIpc.toggleMessageStar(msg.id).catch(() => {}) }}>
                        <Star size={14} className={msg.is_starred ? "text-amber-400 fill-amber-400" : "text-surface-300"} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm ${!msg.is_read ? "font-semibold" : ""} truncate`}>{msg.from_name || msg.from_email}</span>
                          <span className="text-[10px] text-surface-400 whitespace-nowrap ml-2">{msg.date.includes("T") ? msg.date.split("T")[0] : msg.date.slice(0, 10)}</span>
                        </div>
                        <p className={`text-sm mt-0.5 truncate ${!msg.is_read ? "font-semibold" : ""}`}>{msg.subject}</p>
                        <div className="flex items-center gap-1 mt-1">{msg.has_attachment && <Paperclip size={12} className="text-surface-400" />}{!msg.is_read && <div className="w-2 h-2 rounded-full bg-primary-500" />}</div>
                      </div>
                    </div>
                  ))}
                  {displayMessages.length >= 50 && (
                    <div className="px-4 py-3 text-center"><Button variant="ghost" size="sm" onClick={handleLoadMore}><ChevronDown size={14} />{t("mail.loadMore")}</Button></div>
                  )}
                </div>
              </div>

              {/* Message detail */}
              <div className="flex-1 bg-white overflow-auto">
                {selectedMessage ? (
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => selectedMessageId && handleReply(selectedMessageId)}><Reply size={14} />{t("mail.reply")}</Button>
                        <Button variant="ghost" size="sm" onClick={() => selectedMessageId && handleForward(selectedMessageId)}><Forward size={14} />{t("mail.forward")}</Button>
                        <Button variant="ghost" size="sm" onClick={() => selectedMessageId && handleArchive(selectedMessageId)}><Archive size={14} />{t("mail.archiveAction")}</Button>
                        {/* Thread button */}
                        {selectedMessage.thread_id && selectedMessage.thread_id !== `msg_${selectedMessage.id}` && (
                          <Button variant="ghost" size="sm" onClick={() => setThreadViewId(selectedMessage.thread_id || `msg_${selectedMessage.id}`)}><MessageSquare size={14} />{t("mail.thread")}</Button>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => selectedMessageId && handleDelete(selectedMessageId)}><Trash size={14} />{t("mail.delete")}</Button>
                    </div>
                    <h2 className="text-xl font-semibold mb-3">{selectedMessage.subject}</h2>
                    <div className="flex items-center justify-between pb-4 border-b border-surface-200 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">{(selectedMessage.from_name || selectedMessage.from_email).charAt(0)}</div>
                        <div><p className="font-medium">{selectedMessage.from_name || selectedMessage.from_email}</p><p className="text-xs text-surface-400">{selectedMessage.from_email}</p></div>
                      </div>
                      <span className="text-xs text-surface-400">{selectedMessage.date.replace("T", " ")}</span>
                    </div>
                    {attachments.length > 0 && (
                      <div className="mb-4 p-3 bg-surface-50 rounded-lg">
                        <p className="text-xs font-medium text-surface-500 mb-2"><Paperclip size={12} className="inline mr-1" />{attachments.length} {t("mail.attachments")}</p>
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
                    <div className="prose prose-sm max-w-none text-surface-700">
                      {messageBody?.body_html ? (
                        <ShadowDomEmail html={messageBody.body_html} />
                      ) : messageBody?.body_text ? (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">{messageBody.body_text}</div>
                      ) : (
                        <div className="space-y-3"><p>{t("mail.loadingBody")}</p></div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-surface-400">
                    <div className="text-center"><Mail size={48} className="mx-auto mb-3 text-surface-300" /><p>{t("mail.selectMessage")}</p></div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {composeOpen && <ComposeDialog />}
      {showDraftRecovery && <DraftRecoveryDialog onRecover={handleDraftRecover} onDiscard={handleDraftDiscard} />}
    </div>
  )
}

export const Route = createFileRoute("/email")({ component: EmailPage })
