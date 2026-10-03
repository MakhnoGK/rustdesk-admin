import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';
import { hasStatus } from '@/api/errors';
import { parseApiDate } from '@/lib/time';
import { meQueryOptions } from './api';
import { endSession } from './session-end';
import { CurrentUserContext, type CurrentUser } from './use-current-user';

/** How long before the cookie expires the user is warned. */
export const EXPIRY_WARNING_MS = 5 * 60_000;
// setTimeout overflows above 2^31-1 ms (~24.8 days).
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Exposes the signed-in administrator. The route loader has already fetched `auth/me`, so the
 * data is there on first render; this component keeps it fresh and handles the cookie's expiry.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const me = useQuery(meQueryOptions());

  useEffect(() => {
    if (hasStatus(me.error, 401)) endSession('expired');
  }, [me.error]);

  const expiresAt = me.data?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const remaining = parseApiDate(expiresAt).getTime() - Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (remaining <= 0) {
      endSession('expired');
      return;
    }
    const warnIn = remaining - EXPIRY_WARNING_MS;
    if (warnIn > 0 && warnIn < MAX_TIMEOUT_MS) {
      timers.push(
        setTimeout(() => {
          toast.warning('Your session expires in 5 minutes', {
            description: 'Save your work. You will need to sign in again.',
            duration: 30_000,
          });
        }, warnIn),
      );
    }
    if (remaining < MAX_TIMEOUT_MS) {
      timers.push(setTimeout(() => endSession('expired'), remaining));
    }
    return () => timers.forEach(clearTimeout);
  }, [expiresAt]);

  const value = useMemo<CurrentUser | null>(
    () => (me.data ? { user: me.data.user, expiresAt: me.data.expiresAt } : null),
    [me.data],
  );

  // The loader guarantees data; after a cache clear (logout) nothing is rendered until navigation.
  if (!value) return null;
  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}
