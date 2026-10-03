import { createContext, useContext } from 'react';
import type { User } from '@/api/types';

export interface CurrentUser {
  user: User;
  /** ISO-8601: when the session cookie expires. */
  expiresAt: string;
}

export const CurrentUserContext = createContext<CurrentUser | null>(null);

/** The signed-in administrator (from `GET /api/admin/auth/me`). */
export function useCurrentUser(): CurrentUser {
  const value = useContext(CurrentUserContext);
  if (!value) throw new Error('useCurrentUser must be used inside <AuthProvider>');
  return value;
}
