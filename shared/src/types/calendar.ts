import type { DateTimeString } from './common';

export type CalendarViewMode = 'day' | 'week' | 'month' | 'year';
export type EventType = 'event' | 'task_deadline' | 'expense' | 'sport';

export interface CalendarEvent {
  id: number;
  title: string;
  description: string;
  startAt: DateTimeString;
  endAt: DateTimeString;
  type: EventType;
  color: string;
  isAllDay: boolean;
}
