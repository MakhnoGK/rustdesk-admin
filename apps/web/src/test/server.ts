import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { AdminSession, ErrorBody, SystemInfo } from '@/api/types';
import { makeAdminSession, SYSTEM_INFO } from './fixtures';

/** Matches the API on any origin (the client uses window.location.origin in tests). */
export const apiUrl = (path: string) => `*/api/admin${path}`;

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: { field: string; message: string }[],
  headers?: Record<string, string>,
) {
  const body = { error: { code, message, ...(details ? { details } : {}) } } as ErrorBody;
  return HttpResponse.json(body, { status, headers });
}

// Defaults: a signed-in administrator and the system settings. Tests override per case.
// No handler logs request bodies (credentials pass through the auth handlers).
export const defaultHandlers = [
  http.get(apiUrl('/auth/me'), () => HttpResponse.json<AdminSession>(makeAdminSession())),
  http.post(apiUrl('/auth/logout'), () => new HttpResponse(null, { status: 204 })),
  http.get(apiUrl('/system/info'), () => HttpResponse.json<SystemInfo>(SYSTEM_INFO)),
];

export const server = setupServer(...defaultHandlers);
