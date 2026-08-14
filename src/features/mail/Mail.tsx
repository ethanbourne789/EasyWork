import { useState, useEffect } from "react";
import { Pencil, FolderPlus, RefreshCw, Menu, PenSquare } from "lucide-react";
import { ModuleFab } from "@/components/layout/ModuleFab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Drawer, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { MailAccountTree } from "./MailAccountTree";
import { MailList } from "./MailList";
import { MailReader } from "./MailReader";
import { MailComposer } from "./MailComposer";
import {
  useEmailFolders,
  useEmailAccounts,
  useFolderUnreadCounts,
  useSyncMail,
  useCreateFolder,
} from "./useMail";
import { UNIFIED_INBOX_ID } from "./mailApi";
import { SyncProgressIndicator, SyncProgressBar } from "./SyncProgressIndicator";
import { useSyncProgress } from "./useSyncProgress";
import type { Email } from "@/types";

export function Mail() {
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>();

  // 进入邮箱页应直接看到邮件，而不是停在「请选择一个文件夹」空态。
  // 默认选中「统一收件箱」虚拟节点，聚合所有账户的收件箱邮件；
  // 仅在没有任何账户/文件夹时退回首个文件夹。
  const { data: folders } = useEmailFolders(undefined);
  const { data: accounts = [] } = useEmailAccounts();
  useEffect(() => {
    if (selectedFolderId) return;
    // 有账户时默认进入统一收件箱；无账户则保持 undefined（UI 显示空态/添加账号引导）
    if ((accounts ?? []).length > 0) {
      setSelectedFolderId(UNIFIED_INBOX_ID);
      return;
    }
    // 兜底：无账户但有文件夹（理论不应出现），退回首文件夹
    if (folders && folders.length > 0) {
      setSelectedFolderId(folders[0].id);
    }
  }, [folders, accounts, selectedFolderId]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDraftId, setComposerDraftId] = useState<string | undefined>();
  const [composerInitialData, setComposerInitialData] = useState<{
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
  }>();
  const [mobileView, setMobileView] = useState<"list" | "reader">("list");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderAccount, setNewFolderAccount] = useState<string>("");
  const syncMail = useSyncMail();
  const createFolder = useCreateFolder();
  const { data: unreadCounts } = useFolderUnreadCounts();
  const { isSyncing } = useSyncProgress();

  // 构建账户标签映射表（id → email），用于显示同步进度时标识账户
  const accountLabels = Object.fromEntries(
    (accounts ?? []).map((a) => [a.id, a.email]),
  );

  const openFolderDialog = () => {
    setNewFolderAccount(accounts[0]?.id ?? "");
    setNewFolderName("");
    setFolderDialogOpen(true);
  };

  const submitFolder = () => {
    if (!newFolderName.trim() || !newFolderAccount) return;
    createFolder.mutate(
      { accountId: newFolderAccount, name: newFolderName },
      {
        onSuccess: () => {
          setFolderDialogOpen(false);
          setNewFolderName("");
        },
      }
    );
  };

  const totalUnread = Object.values(unreadCounts ?? {}).reduce(
    (sum, n) => sum + (n ?? 0),
    0
  );

  const handleSync = () => {
    syncMail.mutate(undefined);
  };

  const handleEmailSelect = (email: Email) => {
    setSelectedEmail(email);
    setMobileView("reader");
  };

  const handleForward = (_email: Email, to: string, subject: string, body: string) => {
    setComposerDraftId(undefined);
    setComposerInitialData({
      to,
      subject,
      body,
    });
    setComposerOpen(true);
  };

  const handleCompose = () => {
    setComposerDraftId(undefined);
    setComposerInitialData(undefined);
    setComposerOpen(true);
  };

  // 选中邮件所属文件夹是否为草稿箱（用于展示"编辑草稿"入口）
  const draftsFolderId = folders?.find(
    (f) =>
      f.imap_path?.toLowerCase().includes("draft") ||
      f.name?.includes("草稿")
  )?.id;
  const isDraft = !!selectedEmail && !!draftsFolderId && selectedEmail.folder_id === draftsFolderId;

  const handleEditDraft = (email: Email) => {
    setComposerDraftId(email.id);
    setComposerInitialData({
      to: email.to_addresses || "",
      cc: email.cc_addresses || "",
      subject: email.subject || "",
      body:
        email.body_html?.replace(/<[^>]*>/g, "") ||
        email.body_text ||
        "",
    });
    setComposerOpen(true);
  };

  const handleFolderSelect = (folderId: string) => {
    setSelectedFolderId(folderId);
    setMobileView("list");
    setDrawerOpen(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 响应式标题栏 — 桌面端显示完整标题，移动端显示紧凑标题 + 菜单按钮 */}
      <div className="flex items-center justify-between gap-4 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          {/* 移动端菜单按钮 */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-lg font-semibold leading-tight md:text-[28px]">
              邮箱
            </h1>
            <p className="hidden text-xs text-muted-foreground md:block">
              {accounts.length} 个账户 · {totalUnread} 封未读
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={handleSync}
            disabled={syncMail.isPending || isSyncing}
          >
            <RefreshCw className={syncMail.isPending || isSyncing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span className="hidden sm:inline">{syncMail.isPending || isSyncing ? "收取中..." : "收取邮件"}</span>
          </Button>
          <Button variant="ghost" size="sm" className="gap-1" onClick={handleCompose}>
            <PenSquare className="h-4 w-4" />
            <span className="hidden sm:inline">写信</span>
          </Button>
        </div>
      </div>

      {/* 同步进度条 */}
      <SyncProgressBar />

      {/* 同步进度提示浮层 */}
      <div className="px-4 pt-1">
        <SyncProgressIndicator
          accountLabels={accountLabels}
          compact
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 平板/手机抽屉 — 持有 MailAccountTree */}
        <Drawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          side="left"
          width="w-[260px]"
        >
          <DrawerHeader>
            <DrawerTitle>文件夹</DrawerTitle>
            <DrawerClose onClose={() => setDrawerOpen(false)} />
          </DrawerHeader>
          <div className="h-[calc(100vh-56px)] overflow-y-auto">
            <MailAccountTree
              selectedFolderId={selectedFolderId}
              onFolderSelect={handleFolderSelect}
            />
          </div>
        </Drawer>

        {/* 桌面左栏 — 账户树 (lg 以上显示，平板使用抽屉) */}
        <aside className="hidden w-[180px] shrink-0 border-r lg:block">
          <MailAccountTree
            selectedFolderId={selectedFolderId}
            onFolderSelect={setSelectedFolderId}
          />
        </aside>

        {/* 移动端文件夹切换下拉（保留兜底，非必需时隐藏） */}
        <div className="w-full border-b p-3 md:hidden">
          <Select
            value={selectedFolderId ?? ""}
            onChange={(e) => {
              setSelectedFolderId(e.target.value || undefined);
              setMobileView("list");
            }}
            className="w-full"
          >
            <option value="">选择文件夹</option>
            {(folders ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </div>

        {/* 中栏 — 邮件列表 */}
        <div className={`w-full shrink-0 border-r md:block md:min-w-0 md:w-[360px] lg:w-[400px] ${mobileView === 'reader' ? 'hidden' : 'block'}`}>
          <MailList
            folderId={selectedFolderId}
            selectedEmailId={selectedEmail?.id}
            onEmailSelect={handleEmailSelect}
          />
        </div>

        {/* 右栏 — 邮件阅读 */}
        <main className={`flex-1 overflow-hidden ${mobileView === 'list' ? 'hidden md:block' : 'block'}`}>
          <MailReader
            email={selectedEmail}
            isDraft={isDraft}
            onForward={handleForward}
            onEditDraft={handleEditDraft}
            onDeleted={() => {
              setSelectedEmail(null);
              setMobileView("list");
            }}
          />
        </main>
      </div>
      <ModuleFab
        mainIcon={Pencil}
        actions={[
          { label: "写邮件", icon: Pencil, onClick: handleCompose },
          { label: "新建文件夹", icon: FolderPlus, onClick: openFolderDialog },
        ]}
      />
      <MailComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        draftId={composerDraftId}
        initialData={composerInitialData}
      />

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
          </DialogHeader>
          <DialogClose onClose={() => setFolderDialogOpen(false)} />
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">所属账户</label>
              <Select
                value={newFolderAccount}
                onChange={(e) => setNewFolderAccount(e.target.value)}
              >
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.email}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">文件夹名称</label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="例如：项目归档"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitFolder();
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>
                取消
              </Button>
              <Button
                onClick={submitFolder}
                disabled={!newFolderName.trim() || !newFolderAccount || createFolder.isPending}
              >
                {createFolder.isPending ? "创建中..." : "创建"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
