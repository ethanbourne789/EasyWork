import { isTauri } from "@/lib/tauri";
import type { Note, NoteFolder, NoteTag, NoteNoteTag, TiptapJSON } from "@/types";

/**
 * 懒加载 Tauri invoke 函数。
 * 使用动态导入避免在浏览器环境下因 @tauri-apps/api/core 模块无法加载而崩溃。
 */
async function getInvoke() {
  if (!isTauri()) {
    throw new Error("Tauri runtime not available");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

export const notesApi = {
  // ---------------------------------------------------------------------------
  // Note CRUD
  // ---------------------------------------------------------------------------
  listNotes: async () => {
    const invoke = await getInvoke();
    return invoke<Note[]>("note_list_all");
  },
  getNote: async (id: string) => {
    const invoke = await getInvoke();
    return invoke<Note>("note_get", { id });
  },
  createNote: async (data: {
    title: string;
    content?: TiptapJSON;
    content_text?: string;
    folder_id?: string;
    is_pinned?: boolean;
    cover_url?: string;
  }) => {
    const invoke = await getInvoke();
    return invoke<Note>("note_create", {
      title: data.title,
      content: data.content ? JSON.stringify(data.content) : "",
      content_text: data.content_text,
      folder_id: data.folder_id,
      is_pinned: data.is_pinned,
      cover_url: data.cover_url,
    });
  },
  updateNote: async (
    data: {
      id: string;
      title?: string;
      content?: TiptapJSON;
      content_text?: string;
      folder_id?: string;
      is_pinned?: boolean;
      cover_url?: string;
    },
    null_fields?: string[],
  ) => {
    const invoke = await getInvoke();
    return invoke<Note>("note_update", {
      id: data.id,
      title: data.title,
      content: data.content ? JSON.stringify(data.content) : undefined,
      content_text: data.content_text,
      folder_id: data.folder_id,
      is_pinned: data.is_pinned,
      cover_url: data.cover_url,
      null_fields,
    });
  },
  deleteNote: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("note_delete", { id });
  },

  // ---------------------------------------------------------------------------
  // NoteFolder CRUD
  // ---------------------------------------------------------------------------
  listFolders: async () => {
    const invoke = await getInvoke();
    return invoke<NoteFolder[]>("note_folder_list_all");
  },
  createFolder: async (data: {
    name: string;
    parent_id?: string;
    sort_order?: number;
  }) => {
    const invoke = await getInvoke();
    return invoke<NoteFolder>("note_folder_create", {
      name: data.name,
      parent_id: data.parent_id,
      sort_order: data.sort_order,
    });
  },
  updateFolder: async (
    data: {
      id: string;
      name?: string;
      parent_id?: string;
      sort_order?: number;
    },
    null_fields?: string[],
  ) => {
    const invoke = await getInvoke();
    return invoke<NoteFolder>("note_folder_update", {
      id: data.id,
      name: data.name,
      parent_id: data.parent_id,
      sort_order: data.sort_order,
      null_fields,
    });
  },
  deleteFolder: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("note_folder_delete", { id });
  },

  // ---------------------------------------------------------------------------
  // NoteTag CRUD
  // ---------------------------------------------------------------------------
  listTags: async () => {
    const invoke = await getInvoke();
    return invoke<NoteTag[]>("note_tag_list_all");
  },
  createTag: async (data: { name: string; color?: string }) => {
    const invoke = await getInvoke();
    return invoke<NoteTag>("note_tag_create", {
      name: data.name,
      color: data.color,
    });
  },
  updateTag: async (data: { id: string; name?: string; color?: string }) => {
    const invoke = await getInvoke();
    return invoke<NoteTag>("note_tag_update", {
      id: data.id,
      name: data.name,
      color: data.color,
    });
  },
  deleteTag: async (id: string) => {
    const invoke = await getInvoke();
    return invoke("note_tag_delete", { id });
  },

  // ---------------------------------------------------------------------------
  // Note-Tag Relations
  // ---------------------------------------------------------------------------
  getNoteTags: async (noteId: string) => {
    const invoke = await getInvoke();
    return invoke<NoteTag[]>("note_tag_get_by_note", { note_id: noteId });
  },
  getNoteTagIds: async (noteId: string) => {
    const invoke = await getInvoke();
    return invoke<string[]>("note_tag_get_ids", { note_id: noteId });
  },
  getAllNoteTagRelations: async () => {
    const invoke = await getInvoke();
    return invoke<Record<string, string[]>>("note_tag_list_all_relations");
  },
  setNoteTags: async (data: { note_id: string; tag_ids: string[] }) => {
    const invoke = await getInvoke();
    return invoke<NoteNoteTag[]>("note_tag_set", {
      note_id: data.note_id,
      tag_ids: data.tag_ids,
    });
  },
};
