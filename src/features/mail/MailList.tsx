import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Star, Search, RefreshCw, Loader2 } from "lucide-react";
import { useEmails, useToggleStar, useMarkAsRead, loadMoreEmails } from "./useMail";
import { UNIFIED_INBOX_ID } from "./mailApi";
import type { Email } from "@/types";

const PAGE_SIZE = 50;

interface MailListProps {
  folderId?: string;
  selectedEmailId?: string;
  onEmailSelect: (email: Email) => void;
}

function formatTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function extractName(email: string, fallback: string): string {
  if (!email) return fallback;
  const match = email.match(/^([^<]+)</);
  if (match) return match[1].trim();
  return email.split("@")[0];
}

export function MailList({ folderId, selectedEmailId, onEmailSelect }: MailListProps) {
  const { t } = useTranslation();
  const { data: initialEmails = [], isLoading, isError, refetch } = useEmails(folderId);
  const toggleStar = useToggleStar();
  const markAsRead = useMarkAsRead();
  const [searchQuery, setSearchQuery] = useState("");
  const [allEmails, setAllEmails] = useState<Email[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 当文件夹切换或初始数据刷新时，重置列表
  useEffect(() => {
    setAllEmails(initialEmails);
    setHasMore(initialEmails.length >= PAGE_SIZE);
    setLoadingMore(false);
  }, [initialEmails, folderId]);

  // 搜索过滤
  const filteredEmails = searchQuery
    ? allEmails.filter(
        (e) =>
          e.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.from_address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.preview_text?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allEmails;

  // 无限滚动 — IntersectionObserver 监听底部哨兵元素
  const handleLoadMore = useCallback(async () => {
    if (!folderId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const newEmails = await loadMoreEmails(folderId, allEmails.length, PAGE_SIZE);
      if (newEmails.length < PAGE_SIZE) {
        setHasMore(false);
      }
      setAllEmails((prev) => [...prev, ...newEmails]);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [folderId, allEmails.length, loadingMore, hasMore]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [handleLoadMore, folderId, allEmails.length]);

  const handleEmailClick = (email: Email) => {
    onEmailSelect(email);
    if (!email.is_read) {
      markAsRead.mutate(email.id);
    }
  };

  const handleStarClick = (e: React.MouseEvent, email: Email) => {
    e.stopPropagation();
    toggleStar.mutate(email.id);
  };

  if (!folderId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("mail.selectFolder")}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <span className="text-destructive">{t("mail.loadFailed")}</span>
        <Button variant="outline" size="sm" onClick={() => refetch()}>{t("common.retry")}</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("mail.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => refetch()}
          aria-label={t("mail.refresh")}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredEmails.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {searchQuery ? t("mail.noMatchingEmails") : t("mail.noEmails")}
          </div>
        ) : (
          <div className="divide-y">
            {filteredEmails.map((email) => (
              <MailListItem
                key={email.id}
                email={email}
                selected={email.id === selectedEmailId}
                onClick={() => handleEmailClick(email)}
                onStarClick={(e) => handleStarClick(e, email)}
                isUnifiedInbox={folderId === UNIFIED_INBOX_ID}
              />
            ))}
            {/* 无限滚动哨兵 — 进入视口时触发加载更多 */}
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {loadingMore && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("mail.loadingMore")}
                </div>
              )}
              {!hasMore && allEmails.length > PAGE_SIZE && (
                <span className="text-xs text-muted-foreground">{t("mail.allEmailsLoaded")}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface MailListItemProps {
  email: Email;
  selected: boolean;
  onClick: () => void;
  onStarClick: (e: React.MouseEvent) => void;
  isUnifiedInbox?: boolean;
}

function MailListItem({ email, selected, onClick, onStarClick, isUnifiedInbox }: MailListItemProps) {
  const { t } = useTranslation();
  const senderName = extractName(email.from_address || "", t("common.unknown"));
  const accountLabel = email.account_name || email.account_email;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/50",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected && "bg-accent",
        !email.is_read && "bg-brand-50/50 dark:bg-brand-50/20"
      )}
    >
      <div className="flex items-center gap-2 pt-0.5">
        {!email.is_read && (
          <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />
        )}
        <Avatar fallback={senderName} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              !email.is_read && "font-semibold"
            )}
          >
            {senderName}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatTime(email.received_at)}
          </span>
        </div>
        <div
          className={cn(
            "truncate text-sm",
            !email.is_read && "font-medium"
          )}
        >
          {email.subject || t("mail.noSubject")}
        </div>
        <div className="flex items-center gap-2">
          {isUnifiedInbox && accountLabel && (
            <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-50 dark:text-brand-700">
              {accountLabel}
            </span>
          )}
          <div className="truncate text-xs text-muted-foreground">
            {email.preview_text}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onStarClick(e);
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded md:h-7 md:w-7 hover:bg-background/60"
        aria-label={email.is_starred ? t("mail.unstar") : t("mail.star")}
        aria-pressed={email.is_starred}
      >
        <Star
          className={cn(
            "h-4 w-4 transition-colors",
            email.is_starred
              ? "fill-warning text-warning"
              : "text-muted-foreground hover:text-warning"
          )}
        />
      </button>
    </div>
  );
}