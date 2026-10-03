import { http, HttpResponse } from 'msw';
import type { AdminSession, Device, StatsSummary, TimeseriesPoint, TopEntry } from '@/api/types';
import {
  makeAdminSession,
  makeDevice,
  page,
  SUMMARY,
  TIMESERIES,
  TOP_INITIATORS,
  TOP_TARGETS,
  type Page,
} from './fixtures';
import { apiError, apiUrl } from './server';

/** The dashboard's endpoints with fixed data. */
export const dashboardHandlers = [
  http.get(apiUrl('/stats/summary'), () => HttpResponse.json<StatsSummary>(SUMMARY)),
  http.get(apiUrl('/stats/timeseries'), () => HttpResponse.json<TimeseriesPoint[]>(TIMESERIES)),
  http.get(apiUrl('/stats/top'), ({ request }) =>
    HttpResponse.json<TopEntry[]>(
      new URL(request.url).searchParams.get('by') === 'target' ? TOP_TARGETS : TOP_INITIATORS,
    ),
  ),
];

export const devicesHandler = (devices: Device[] = [makeDevice()]) =>
  http.get(apiUrl('/devices'), () => HttpResponse.json<Page<Device>>(page(devices)));

/** Not signed in until a successful login. */
export function signedOutHandlers(options: { password?: string } = {}) {
  let signedIn = false;
  return [
    http.get(apiUrl('/auth/me'), () =>
      signedIn
        ? HttpResponse.json<AdminSession>(makeAdminSession())
        : apiError(401, 'UNAUTHORIZED', 'Not signed in'),
    ),
    http.post(apiUrl('/auth/login'), async ({ request }) => {
      const body = (await request.json()) as { username: string; password: string };
      if (body.username !== 'admin' || body.password !== (options.password ?? 'correct horse')) {
        return apiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
      }
      signedIn = true;
      return HttpResponse.json<AdminSession>(makeAdminSession());
    }),
  ];
}
