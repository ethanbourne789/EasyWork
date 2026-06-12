export type NavRoute = 'dashboard' | 'kanban' | 'calendar' | 'mail' | 'notes' | 'stock' | 'accounting' | 'sports' | 'logs' | 'settings';

export interface NavItem {
  route: NavRoute;
  label: string;
  icon: string;
  divider?: boolean;
}
