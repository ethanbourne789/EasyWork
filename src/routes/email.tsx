import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useMailStore, type MailAccount, type MailContact } from "@/stores/mail-store"
import * as mailIpc from "@/lib/mail-ipc"
import { demoEmails } from "@/data/demo-data"
import { useState, useCallback, useEffect, useRef } from "react"
import {
  Search, Star, Paperclip, Inbox, Send, Archive, Trash2, Plus, Settings,
  RefreshCw, X, Reply, Forward, Trash,
  Mail, UserPlus, Users, FileText, Loader2, CheckCircle2, AlertCircle, CloudLightning,
  AlertTriangle,
} from "lucide-react"

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

function logError(context: string, message: string) {
  console.error(`[EasyWork Mail] ${context}:`, message)
}

// ==================== Account Management ====================

function AccountManager() {
  const { accounts, addAccount: addAccountLocal, removeAccount: removeAccountLocal, setAccounts } = useMailStore()
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

  // Load accounts from backend on mount
  useEffect(() => {
    mailIpc.listAccounts().then((backendAccounts) => {
      if (backendAccounts.length > 0) {
        setAccounts(backendAccounts)
      }
    }).catch(() => {
      // Backend unavailable — use demo data (no-op)
    })
  }, [setAccounts])

  const handleEmailBlur = useCallback(() => {
    const provider = detectProvider(form.email)
    if (provider) {
      setForm(f => ({
        ...f,
        imap_host: provider.imap, imap_port: provider.imapPort,
        smtp_host: provider.smtp, smtp_port: provider.smtpPort,
        username: f.email.split("@")[0],
        provider: "imap",
      }))
    }
  }, [form.email])

  const handleAdd = async () => {
    setSaving(true)
    setError(null)
    setSyncResult(null)

    try {
      // Step 1: Save account to Rust backend
      const accountId = await mailIpc.addAccount(form)

      // Step 2: Test IMAP connection
      const connResult = await mailIpc.testConnection(form)
      setTestResult(connResult)

      if (!connResult.includes("成功")) {
        setError(connResult)
        setSaving(false)
        return
      }

      // Step 3: Trigger full sync (folders + messages) - must complete BEFORE adding to store
      setSyncResult("正在同步文件夹和邮件...")
      const syncRes = await mailIpc.syncAccount(accountId)
      setSyncResult(
        `同步完成: ${syncRes.folders_count} 个文件夹, ${syncRes.messages_new} 封新邮件`
      )

      // Step 4: Update local Zustand store AFTER sync completes (avoids race)
      addAccountLocal({ ...form, id: accountId })

      // Step 5: Re-fetch accounts + preload messages into store
      const refreshedAccounts = await mailIpc.listAccounts()
      setAccounts(refreshedAccounts)

      // Step 6: Fetch messages from DB into store so EmailPage shows them immediately
      const messages = await mailIpc.fetchMessages(accountId)
      console.log("[handleAdd] fetchMessages returned:", messages.length, "messages for accountId:", accountId)
      if (messages.length > 0) {
        console.log("[handleAdd] First message:", messages[0].subject, "from:", messages[0].from_email)
      } else {
        console.warn("[handleAdd] WARNING: fetchMessages returned 0 messages!")
      }
      useMailStore.getState().setMessages(messages)

      setShowAdd(false)
      setForm({
        email: "", provider: "imap", imap_host: "", imap_port: 993,
        smtp_host: "", smtp_port: 465, username: "", password: "",
        use_tls: true, sync_interval_secs: 300, sync_period_days: 30,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`操作失败: ${msg}`)
      logError("addAccount", msg)
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (id: number) => {
    try {
      await mailIpc.deleteAccount(id)
      removeAccountLocal(id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`删除失败: ${msg}`)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      const result = await mailIpc.testConnection(form)
      setTestResult(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setTestResult(`连接失败: ${msg}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">账户管理</h1>
          <p className="text-surface-500 text-sm mt-1">管理邮件账户和同步设置</p>
        </div>
        <Button onClick={() => { setShowAdd(true); setTestResult(null) }}>
          <Plus size={16} />添加账户
        </Button>
      </div>

      {/* Account list */}
      {accounts.length === 0 && !showAdd && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Mail size={48} className="mx-auto text-surface-300 mb-4" />
            <p className="text-surface-500 font-medium">还没有添加邮箱账户</p>
            <p className="text-surface-400 text-sm mt-1 mb-4">添加您的第一个邮箱账户以开始使用</p>
            <Button onClick={() => setShowAdd(true)}><Plus size={16} />添加账户</Button>
          </CardContent>
        </Card>
      )}

      {accounts.map((acc) => (
        <Card key={acc.id} className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-lg">
                  {acc.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{acc.email}</p>
                  <p className="text-xs text-surface-400">
                    IMAP: {acc.imap_host}:{acc.imap_port} · SMTP: {acc.smtp_host}:{acc.smtp_port}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success">已连接</Badge>
                <Button variant="ghost" size="icon" onClick={() => acc.id && handleRemove(acc.id)}>
                  <Trash2 size={16} className="text-surface-400 hover:text-red-500" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Add account form */}
      {showAdd && (
        <Card className="border-primary-200">
          <CardContent className="p-6 space-y-4">
            <h3 className="font-semibold text-lg">添加邮箱账户</h3>

            <div>
              <label className="text-sm font-medium text-surface-700 block mb-1">邮箱地址</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                onBlur={handleEmailBlur}
                placeholder="example@gmail.com"
                className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-surface-700 block mb-1">用户名</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-surface-700 block mb-1">密码</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-surface-700 block mb-1">IMAP 服务器</label>
                <input
                  type="text"
                  value={form.imap_host}
                  onChange={e => setForm(f => ({ ...f, imap_host: e.target.value }))}
                  className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-surface-700 block mb-1">IMAP 端口</label>
                <input
                  type="number"
                  value={form.imap_port}
                  onChange={e => setForm(f => ({ ...f, imap_port: Number(e.target.value) }))}
                  className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-surface-700 block mb-1">SMTP 服务器</label>
                <input
                  type="text"
                  value={form.smtp_host}
                  onChange={e => setForm(f => ({ ...f, smtp_host: e.target.value }))}
                  className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-surface-700 block mb-1">SMTP 端口</label>
                <input
                  type="number"
                  value={form.smtp_port}
                  onChange={e => setForm(f => ({ ...f, smtp_port: Number(e.target.value) }))}
                  className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div>
                <label className="text-sm font-medium text-surface-700 block mb-1">同步周期</label>
                <select
                  value={form.sync_period_days}
                  onChange={e => setForm(f => ({ ...f, sync_period_days: Number(e.target.value) }))}
                  className="h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value={7}>最近 7 天</option>
                  <option value={30}>最近 30 天</option>
                  <option value={90}>最近 90 天</option>
                  <option value={365}>最近 1 年</option>
                  <option value={0}>全部邮件</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-surface-700 block mb-1">同步间隔</label>
                <select
                  value={form.sync_interval_secs}
                  onChange={e => setForm(f => ({ ...f, sync_interval_secs: Number(e.target.value) }))}
                  className="h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value={60}>1 分钟</option>
                  <option value={300}>5 分钟（IDLE 实时推送）</option>
                  <option value={900}>15 分钟</option>
                  <option value={1800}>30 分钟</option>
                </select>
              </div>
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                testResult.includes("成功") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              }`}>
                {testResult.includes("成功") ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {testResult}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-red-50 text-red-700">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {syncResult && (
              <div className="flex items-center gap-2 p-3 rounded-lg text-sm bg-blue-50 text-blue-700">
                <RefreshCw size={16} className="animate-spin" />
                {syncResult}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={handleAdd} disabled={saving || testing}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                {saving ? "保存中..." : "保存"}
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={testing}>
                {testing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                测试连接
              </Button>
              <Button variant="ghost" onClick={() => { setShowAdd(false); setTestResult(null); setError(null); setSyncResult(null) }}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ==================== Contacts ====================

function ContactsManager() {
  const { contacts, setContacts } = useMailStore()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", phone: "", group: "", notes: "" })

  const handleAdd = () => {
    const newContact: MailContact = { ...form, id: Date.now().toString() }
    setContacts([...contacts, newContact])
    setShowAdd(false)
    setForm({ name: "", email: "", phone: "", group: "", notes: "" })
  }

  const defaultContacts: MailContact[] = [
    { id: "c1", name: "张伟", email: "zhangwei@example.com", phone: "13800138000", group: "同事", notes: "技术部" },
    { id: "c2", name: "李娜", email: "lina@example.com", phone: "13900139000", group: "朋友", notes: "" },
    { id: "c3", name: "王磊", email: "wanglei@company.com", phone: "13700137000", group: "同事", notes: "项目经理" },
    { id: "c4", name: "陈静", email: "chenjing@example.com", phone: "13600136000", group: "家人", notes: "" },
  ]

  const allContacts = contacts.length > 0 ? contacts : defaultContacts

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">联系人</h1>
          <p className="text-surface-500 text-sm mt-1">管理通讯录和分组</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><FileText size={14} />导出 VCF</Button>
          <Button variant="outline" size="sm"><UserPlus size={14} />导入 VCF</Button>
          <Button onClick={() => setShowAdd(true)}><Plus size={16} />新建联系人</Button>
        </div>
      </div>

      <div className="grid gap-3">
        {allContacts.map((c) => (
          <Card key={c.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-200 flex items-center justify-center text-surface-600 font-semibold">
                  {c.name.charAt(0)}
                </div>
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-surface-400">{c.email} · {c.phone}</p>
                </div>
              </div>
              <Badge variant="default">{c.group}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {showAdd && (
        <Card className="border-primary-200">
          <CardContent className="p-6 space-y-3">
            <h3 className="font-semibold">新联系人</h3>
            <input type="text" placeholder="姓名" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="email" placeholder="邮箱" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="tel" placeholder="电话" value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <input type="text" placeholder="分组" value={form.group}
              onChange={e => setForm(f => ({ ...f, group: e.target.value }))}
              className="w-full h-10 px-3 border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <div className="flex gap-2 pt-2">
              <Button onClick={handleAdd}>保存</Button>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ==================== Compose Dialog ====================

function ComposeDialog() {
  const { composeData, closeCompose } = useMailStore()
  const [to, setTo] = useState(composeData?.to || "")
  const [subject, setSubject] = useState(composeData?.subject || "")
  const [body, setBody] = useState(composeData?.body || "")

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <Card className="w-[640px] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-surface-200">
          <h3 className="font-semibold">写邮件</h3>
          <button onClick={closeCompose} className="text-surface-400 hover:text-surface-600">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 p-4 space-y-3 overflow-auto">
          <input type="text" placeholder="收件人" value={to}
            onChange={e => setTo(e.target.value)}
            className="w-full h-10 px-3 border-0 border-b border-surface-200 text-sm focus:outline-none focus:border-primary-500" />
          <input type="text" placeholder="主题" value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full h-10 px-3 border-0 border-b border-surface-200 text-sm focus:outline-none focus:border-primary-500" />
          <textarea placeholder="邮件内容..." value={body}
            onChange={e => setBody(e.target.value)}
            rows={12}
            className="w-full px-3 py-2 border-0 text-sm focus:outline-none resize-none" />
        </div>
        <div className="flex items-center justify-between p-4 border-t border-surface-200">
          <Button variant="ghost" size="sm"><Paperclip size={14} />添加附件</Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={closeCompose}>取消</Button>
            <Button onClick={closeCompose}><Send size={16} />发送</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ==================== Main Email Page ====================

function EmailPage() {
  const {
    messages, selectedMessageId, messageBody,
    selectMessage, markRead, toggleStar, activeView, activeFolder,
    setActiveView, setActiveFolder, openCompose, composeOpen, accounts,
    setMessages, loadingMessages, setLoadingMessages,
    syncStatus, setSyncStatus,
    setMessageBody,
  } = useMailStore()

  // Dynamic folders from DB
  const [dbFolders, setDbFolders] = useState<mailIpc.MailFolder[]>([])
  const refreshingRef = useRef(false)

  // Load folders from DB when accounts change
  useEffect(() => {
    if (accounts.length > 0 && accounts[0].id) {
      mailIpc.listFolders(accounts[0].id).then(setDbFolders).catch(() => setDbFolders([]))
    } else {
      setDbFolders([])
    }
  }, [accounts.length > 0 ? accounts[0].id : null])

  // Map folder role to icon
  const folderIcons: Record<string, typeof Inbox> = {
    inbox: Inbox,
    sent: Send,
    drafts: FileText,
    trash: Trash2,
    junk: AlertTriangle,
    archive: Archive,
  }

  // Build dynamic folder list from DB, fallback to hardcoded if empty
  const folders = dbFolders.length > 0
    ? dbFolders.map((f) => ({
        id: f.role || f.remote_id,
        remoteId: f.remote_id,
        icon: folderIcons[f.role] || Inbox,
        label: f.name || f.remote_id,
        count: 0,
      }))
    : [
        { id: "inbox", remoteId: "INBOX", icon: Inbox, label: "收件箱", count: messages.length },
        { id: "sent", remoteId: "Sent", icon: Send, label: "已发送", count: 0 },
        { id: "drafts", remoteId: "Drafts", icon: FileText, label: "草稿箱", count: 0 },
        { id: "trash", remoteId: "Trash", icon: Trash2, label: "垃圾箱", count: 0 },
      ]

  // Load email body when selecting a message
  const handleSelectMessage = useCallback(async (id: number | null) => {
    selectMessage(id)
    if (id === null) return
    try {
      const body = await mailIpc.getMessageBody(id)
      setMessageBody(body)
    } catch {
      setMessageBody({ body_text: "(无法加载邮件正文)", body_html: "" })
    }
  }, [selectMessage, setMessageBody])

  // Sync from IMAP server, then fetch local DB
  const handleSync = useCallback(async () => {
    if (accounts.length === 0 || !accounts[0].id) {
      console.log("[handleSync] No accounts, skipping")
      return
    }
    console.log("[handleSync] Syncing account:", accounts[0].id, accounts[0].email)
    setSyncStatus({ syncing: true, lastError: null, lastResult: null })
    try {
      const result = await mailIpc.syncAccount(accounts[0].id)
      const statusMsg = `${result.folders_count} folders, ${result.messages_new} new / ${result.messages_total} total`
      console.log("[handleSync] Result:", statusMsg)
      setSyncStatus({
        syncing: false,
        lastResult: statusMsg,
        lastSyncAt: new Date().toLocaleTimeString(),
      })
      if (result.error) {
        console.warn("[handleSync] Sync error:", result.error)
        setSyncStatus({ lastError: result.error })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[handleSync] Failed:", msg)
      setSyncStatus({ syncing: false, lastError: `Sync failed: ${msg}` })
    }
  }, [accounts, setSyncStatus])

  // Fetch messages from local DB, trigger sync first if needed
  const handleRefresh = useCallback(async () => {
    if (accounts.length === 0 || !accounts[0].id) return
    if (refreshingRef.current) {
      console.log("[handleRefresh] Already refreshing, skipping")
      return
    }
    refreshingRef.current = true
    console.log("[handleRefresh] Starting refresh for account:", accounts[0].id, accounts[0].email)
    setLoadingMessages(true)

    try {
      // Step 1: Sync from IMAP to local DB
      console.log("[handleRefresh] Step 1: Syncing from IMAP...")
      await handleSync()

      // Step 2: Fetch from local DB
      console.log("[handleRefresh] Step 2: Fetching from DB for account:", accounts[0].id)
      const allMessages = await mailIpc.fetchMessages(accounts[0].id)
      console.log("[handleRefresh] fetchMessages returned:", allMessages.length, "messages")
      if (allMessages.length > 0) {
        console.log("[handleRefresh] First:", allMessages[0].subject, "from:", allMessages[0].from_email)
      }
      setMessages(allMessages)
      console.log("[handleRefresh] Messages set in store, count:", useMailStore.getState().messages.length)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[handleRefresh] Failed:", msg)
      setSyncStatus({
        lastError: `Fetch failed: ${msg}`,
        syncing: false,
      })
    } finally {
      setLoadingMessages(false)
      refreshingRef.current = false
    }
  }, [accounts, handleSync, setMessages, setLoadingMessages, setSyncStatus])

  // Auto-fetch messages when accounts change (with race guard)
  useEffect(() => {
    if (accounts.length > 0 && accounts[0].id) {
      console.log("[EmailPage useEffect] accounts changed, triggering handleRefresh")
      // Reload folder list
      mailIpc.listFolders(accounts[0].id).then(setDbFolders).catch(() => setDbFolders([]))
      handleRefresh()
    }
  }, [accounts.length > 0 ? accounts[0].id : null]) // eslint-disable-line

  // Messages to display: real from DB > demo fallback (only when no accounts)
  const displayMessages = messages.length > 0 ? messages : (accounts.length === 0 ? demoEmails.map((e, i) => ({
    id: i + 1,
    account_id: 0,
    remote_uid: i + 1,
    subject: e.subject,
    from_name: e.fromName,
    from_email: e.from,
    date: e.date,
    is_read: e.read,
    is_starred: e.starred,
    has_attachment: e.hasAttachment,
    size: 0,
  })) : [])

  const selectedMessage = selectedMessageId
    ? displayMessages.find(m => m.id === selectedMessageId)
    : null

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)] -m-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-200 bg-white shrink-0">
        <div className="flex items-center gap-1">
          <Button
            variant={activeView === "inbox" ? "secondary" : "ghost"}
            size="sm" onClick={() => setActiveView("inbox")}
          >
            <Mail size={14} />收件箱
          </Button>
          <Button
            variant={activeView === "account" ? "secondary" : "ghost"}
            size="sm" onClick={() => setActiveView("account")}
          >
            <Settings size={14} />账户
          </Button>
          <Button
            variant={activeView === "contacts" ? "secondary" : "ghost"}
            size="sm" onClick={() => setActiveView("contacts")}
          >
            <Users size={14} />联系人
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={syncStatus.syncing}>
            <RefreshCw size={16} className={syncStatus.syncing || loadingMessages ? "animate-spin" : ""} />
            {syncStatus.syncing ? "Syncing..." : "Refresh"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={syncStatus.syncing || accounts.length === 0}
          >
            <CloudLightning size={16} />
            Sync Now
          </Button>
          <Button onClick={() => openCompose()}><Plus size={16} />写邮件</Button>
        </div>
      </div>

      {/* Sync status bar */}
      {(syncStatus.lastResult || syncStatus.lastError) && (
        <div className={`flex items-center gap-2 px-4 py-2 text-xs border-b shrink-0 ${
          syncStatus.lastError
            ? "bg-red-50 text-red-700 border-red-200"
            : "bg-emerald-50 text-emerald-700 border-emerald-200"
        }`}>
          {syncStatus.lastError ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
          <span>{syncStatus.lastError || syncStatus.lastResult}</span>
          {syncStatus.lastSyncAt && (
            <span className="text-surface-400 ml-auto">{syncStatus.lastSyncAt}</span>
          )}
          <button
            onClick={() => setSyncStatus({ lastResult: null, lastError: null })}
            className="ml-2 hover:opacity-70"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Content */}
      {activeView === "account" ? (
        <div className="flex-1 overflow-auto p-6">
          <AccountManager />
        </div>
      ) : activeView === "contacts" ? (
        <div className="flex-1 overflow-auto p-6">
          <ContactsManager />
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Folder sidebar */}
          <div className="w-44 shrink-0 border-r border-surface-200 bg-white p-3 space-y-1 overflow-auto">
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFolder(f.id)}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeFolder === f.id
                    ? "bg-primary-50 text-primary-700 font-medium"
                    : "text-surface-600 hover:bg-surface-100"
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <f.icon size={16} />{f.label}
                </span>
                {f.count > 0 && (
                  <span className="text-xs bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded-full shrink-0 ml-1">
                    {f.count}
                  </span>
                )}
              </button>
            ))}

            <div className="pt-3 mt-3 border-t border-surface-100">
              <p className="text-[10px] font-semibold text-surface-400 uppercase px-3 mb-2">账户</p>
              {accounts.length > 0 ? (
                accounts.map((acc) => (
                  <div key={acc.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-surface-500">
                    <div className="w-5 h-5 rounded bg-primary-100 flex items-center justify-center text-[10px] font-bold text-primary-700">
                      {acc.email.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{acc.email}</span>
                  </div>
                ))
              ) : (
                <div className="px-3 text-xs text-surface-400">
                  未添加账户
                  <button onClick={() => setActiveView("account")} className="text-primary-500 hover:underline ml-1">
                    添加
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Message list */}
          <div className="w-96 shrink-0 border-r border-surface-200 bg-white overflow-auto">
            <div className="p-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  placeholder="搜索邮件..."
                  className="w-full h-8 pl-8 pr-3 text-xs bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="divide-y divide-surface-100">
              {displayMessages.length === 0 && (
                <div className="px-4 py-12 text-center">
                  <Inbox size={40} className="mx-auto text-surface-300 mb-3" />
                  {accounts.length > 0 ? (
                    <>
                      <p className="text-sm text-surface-500 font-medium">收件箱为空</p>
                      <p className="text-xs text-surface-400 mt-1 mb-3">
                        点击 "Sync Now" 从 IMAP 服务器拉取邮件
                      </p>
                      <Button size="sm" onClick={handleSync} disabled={syncStatus.syncing}>
                        <CloudLightning size={14} />
                        Sync Now
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-surface-500 font-medium">未配置邮箱账户</p>
                      <p className="text-xs text-surface-400 mt-1 mb-3">
                        请在账户管理中配置您的邮箱
                      </p>
                      <Button size="sm" onClick={() => setActiveView("account")}>
                        <Settings size={14} />
                        配置账户
                      </Button>
                    </>
                  )}
                </div>
              )}
              {displayMessages.map((msg) => (
                <div
                  key={msg.id}
                  onClick={() => {
                    handleSelectMessage(msg.id)
                    if (!msg.is_read) markRead(msg.id, true)
                  }}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-surface-50 ${
                    selectedMessageId === msg.id ? "bg-primary-50/50" : ""
                  } ${!msg.is_read ? "bg-blue-50/30" : ""}`}
                >
                  <button onClick={(e) => { e.stopPropagation(); toggleStar(msg.id) }}>
                    <Star size={14} className={msg.is_starred ? "text-amber-400 fill-amber-400" : "text-surface-300"} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${!msg.is_read ? "font-semibold" : ""} truncate`}>
                        {msg.from_name}
                      </span>
                      <span className="text-[10px] text-surface-400 whitespace-nowrap ml-2">
                        {msg.date.split("T")[0]}
                      </span>
                    </div>
                    <p className={`text-sm mt-0.5 truncate ${!msg.is_read ? "font-semibold" : ""}`}>
                      {msg.subject}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {msg.has_attachment && <Paperclip size={12} className="text-surface-400" />}
                      {!msg.is_read && <div className="w-2 h-2 rounded-full bg-primary-500" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Message detail */}
          <div className="flex-1 bg-white overflow-auto">
            {selectedMessage ? (
              <div className="p-6">
                {/* Actions */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm"><Reply size={14} />回复</Button>
                    <Button variant="ghost" size="sm"><Forward size={14} />转发</Button>
                    <Button variant="ghost" size="sm"><Archive size={14} />归档</Button>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600">
                    <Trash size={14} />删除
                  </Button>
                </div>

                {/* Header */}
                <h2 className="text-xl font-semibold mb-3">{selectedMessage.subject}</h2>
                <div className="flex items-center justify-between pb-4 border-b border-surface-200 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
                      {selectedMessage.from_name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium">{selectedMessage.from_name}</p>
                      <p className="text-xs text-surface-400">{selectedMessage.from_email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-surface-400">{selectedMessage.date.replace("T", " ")}</span>
                </div>

                {/* Body - show demo content based on email */}
                <div className="prose prose-sm max-w-none text-surface-700">
                  {messageBody?.body_html ? (
                    <div dangerouslySetInnerHTML={{ __html: messageBody.body_html }} />
                  ) : (
                    <div className="space-y-3">
                      <p>
                        这是邮件的正文内容。在完整实现中，这里将显示从 IMAP 服务器获取的实际邮件 HTML 内容。
                      </p>
                      <p>
                        邮件地址: {selectedMessage.from_email}<br />
                        主题: {selectedMessage.subject}<br />
                        日期: {selectedMessage.date}
                      </p>
                      <p className="text-surface-400 text-xs">
                        —— 此邮件来自 EasyWork 邮件模块演示数据 ——
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-surface-400">
                <div className="text-center">
                  <Mail size={48} className="mx-auto mb-3 text-surface-300" />
                  <p>选择一封邮件以查看详情</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compose modal */}
      {composeOpen && <ComposeDialog />}
    </div>
  )
}

export const Route = createFileRoute("/email")({
  component: EmailPage,
})
