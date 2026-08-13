import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getCurrentUserId } from '@/features/auth/authStore';
import { useSafeMutation } from '@/lib/mutation';
import i18n from '@/lib/i18n';
import type { Note, NoteFolder, NoteTag } from '@/types';

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
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: notesKeys.detail(id!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as Note | null;
    },
    enabled: !!id,
  });
}

export function useFolders() {
  return useQuery({
    queryKey: notesKeys.folders,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('note_folders')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as NoteFolder[];
    },
  });
}

export function useNoteTags() {
  return useQuery({
    queryKey: notesKeys.tags,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('note_tags')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as NoteTag[];
    },
  });
}

/** 全部 笔记↔标签 关联，构建 noteId -> tagId[] 映射，供列表按标签筛选。 */
export function useNoteTagRelations() {
  return useQuery({
    queryKey: ['note-tag-relations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('note_note_tags')
        .select('note_id, tag_id');
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const r of (data ?? []) as { note_id: string; tag_id: string }[]) {
        (map[r.note_id] ??= []).push(r.tag_id);
      }
      return map;
    },
  });
}

export function useNoteTagIds(noteId: string | undefined) {
  return useQuery({
    queryKey: ['note-tag-ids', noteId],
    queryFn: async () => {
      if (!noteId) return [] as string[];
      const { data, error } = await supabase
        .from('note_note_tags')
        .select('tag_id')
        .eq('note_id', noteId);
      if (error) throw error;
      return (data ?? []).map((r: { tag_id: string }) => r.tag_id);
    },
    enabled: !!noteId,
  });
}

export function useCreateNoteTag() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      const { data: tag, error } = await supabase
        .from('note_tags')
        .insert({ user_id: getCurrentUserId(), name: data.name.trim(), color: data.color })
        .select()
        .single();
      if (error) throw error;
      return tag as NoteTag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKeys.tags }),
  });
}

export function useUpdateNoteTag() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; color?: string } }) => {
      const { data: tag, error } = await supabase
        .from('note_tags')
        .update(data)
        .eq('id', id)
        .eq('user_id', getCurrentUserId())
        .select()
        .single();
      if (error) throw error;
      return tag as NoteTag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKeys.tags }),
  });
}

export function useDeleteNoteTag() {
  const qc = useQueryClient();
  return useSafeMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('note_tags')
        .delete()
        .eq('id', id)
        .eq('user_id', getCurrentUserId());
      if (error) throw error;
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
      const { error: delErr } = await supabase
        .from('note_note_tags')
        .delete()
        .eq('note_id', noteId);
      if (delErr) throw delErr;
      if (tagIds.length) {
        const { error: insErr } = await supabase
          .from('note_note_tags')
          .insert(tagIds.map((tag_id) => ({ note_id: noteId, tag_id })));
        if (insErr) throw insErr;
      }
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
      const userId = getCurrentUserId();
      const { data: note, error } = await supabase
        .from('notes')
        .insert({
          user_id: userId,
          title: data.title || i18n.t('notes.untitledNote'),
          content: data.content || { type: 'doc', content: [] },
          content_text: data.content_text || '',
          folder_id: data.folder_id,
          is_pinned: data.is_pinned || false,
          cover_url: data.cover_url,
        })
        .select()
        .single();
      if (error) throw error;
      return note as Note;
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
      const { data: note, error } = await supabase
        .from('notes')
        .update(data)
        .eq('id', id)
        .eq('user_id', getCurrentUserId())
        .select()
        .single();
      if (error) throw error;
      return note as Note;
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
      const { error } = await supabase.from('notes').delete().eq('id', id).eq('user_id', getCurrentUserId());
      if (error) throw error;
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
      const userId = getCurrentUserId();
      const { data: folder, error } = await supabase
        .from('note_folders')
        .insert({
          user_id: userId,
          name: data.name || i18n.t('notes.newFolderDefault'),
          parent_id: data.parent_id,
          sort_order: data.sort_order || 0,
        })
        .select()
        .single();
      if (error) throw error;
      return folder as NoteFolder;
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
      const { data: folder, error } = await supabase
        .from('note_folders')
        .update(data)
        .eq('id', id)
        .eq('user_id', getCurrentUserId())
        .select()
        .single();
      if (error) throw error;
      return folder as NoteFolder;
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
      const { data: folder, error: selErr } = await supabase
        .from('note_folders')
        .select('parent_id')
        .eq('id', id)
        .eq('user_id', getCurrentUserId())
        .maybeSingle();
      if (selErr) throw selErr;
      const newParentId = folder?.parent_id ?? null;

      // 该文件夹下的笔记移至"未分类"（清空 folder_id），保持可达
      const { error: notesErr } = await supabase
        .from('notes')
        .update({ folder_id: null })
        .eq('folder_id', id)
        .eq('user_id', getCurrentUserId());
      if (notesErr) throw notesErr;

      // 直接子文件夹上移到被删文件夹的父级，保持可达
      const { error: subErr } = await supabase
        .from('note_folders')
        .update({ parent_id: newParentId })
        .eq('parent_id', id)
        .eq('user_id', getCurrentUserId());
      if (subErr) throw subErr;

      const { error: delErr } = await supabase
        .from('note_folders')
        .delete()
        .eq('id', id)
        .eq('user_id', getCurrentUserId());
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.folders });
      queryClient.invalidateQueries({ queryKey: notesKeys.lists() });
    },
  });
}
