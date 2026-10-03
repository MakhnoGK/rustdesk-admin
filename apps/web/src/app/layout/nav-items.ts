import {
  ActivityIcon,
  BookUserIcon,
  HistoryIcon,
  InfoIcon,
  LayoutDashboardIcon,
  MonitorIcon,
  ScrollTextIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
  /** Exact match only (the dashboard at `/`, history at `/sessions` vs `/sessions/active`). */
  end?: boolean;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Monitoring',
    items: [
      { title: 'Dashboard', to: '/', icon: LayoutDashboardIcon, end: true },
      { title: 'Active sessions', to: '/sessions/active', icon: ActivityIcon },
      { title: 'Session history', to: '/sessions', icon: HistoryIcon, end: true },
      { title: 'Devices', to: '/devices', icon: MonitorIcon },
      { title: 'Audit log', to: '/audit', icon: ScrollTextIcon },
    ],
  },
  {
    label: 'Management',
    items: [
      { title: 'Address books', to: '/address-books', icon: BookUserIcon },
      { title: 'Users', to: '/users', icon: UsersIcon },
    ],
  },
  {
    label: 'System',
    items: [{ title: 'About', to: '/about', icon: InfoIcon }],
  },
];
