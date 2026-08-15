import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronDown, Folder, FolderPlus, FilePlus, MoreVertical, Pencil, Trash2, FileText, Inbox, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useFolders, useCreateFolder, useUpdateFolder, useDeleteFolder, useCreateNote, useNoteTags, useCreateNoteTag, useDeleteNoteTag } from './useNotes';
import type { NoteFolder } from '@/types';
import { confirm } from '@/lib/confirm';

interface NoteSidebarProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  selectedTagId: string | null;
  onSelectTag: (tagId: string | null) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

interface FolderNode extends NoteFolder {
  children: FolderNode[];
}

function buildFolderTree(folders: NoteFolder[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];
  folders.forEach((f) => map.set(f.id, { ...f, children: [] }));
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNodes = (nodes: FolderNode[]): FolderNode[] =>
    nodes
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((n) => ({ ...n, children: sortNodes(n.children) }));
  return sortNodes(roots);
}

interface FolderItemProps {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  expanded: Record<string, boolean>;
  editingId: string | null;
  editValue: string;
  menuOpenId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onStartEdit: (id: string, name: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onEditValueChange: (v: string) => void;
  onDelete: (id: string) => void;
  onMenuToggle: (id: string | null) => void;
}

function FolderItem({
  node,
  depth,
  selectedId,
  expanded,
  editingId,
  editValue,
  menuOpenId,
  onSelect,
  onToggle,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onEditValueChange,
  onDelete,
  onMenuToggle,
}: FolderItemProps) {
  const { t } = useTranslation();
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded[node.id] ?? true;
  const isSelected = selectedId === node.id;
  const isEditing = editingId === node.id;
  const isMenuOpen = menuOpenId === node.id;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-accent cursor-pointer',
          isSelected && 'bg-accent text-accent-foreground font-medium'
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={() => onSelect(node.id)}
      >
        <button
          type="button"
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-background/50"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : (
            <span className="h-3 w-3" />
          )}
        </button>
        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        {isEditing ? (
          <input
            autoFocus
            className="flex-1 rounded border bg-background px-1 text-sm outline-none"
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onBlur={onCommitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">{node.name}</span>
        )}
        <div className="relative">
          <button
            type="button"
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-background/50',
              isMenuOpen && 'opacity-100'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle(isMenuOpen ? null : node.id);
            }}
          >
            <MoreVertical className="h-3 w-3" />
          </button>
          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => onMenuToggle(null)}
              />
              <div className="absolute right-0 top-6 z-50 w-32 rounded-md border bg-background shadow-md">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartEdit(node.id, node.name);
                    onMenuToggle(null);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("notes.renameFolder")}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-destructive hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node.id);
                    onMenuToggle(null);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("notes.delete")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              editingId={editingId}
              editValue={editValue}
              menuOpenId={menuOpenId}
              onSelect={onSelect}
              onToggle={onToggle}
              onStartEdit={onStartEdit}
              onCommitEdit={onCommitEdit}
              onCancelEdit={onCancelEdit}
              onEditValueChange={onEditValueChange}
              onDelete={onDelete}
              onMenuToggle={onMenuToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function NoteSidebar({
  selectedFolderId,
  onSelectFolder,
  selectedTagId,
  onSelectTag,
  searchQuery,
  onSearchChange,
}: NoteSidebarProps) {
  const { t } = useTranslation();
  const { data: folders = [] } = useFolders();
  const { data: tags = [] } = useNoteTags();
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const createNote = useCreateNote();
  const createTag = useCreateNoteTag();
  const deleteTag = useDeleteNoteTag();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  const handleToggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditValue(name);
  };

  const handleCommitEdit = () => {
    if (editingId && editValue.trim()) {
      updateFolder.mutate({ id: editingId, data: { name: editValue.trim() } });
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleDeleteFolder = async (id: string) => {
    const ok = await confirm({
      title: t("notes.deleteFolder"),
      description: t("notes.deleteFolderConfirm"),
      confirmText: t("notes.delete"),
      destructive: true,
    });
    if (ok) {
      deleteFolder.mutate(id);
      if (selectedFolderId === id) onSelectFolder(null);
    }
  };

  const handleCreateFolder = () => {
    createFolder.mutate({ name: t('notes.newFolderDefault') });
  };

  const handleCreateNote = () => {
    createNote.mutate({
      title: t('notes.untitledNote'),
      folder_id: selectedFolderId ?? undefined,
    });
  };

  return (
    <div className="flex h-full w-full flex-col border-r bg-muted/30">
      <div className="flex items-center gap-1 border-b p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleCreateNote}
          title={t('notes.newNote')}
        >
          <FilePlus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleCreateFolder}
          title={t('notes.newFolder')}
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
        <Input
          placeholder={t('notes.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 flex-1"
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          <div
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer',
              selectedFolderId === null && 'bg-accent font-medium'
            )}
            onClick={() => onSelectFolder(null)}
          >
            <Inbox className="h-4 w-4 shrink-0" />
            <span>{t('notes.allNotes')}</span>
          </div>

          <Separator className="my-2" />

          {tree.map((node) => (
            <FolderItem
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedFolderId}
              expanded={expanded}
              editingId={editingId}
              editValue={editValue}
              menuOpenId={menuOpenId}
              onSelect={onSelectFolder}
              onToggle={handleToggle}
              onStartEdit={handleStartEdit}
              onCommitEdit={handleCommitEdit}
              onCancelEdit={handleCancelEdit}
              onEditValueChange={setEditValue}
              onDelete={handleDeleteFolder}
              onMenuToggle={setMenuOpenId}
            />
          ))}

          <Separator className="my-2" />

          {/* 标签筛选区（NF-2：笔记标签按标签筛选 + CRUD） */}
          <div className="mb-1 flex items-center justify-between px-2">
            <span className="text-xs font-semibold text-muted-foreground">{t('notes.tags')}</span>
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background/50"
              onClick={() => {
                setNewTagName('');
                setCreatingTag(true);
              }}
              title={t('notes.newTag')}
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1 px-2">
            {tags.map((tag) => {
              const active = selectedTagId === tag.id;
              return (
                <span
                  key={tag.id}
                  className={cn(
                    'group/tag inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                    active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'hover:bg-accent'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTag(active ? null : tag.id)}
                    className="flex items-center gap-1"
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color ?? '#94a3b8' }}
                    />
                    {tag.name}
                  </button>
                  <button
                    type="button"
                    className="opacity-0 transition-opacity hover:text-destructive group-hover/tag:opacity-100"
                    title={t('notes.deleteTag')}
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await confirm({
                        title: t('notes.deleteTag'),
                        description: t('notes.deleteTagConfirm', { name: tag.name }),
                        confirmText: t('notes.delete'),
                        destructive: true,
                      });
                      if (ok) deleteTag.mutate(tag.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            {creatingTag && (
              <input
                autoFocus
                className="w-20 rounded-full border bg-background px-2 py-0.5 text-xs outline-none"
                placeholder={t('notes.tagNamePlaceholder')}
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onBlur={() => {
                  if (newTagName.trim()) createTag.mutate({ name: newTagName });
                  setCreatingTag(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTagName.trim()) {
                    createTag.mutate({ name: newTagName });
                    setCreatingTag(false);
                  }
                  if (e.key === 'Escape') setCreatingTag(false);
                }}
              />
            )}
            {tags.length === 0 && !creatingTag && (
              <span className="px-2 text-xs text-muted-foreground">{t('notes.noTags')}</span>
            )}
          </div>

          {folders.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8" />
              <div>{t('notes.noFolders')}</div>
              <Button variant="outline" size="sm" onClick={handleCreateFolder}>
                {t('notes.newFolder')}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
