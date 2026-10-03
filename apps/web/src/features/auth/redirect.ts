const PROBE_ORIGIN = 'http://redirect.invalid';

/**
 * A `?redirect=` target reduced to a same-origin relative path. Anything else — absolute URLs,
 * protocol-relative `//host`, backslash tricks, `javascript:` — falls back to `/`.
 */
export function safeRedirect(target: string | null | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) {
    return '/';
  }
  try {
    const url = new URL(target, PROBE_ORIGIN);
    if (url.origin !== PROBE_ORIGIN) return '/';
    if (url.pathname.startsWith('/login')) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

export type LoginReason = 'expired';

/** `/login?redirect=<path>` for the current location. */
export function loginPath(
  location: { pathname: string; search: string; hash?: string },
  reason?: LoginReason,
): string {
  const params = new URLSearchParams();
  const current = `${location.pathname}${location.search}${location.hash ?? ''}`;
  if (current !== '/' && !location.pathname.startsWith('/login')) params.set('redirect', current);
  if (reason) params.set('reason', reason);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}
