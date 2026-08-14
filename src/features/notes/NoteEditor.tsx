import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useEffect, useRef, useCallback, useState } from "react";
import { useTranslation } from 'react-i18next';
import { Plus } from "lucide-react";
import { TiptapToolbar } from "./TiptapToolbar";
import { useUpdateNote, useNoteTagIds, useSetNoteTags, useNoteTags, useCreateNoteTag } from "./useNotes";
import { cn } from "@/lib/utils";
import { AUTOSAVE_DELAY, DEBOUNCE_DELAY } from "@/lib/constants";
import type { Note } from "@/types";

interface NoteEditorProps {
  note: Note | null;
}

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] } as const;

export function NoteEditor({ note }: NoteEditorProps) {
  const { t } = useTranslation();
  const updateNote = useUpdateNote();
  const { data: selectedTagIds = [], isSuccess: tagIdsLoaded } = useNoteTagIds(note?.id);
  const setNoteTags = useSetNoteTags();
  const { data: allTags = [] } = useNoteTags();
  const createTag = useCreateNoteTag();
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 标签就绪守卫：切换笔记后 useNoteTagIds 重新请求期间 selectedTagIds 为 []，
  // 若此刻点击标签会用「空数组+单标签」整体覆盖新笔记的真实标签（先删后插）。
  // 与 TaskForm 的 initRef 守卫同理：仅当当前笔记的标签数据加载完成后才允许切换。
  const tagIdsReadyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (note?.id && tagIdsLoaded && tagIdsReadyRef.current !== note.id) {
      tagIdsReadyRef.current = note.id;
    }
  }, [note?.id, tagIdsLoaded]);
  useEffect(() => {
    // 笔记切换时立即失效守卫，避免旧状态残留
    if (note?.id && tagIdsReadyRef.current !== note.id) {
      tagIdsReadyRef.current = undefined;
    }
  }, [note?.id]);
  const tagIdsReady = (): boolean => !!note?.id && tagIdsReadyRef.current === note.id;

  const toggleTag = (tagId: string) => {
    if (!note || !tagIdsReady()) return;
    const current = selectedTagIds ?? [];
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    setNoteTags.mutate({ noteId: note.id, tagIds: next });
  };

  const createAndAssign = (name: string) => {
    if (!note || !name.trim() || !tagIdsReady()) return;
    createTag.mutate(
      { name: name.trim() },
      {
        onSuccess: (tag) => {
          const current = selectedTagIds ?? [];
          if (!current.includes(tag.id)) {
            setNoteTags.mutate({ noteId: note.id, tagIds: [...current, tag.id] });
          }
        },
      }
    );
  };

  // 用 ref 持有「当前笔记 id」与「编辑器实例」，避免 onUpdate 闭包捕获过期 note，
  // 并在切换笔记时能在内容被覆盖前把上一个笔记的待保存内容落库。
  const noteIdRef = useRef<string | undefined>(note?.id);
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);

  const [title, setTitle] = useState(note?.title ?? "");

  useEffect(() => {
    setTitle(note?.title ?? "");
  }, [note?.id, note?.title]);

  const flushSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const ed = editorRef.current;
    const id = noteIdRef.current;
    if (!ed || !id) return;
    updateNote.mutate({
      id,
      data: { content: ed.getJSON(), content_text: ed.getText() },
    });
  }, [updateNote]);

  const handleContentChange = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(flushSave, AUTOSAVE_DELAY);
  }, [flushSave]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
    ],
    content: note?.content || EMPTY_DOC,
    onUpdate: handleContentChange,
  });
  editorRef.current = editor;

  // 切换笔记：先把上一个笔记尚未 flush 的编辑落库（此刻编辑器仍是旧内容），
  // 再载入新笔记内容。避免防抖窗口内未保存的改动被丢弃。
  useEffect(() => {
    const ed = editorRef.current;
    const prevId = noteIdRef.current;

    if (saveTimeoutRef.current && ed && prevId && prevId !== note?.id) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      updateNote.mutate({
        id: prevId,
        data: { content: ed.getJSON(), content_text: ed.getText() },
      });
    }
    if (titleSaveTimeoutRef.current && prevId && prevId !== note?.id) {
      clearTimeout(titleSaveTimeoutRef.current);
      titleSaveTimeoutRef.current = null;
      updateNote.mutate({ id: prevId, data: { title: title } });
    }

    noteIdRef.current = note?.id;
    if (ed && note) {
      ed.commands.setContent(note.content || EMPTY_DOC);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, editor]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);

    if (titleSaveTimeoutRef.current) clearTimeout(titleSaveTimeoutRef.current);
    titleSaveTimeoutRef.current = setTimeout(() => {
      const id = noteIdRef.current;
      if (id && newTitle !== note?.title) {
        updateNote.mutate({ id, data: { title: newTitle } });
      }
    }, DEBOUNCE_DELAY);
  };

  // 卸载前尽量把待保存内容落库（先 flush，再释放）
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const ed = editorRef.current;
      const id = noteIdRef.current;
      if (ed && id) {
        updateNote.mutate({
          id,
          data: { content: ed.getJSON(), content_text: ed.getText() },
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        {t('notes.selectNoteToEdit')}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col border-l">
      <div className="flex items-center gap-2 p-3 border-b">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          className="flex-1 min-w-0 text-lg font-medium bg-transparent border-none outline-none"
          placeholder={t('notes.noteTitlePlaceholder')}
        />
        {updateNote.isPending && (
          <span className="shrink-0 text-xs text-muted-foreground">{t('notes.saving')}</span>
        )}
      </div>
      {/* 标签选择（NF-2） */}
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">{t('notes.tagLabel')}</span>
        {(allTags ?? []).map((tag) => {
          const active = (selectedTagIds ?? []).includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                active ? "border-brand-500 bg-brand-50 text-brand-700" : "hover:bg-accent"
              )}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: tag.color ?? "#94a3b8" }}
              />
              {tag.name}
            </button>
          );
        })}
        {creatingTag ? (
          <input
            autoFocus
            className="w-20 rounded-full border bg-background px-2 py-0.5 text-xs outline-none"
            placeholder={t('notes.tagNamePlaceholder')}
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onBlur={() => {
              if (newTagName.trim()) createAndAssign(newTagName);
              setCreatingTag(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTagName.trim()) {
                createAndAssign(newTagName);
                setCreatingTag(false);
              }
              if (e.key === "Escape") setCreatingTag(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setNewTagName("");
              setCreatingTag(true);
            }}
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            <Plus className="h-3 w-3" />
            {t('notes.tags')}
          </button>
        )}
        {(allTags ?? []).length === 0 && !creatingTag && (
          <span className="text-xs text-muted-foreground">{t('notes.noTagsHint')}</span>
        )}
      </div>
      {editor && <TiptapToolbar editor={editor} />}
      <div className="flex-1 overflow-auto p-4">
        <EditorContent editor={editor} className="prose prose-sm max-w-none dark:prose-invert" />
      </div>
    </div>
  );
}
