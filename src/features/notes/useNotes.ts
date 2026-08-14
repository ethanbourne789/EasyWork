import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeMutation } from '@/lib/mutation';
import i18n from '@/lib/i18n';
import { notesApi } from './notesApi';
import type { Note, NoteFolder } from '@/types';

// Query keys
export const notesKeys = {
  all: ['notes'] as const,
  lists: () => [...notesKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...notesKeys.lists(), filters] as const,
  details: () => [...notesKeys.all, 'detail'] as const,
  detail: (id: string) => [...notesKeys.details(), id] as const,
  folders: ['note-folders'] as const,
  tags: ['note-tags'] as const,
};

// Queries
export function useNotes() {
  return useQuery({
    queryKey: notesKeys.lists(),
    queryFn: () => notesApi.listNotes(),
  });
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: notesKeys.detail(id!),
    queryFn: () => notesApi.getNote(id!),
    enabled: !!id,
  });
}

export function useFolders() {
  return useQuery({
    queryKey: notesKeys.folders,
    queryFn: () => notesApi.listFolders(),
  });
}

export function useNoteTags() {
  return useQuery({
    queryKey: notesKeys.tags,
    queryFn: () => notesApi.listTags(),
  });
}

/** 全部 笔记↔标签 关联，构建 noteId -> tagId[] 映射，供列表按标签筛选。 */
export function useNoteTagRelations() {
  return useQuery({
    queryKey: ['note-tag-relations'],
    queryFn: () => notesApi.getAllNoteTagRelations(),
  });
}

export function useNoteTagIds(noteId: string | undefined) {
  return useQuery({
    queryKey: ['note-tag-ids', noteId],
    queryFn: () => {
      if (!noteId) return [] as string[];
      return notesApi.getNoteTagIds(noteId);
    },
    enabled: !!noteId,
  });
}

export function useCreateNoteTag() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      return notesApi.createTag({ name: data.name.trim(), color: data.color });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKeys.tags }),
  });
}

export function useUpdateNoteTag() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; color?: string } }) => {
      return notesApi.updateTag({ id, ...data });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKeys.tags }),
  });
}

export function useDeleteNoteTag() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (id: string) => {
      await notesApi.deleteTag(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notesKeys.tags });
      qc.invalidateQueries({ queryKey: ['note-tag-relations'] });
    },
  });
}

/** 整体替换某篇笔记的标签关联（先删后插）。 */
export function useSetNoteTags() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async ({ noteId, tagIds }: { noteId: string; tagIds: string[] }) => {
      await notesApi.setNoteTags({ note_id: noteId, tag_ids: tagIds });
      return { noteId, tagIds };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['note-tag-relations'] });
      qc.invalidateQueries({ queryKey: ['note-tag-ids', res.noteId] });
    },
  });
}

// Mutations
export function useCreateNote() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async (data: Partial<Note>) => {
      return notesApi.createNote({
        title: data.title || i18n.t('notes.untitledNote'),
        content: (data.content || { type: 'doc', content: [] }) as Note["content"],
        content_text: data.content_text || '',
        folder_id: data.folder_id,
        is_pinned: data.is_pinned || false,
        cover_url: data.cover_url,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.lists() });
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Note> }) => {
      return notesApi.updateNote({
        id,
        title: data.title,
        content: data.content as Note["content"],
        content_text: data.content_text,
        folder_id: data.folder_id,
        is_pinned: data.is_pinned,
        cover_url: data.cover_url,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notesKeys.detail(variables.id) });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async (id: string) => {
      await notesApi.deleteNote(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.lists() });
    },
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async (data: Partial<NoteFolder>) => {
      return notesApi.createFolder({
        name: data.name || i18n.t('notes.newFolderDefault'),
        parent_id: data.parent_id,
        sort_order: data.sort_order || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.folders });
    },
  });
}

export function useUpdateFolder() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<NoteFolder> }) => {
      return notesApi.updateFolder({ id, ...data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.folders });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useSafeMutation({
    mutationFn: async (id: string) => {
      // 读取被删文件夹，确定其上移目标父级
      const folders = await notesApi.listFolders();
      const folder = folders.find((f) => f.id === id);
      const newParentId = folder?.parent_id ?? null;

      // 该文件夹下的笔记移至"未分类"（清空 folder_id），保持可达
      const notes = await notesApi.listNotes();
      for (const note of notes) {
        if (note.folder_id === id) {
          await notesApi.updateNote({ id: note.id, folder_id: undefined }, ["folder_id"]);
        }
      }

      // 直接子文件夹上移到被删文件夹的父级，保持可达
      for (const f of folders) {
        if (f.parent_id === id) {
          await notesApi.updateFolder(
            { id: f.id, parent_id: newParentId ?? undefined },
            newParentId ? undefined : ["parent_id"],
          );
        }
      }

      await notesApi.deleteFolder(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.folders });
      queryClient.invalidateQueries({ queryKey: notesKeys.lists() });
    },
  });
}
