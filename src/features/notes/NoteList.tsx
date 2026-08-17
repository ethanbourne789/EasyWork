import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pin, PinOff, Trash2, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotes, useUpdateNote, useDeleteNote, useNoteTagRelations, useNoteTags } from './useNotes';
import type { Note } from '@/types';
import { confirm } from '@/lib/confirm';

interface NoteListProps {
  selectedFolderId: string | null;
  selectedTagId: string | null;
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onNoteDeleted: (id: string) => void;
  searchQuery: string;
  onClearTag?: () => void;
}

function formatRelativeTime(dateStr: string, t: (key: string, params?: Record<string, unknown>) => string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return t('notes.justNow');
  if (diffMin < 60) return `${diffMin}${t('notes.minAgo')}`;
  if (diffHr < 24) return `${diffHr}${t('notes.hrAgo')}`;
  if (diffDay < 7) return `${diffDay}${t('notes.dayAgo')}`;

  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (date.getFullYear() === now.getFullYear()) {
    return `${month}${t('notes.monthUnit')}${day}${t('notes.dayUnit')}`;
  }
  return `${date.getFullYear()}/${month}/${day}`;
}

function getExcerpt(note: Note, t: (key: string) => string, maxLen = 50): string {
  if (!note.content_text) return t('notes.noContent');
  const text = note.content_text.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

export function NoteList({
  selectedFolderId,
  selectedTagId,
  selectedNoteId,
  onSelectNote,
  onNoteDeleted,
  searchQuery,
  onClearTag,
}: NoteListProps) {
  const { t } = useTranslation();
  const { data: notes = [], isError, refetch } = useNotes();
  const { data: relations } = useNoteTagRelations();
  const { data: allTags = [] } = useNoteTags();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const tagMap = useMemo(() => relations ?? {}, [relations]);
  const activeTagName = selectedTagId
    ? allTags.find((t) => t.id === selectedTagId)?.name
    : undefined;

  const filteredNotes = useMemo(() => {
    let result = notes;

    // Filter by folder
    if (selectedFolderId !== null) {
      result = result.filter((n) => n.folder_id === selectedFolderId);
    }

    // Filter by tag (NF-2)
    if (selectedTagId) {
      result = result.filter((n) => (tagMap[n.id] ?? []).includes(selectedTagId));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          (n.content_text && n.content_text.toLowerCase().includes(q))
      );
    }

    // Sort: pinned first, then by updated_at desc
    return [...result].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [notes, selectedFolderId, selectedTagId, tagMap, searchQuery]);

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <span className="text-destructive">{t('notes.loadingFailed')}</span>
        <Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry')}</Button>
      </div>
    );
  }

  const handleTogglePin = (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    updateNote.mutate({ id: note.id, data: { is_pinned: !note.is_pinned } });
  };

  const handleDelete = async (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t('notes.deleteNote'),
      description: t('notes.deleteNoteConfirm', { title: note.title || t('notes.untitled') }),
      confirmText: t('notes.delete'),
      destructive: true,
    });
    if (ok) {
      deleteNote.mutate(note.id);
      onNoteDeleted(note.id);
    }
  };

  return (
    <div className="flex h-full flex-col border-r bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">
          {selectedFolderId === null ? t('notes.allNotes') : t('notes.notesLabel')}
        </h2>
        <span className="text-xs text-muted-foreground">
          {t('notes.countNotes', { count: filteredNotes.length })}
        </span>
      </div>
      {selectedTagId && (
        <div className="flex items-center gap-1 border-b px-3 py-1.5">
          <span className="text-xs text-muted-foreground">{t('notes.tagLabel')}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
            {activeTagName ?? t('notes.selectedTag')}
            <button
              type="button"
              onClick={onClearTag}
              className="hover:text-brand-900"
              aria-label={t('notes.clearTagFilter')}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      <ScrollArea className="flex-1">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <FileText className="h-8 w-8" />
            <div>{searchQuery ? t('notes.noMatchingNotes') : t('notes.noNotes')}</div>
          </div>
        ) : (
          <div>
            {filteredNotes.map((note) => {
              const isSelected = note.id === selectedNoteId;
              return (
                <div
                  key={note.id}
                  className={cn(
                    'group cursor-pointer border-b px-3 py-3 transition-colors hover:bg-accent/50',
                    isSelected && 'bg-accent'
                  )}
                  onClick={() => onSelectNote(note.id)}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {note.is_pinned && (
                          <Pin className="h-3 w-3 shrink-0 fill-current text-warning" />
                        )}
                        <h3 className="truncate text-sm font-medium">
                          {note.title || t('notes.untitled')}
                        </h3>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {getExcerpt(note, t)}
                      </p>
                      {(tagMap[note.id] ?? []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(tagMap[note.id] ?? [])
                            .map((tid) => allTags.find((x) => x.id === tid))
                            .filter(Boolean)
                            .map((t) => (
                              <span
                                key={t!.id}
                                className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]"
                              >
                                <span
                                  className="inline-block h-1.5 w-1.5 rounded-full"
                                  style={{ backgroundColor: t!.color ?? '#94a3b8' }}
                                />
                                {t!.name}
                              </span>
                            ))}
                        </div>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {formatRelativeTime(note.updated_at, t)}
                      </p>
                    </div>
                    {/* 移动端没有 hover，按钮必须常显；桌面端保留 hover 浮现 */}
                    <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                      <button
                        type="button"
                        title={note.is_pinned ? t('notes.unpin') : t('notes.pin')}
                        aria-label={note.is_pinned ? t('notes.unpin') : t('notes.pin')}
                        className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground md:h-7 md:w-7"
                        onClick={(e) => handleTogglePin(e, note)}
                      >
                        {note.is_pinned ? (
                          <PinOff className="h-4 w-4" />
                        ) : (
                          <Pin className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        title={t('notes.delete')}
                        aria-label={t('notes.deleteNote')}
                        className="flex h-9 w-9 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-destructive md:h-7 md:w-7"
                        onClick={(e) => handleDelete(e, note)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
