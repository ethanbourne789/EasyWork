import type { NavItem } from '../types/nav';

export const NAV_ITEMS: NavItem[] = [
  { route: 'dashboard', label: 'Dashboard', icon: 'Dashboard' },
  { route: 'kanban', label: '看板', icon: 'ViewKanban' },
  { route: 'calendar', label: '日历', icon: 'CalendarMonth' },
  { route: 'mail', label: '邮箱', icon: 'Mail' },
  { route: 'notes', label: '笔记', icon: 'Note' },
  { route: 'stock', label: '股票', icon: 'ShowChart' },
  { route: 'accounting', label: '记账', icon: 'AccountBalanceWallet' },
  { route: 'sports', label: '运动', icon: 'DirectionsRun' },
  { route: 'logs', label: '日志', icon: 'Description' },
  { route: 'divider' as NavItem['route'], label: '', icon: '', divider: true },
  { route: 'settings', label: '设置', icon: 'Settings' },
];
