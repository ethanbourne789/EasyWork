import type { DateTimeString } from './common';

export type SportType = 'running' | 'cycling' | 'fitness' | 'ball_game';

export interface SportRecord {
  id: number;
  type: SportType;
  duration: number;
  distance: number | null;
  calories: number;
  date: string;
  note: string;
  createdAt: DateTimeString;
}

export interface SportGoal {
  weeklyTarget: number;
  weeklyCompleted: number;
}
