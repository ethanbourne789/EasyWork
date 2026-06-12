import type { PriorityLevel, DateTimeString } from './common';

export type TaskStatus = 'todo' | 'doing' | 'done' | 'abandoned' | 'archived';

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: PriorityLevel;
  urgency: PriorityLevel;
  difficulty: PriorityLevel;
  assignee: string;
  startTime: DateTimeString | null;
  dueTime: DateTimeString | null;
  completedAt: DateTimeString | null;
  rating: number;
  createdAt: DateTimeString;
  updatedAt: DateTimeString;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: PriorityLevel;
  urgency?: PriorityLevel;
  difficulty?: PriorityLevel;
  assignee?: string;
  dueTime?: DateTimeString;
}
