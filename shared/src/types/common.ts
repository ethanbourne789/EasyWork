export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export type DateTimeString = string;
export type DateString = string;
export type PriorityLevel = 'high' | 'medium' | 'low';
export type ThemeMode = 'light' | 'dark' | 'system';
