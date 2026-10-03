import type { Page, Route } from '@playwright/test';
import type { Schema } from '@rustdesk-admin/api-contract';
import { ADMIN, activeSession, historySession } from './fixtures';

type Book = Schema<'AddressBookDto'>;
type Peer = Schema<'AdminPeerDto'>;
type Disconnect = Schema<'DisconnectDto'>;

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const empty = (route: Route) => route.fulfill({ status: 204, body: '' });
const pageOf = <T>(data: T[]) => ({ data, total: data.length, page: 1, pageSize: 50 });

/**
 * The remote-disconnect lifecycle, mocked in every mode (a real active session cannot be produced
 * on demand): requested → delivered on the next poll → closed on the one after.
 */
export async function mockDisconnect(page: Page): Promise<void> {
  const session = activeSession();
  let state: Disconnect['state'] | null = null;
  let polls = 0;
  const disconnect = (): Disconnect => ({
    id: '20000000-0000-4000-8000-0000000000e2',
    sessionId: session.id,
    state: state ?? 'REQUESTED',
    requestedAt: new Date().toISOString(),
    deliveredAt: state === 'DELIVERED' ? new Date().toISOString() : null,
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    requestedBy: { id: ADMIN.id, username: ADMIN.username },
    deviceUuid: session.deviceUuid,
    connId: session.connId,
  });
  const closed = () => state === 'DELIVERED' && polls >= 2;

  await page.route('**/api/admin/sessions/active*', (route) =>
    json(route, pageOf(closed() ? [] : [session])),
  );
  await page.route(`**/api/admin/sessions/${session.id}/disconnect`, (route) => {
    if (route.request().method() === 'POST') {
      state = 'REQUESTED';
      return json(route, disconnect(), 201);
    }
    if (!state) return json(route, { error: { code: 'NOT_FOUND', message: 'No request' } }, 404);
    state = 'DELIVERED';
    return json(route, disconnect());
  });
  await page.route(`**/api/admin/sessions/${session.id}`, (route) => {
    if (state === 'DELIVERED') polls += 1;
    return json(
      route,
      closed()
        ? {
            ...session,
            events: [],
            status: 'CLOSED',
            closeReason: 'ADMIN_DISCONNECT',
            closedAt: new Date().toISOString(),
            durationSeconds: 300,
          }
        : { ...session, events: [] },
    );
  });
}

/** The whole admin API in memory, for runs without a backend. Never logs request bodies. */
export async function mockApi(page: Page): Promise<void> {
  let signedIn = false;
  const books: Book[] = [];
  const peers = new Map<string, Peer[]>();

  await page.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/admin/, '');
    const method = request.method();

    if (path === '/auth/me') {
      return signedIn
        ? json(route, { user: ADMIN, expiresAt: new Date(Date.now() + 3600_000).toISOString() })
        : json(route, { error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, 401);
    }
    if (path === '/auth/login' && method === 'POST') {
      const body = request.postDataJSON() as { username: string; password: string };
      if (body.username !== 'admin' || body.password !== 'e2e-password') {
        return json(
          route,
          { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } },
          401,
        );
      }
      signedIn = true;
      return json(route, { user: ADMIN, expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    }
    if (path === '/auth/logout') {
      signedIn = false;
      return empty(route);
    }
    if (!signedIn)
      return json(route, { error: { code: 'UNAUTHORIZED', message: 'Not signed in' } }, 401);

    if (path === '/system/info') {
      return json(route, {
        version: 'e2e',
        sessionTimeoutMinutes: 120,
        heartbeatGraceSeconds: 30,
        deviceOnlineThresholdSeconds: 45,
        disconnectTtlSeconds: 120,
      });
    }
    if (path === '/stats/summary') {
      return json(route, {
        totalSessions: 42,
        totalDurationSeconds: 36_000,
        avgDurationSeconds: 857,
        timedOutSessions: 1,
        activeSessions: 1,
        unauthenticatedSessions: 2,
      });
    }
    if (path === '/stats/timeseries') {
      return json(route, [
        { bucketStart: '2026-10-03T09:00:00.000Z', sessions: 3, durationSeconds: 5400 },
      ]);
    }
    if (path === '/stats/top')
      return json(route, [{ id: '111222333', name: 'alice', sessions: 3, durationSeconds: 5400 }]);
    if (path === '/sessions') {
      const status = url.searchParams.get('status');
      const all = [
        historySession(),
        historySession({
          id: '10000000-0000-4000-8000-0000000000e4',
          status: 'CLOSED',
          closeReason: 'CLIENT_CLOSE',
          durationEstimated: false,
        }),
      ];
      return json(route, pageOf(all.filter((s) => !status || s.status === status)));
    }

    if (path === '/address-books' && method === 'GET') return json(route, pageOf(books));
    if (path === '/address-books' && method === 'POST') {
      const body = request.postDataJSON() as { name: string; note: string | null };
      const book: Book = {
        guid: `40000000-0000-4000-8000-${String(books.length + 1).padStart(12, '0')}`,
        kind: 'SHARED',
        name: body.name,
        note: body.note,
        ownerId: ADMIN.id,
        ownerUsername: ADMIN.username,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        peerCount: 0,
        shareCount: 0,
      };
      books.push(book);
      peers.set(book.guid, []);
      return json(route, book, 201);
    }
    const bookMatch = /^\/address-books\/([^/]+)(\/.*)?$/.exec(path);
    if (bookMatch) {
      const [, guid = '', rest = ''] = bookMatch;
      const book = books.find((b) => b.guid === guid);
      if (!book)
        return json(
          route,
          { error: { code: 'NOT_FOUND', message: 'Address book not found' } },
          404,
        );
      const list = peers.get(guid) ?? [];
      if (rest === '' && method === 'GET') return json(route, { ...book, peerCount: list.length });
      if (rest === '' && method === 'DELETE') {
        books.splice(books.indexOf(book), 1);
        return empty(route);
      }
      if (rest === '/tags') return json(route, []);
      if (rest === '/shares') return json(route, []);
      if (rest === '/peers' && method === 'GET') return json(route, pageOf(list));
      if (rest === '/peers' && method === 'POST') {
        const body = request.postDataJSON() as Partial<Peer> & {
          peerId: string;
          password?: string;
        };
        if (list.some((p) => p.peerId === body.peerId)) {
          return json(
            route,
            { error: { code: 'ALREADY_EXISTS', message: 'A peer with this ID already exists' } },
            409,
          );
        }
        const peer: Peer = {
          peerId: body.peerId,
          alias: body.alias ?? '',
          note: body.note ?? '',
          tags: body.tags ?? [],
          username: body.username ?? '',
          hostname: body.hostname ?? '',
          platform: body.platform ?? '',
          hasPassword: !!body.password,
          hasHash: false,
          extra: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        peers.set(guid, [...list, peer]);
        return json(route, peer, 201);
      }
      const peerMatch = /^\/peers\/(.+)$/.exec(rest);
      if (peerMatch && method === 'DELETE') {
        peers.set(
          guid,
          list.filter((p) => p.peerId !== decodeURIComponent(peerMatch[1] ?? '')),
        );
        return empty(route);
      }
    }
    return json(
      route,
      { error: { code: 'NOT_FOUND', message: `No mock for ${method} ${path}` } },
      404,
    );
  });
}
