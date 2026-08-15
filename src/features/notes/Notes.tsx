import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@tanstack/react-router';
import { Plus, FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoteSidebar } from './NoteSidebar';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';
import { useNote, useCreateNote } from './useNotes';
import { ModuleFab } from '@/components/layout/ModuleFab';

export function Notes() {
  const { t } = useTranslation();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileView, setMobileView] = useState<'sidebar' | 'list' | 'editor'>('list');

  const { data: selectedNote } = useNote(selectedNoteId || undefined);

  const { mutateAsync: createNote } = useCreateNote();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreateNote = async (title?: string) => {
    // 创建后自动选中并打开编辑器（此前只创建不选中，桌面端点击后无反应）
    try {
      const note = await createNote({
        title: title ?? t('notes.untitledNote'),
        folder_id: selectedFolderId ?? undefined,
      });
      setSelectedNoteId(note.id);
      setMobileView('editor');
    } catch {
      // useSafeMutation 已兜底 toast 错误
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      createNote({ title: file.name, content_text: String(reader.result) });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 全局搜索深链：URL 携带 ?focus=<noteId> 时自动打开对应笔记
  const { focus } = useSearch({ from: '/app/notes' });
  useEffect(() => {
    if (focus) {
      setSelectedNoteId(focus);
      setMobileView('editor');
    }
  }, [focus]);

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setSelectedNoteId(null);
    setSelectedTagId(null);
    setMobileView('list');
  };

  const handleSelectTag = (tagId: string | null) => {
    setSelectedTagId(tagId);
    setSelectedNoteId(null);
    setMobileView('list');
  };

  const handleSelectNote = (noteId: string) => {
    setSelectedNoteId(noteId);
    setMobileView('editor');
  };

  const handleNoteDeleted = (noteId: string) => {
    if (selectedNoteId === noteId) {
      setSelectedNoteId(null);
      setMobileView('list');
    }
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* 页面标题 — 对齐原型 */}
      <div className="flex items-end justify-between gap-4 border-b p-4 pb-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight">{t('notes.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('notes.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => handleCreateNote()} className="hidden md:flex items-center gap-1">
          <Plus size={15} /> {t('notes.newNote')}
        </Button>
      </div>

      {/* 桌面端布局：未选笔记时两栏，选中后三栏 */}
      <div className="hidden h-full w-full md:flex">
        {/* 文件夹树 - 左栏 */}
        <div className="h-full w-[200px] shrink-0 border-r">
          <NoteSidebar
            selectedFolderId={selectedFolderId}
            onSelectFolder={handleSelectFolder}
            selectedTagId={selectedTagId}
            onSelectTag={handleSelectTag}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
          />
        </div>

        {/* 笔记列表 - 中间栏 */}
        <div className="h-full min-w-0 shrink-0 border-r md:w-[280px]">
          <NoteList
            selectedFolderId={selectedFolderId}
            selectedTagId={selectedTagId}
            selectedNoteId={selectedNoteId}
            onSelectNote={handleSelectNote}
            onNoteDeleted={handleNoteDeleted}
            searchQuery={searchQuery}
            onClearTag={() => handleSelectTag(null)}
          />
        </div>

        {/* 编辑器 - 右栏（仅选中笔记时显示） */}
        {selectedNote ? (
          <div className="h-full flex-1">
            <NoteEditor note={selectedNote} />
          </div>
        ) : (
          <div className="hidden flex-1 items-center justify-center text-sm text-muted-foreground md:flex">
            {t('notes.selectNoteToEdit')}
          </div>
        )}
      </div>

      {/* 移动端单栏切换布局 */}
      <div className="flex h-full w-full flex-col md:hidden">
        {/* 视图切换标签栏 */}
        <div className="flex border-b bg-muted/30">
          <button
            onClick={() => setMobileView('sidebar')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              mobileView === 'sidebar'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('notes.folders')}
          </button>
          <button
            onClick={() => setMobileView('list')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              mobileView === 'list'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('notes.noteList')}
          </button>
          <button
            onClick={() => setMobileView('editor')}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              mobileView === 'editor'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('notes.editor')}
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-hidden">
          {mobileView === 'sidebar' && (
            <div className="h-full">
              <NoteSidebar
                selectedFolderId={selectedFolderId}
                onSelectFolder={handleSelectFolder}
                selectedTagId={selectedTagId}
                onSelectTag={handleSelectTag}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
              />
            </div>
          )}

          {mobileView === 'list' && (
            <div className="h-full">
              <NoteList
                selectedFolderId={selectedFolderId}
                selectedTagId={selectedTagId}
                selectedNoteId={selectedNoteId}
                onSelectNote={handleSelectNote}
                onNoteDeleted={handleNoteDeleted}
                searchQuery={searchQuery}
                onClearTag={() => handleSelectTag(null)}
              />
            </div>
          )}

          {mobileView === 'editor' && (
            <div className="h-full">
              <NoteEditor note={selectedNote || null} />
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,text/*"
        className="hidden"
        onChange={handleImportFile}
      />
      <ModuleFab
        mainIcon={Plus}
        actions={[
          { label: t('notes.newNote'), icon: Plus, onClick: () => handleCreateNote() },
          { label: t('notes.fromTemplate'), icon: FileText, onClick: () => handleCreateNote(t('notes.newNoteTemplate')) },
          { label: t('notes.importFile'), icon: Upload, onClick: () => fileInputRef.current?.click() },
        ]}
      />
    </div>
  );
}
