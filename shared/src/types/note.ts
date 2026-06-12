import type { DateTimeString } from './common';

export interface Note {
  id: number;
  title: string;
  content: string;
  folderId: number;
  tags: string[];
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

export interface NoteFolder {
  id: number;
  name: string;
  parentId: number | null;
}
