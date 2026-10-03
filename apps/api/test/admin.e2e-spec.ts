import request from 'supertest';
import {
  AddressBookKind,
  SessionStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import {
  adminLogin,
  createTestApp,
  createUser,
  ORIGIN,
  PASSWORD,
  resetDatabase,
  rustdeskLogin,
  type TestApp,
} from './utils/test-app';

type ErrorBody = {
  error: { code: string; message: string; details?: Array<{ field: string; message: string }> };
};

describe('Admin API', () => {
  let t: TestApp;
  let cookie: string;
  let adminId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    adminId = (await createUser(t, 'root', { role: UserRole.ADMIN })).id;
    cookie = await adminLogin(t, 'root');
  });
  afterAll(async () => {
    await t.close();
  });

  const get = (path: string) => request(t.http).get(`/api/admin${path}`).set('Cookie', cookie);
  const send = (method: 'post' | 'patch' | 'put' | 'delete', path: string) =>
    request(t.http)[method](`/api/admin${path}`).set('Cookie', cookie).set('Origin', ORIGIN);

  describe('auth', () => {
    it('sets an httpOnly, Secure, SameSite=Strict cookie and serves /me', async () => {
      const res = await request(t.http)
        .post('/api/admin/auth/login')
        .set('Origin', ORIGIN)
        .send({ username: 'root', password: PASSWORD })
        .expect(200);
      const setCookie = (res.headers['set-cookie'] as unknown as string[])[0] ?? '';
      expect(setCookie).toMatch(/^rd_admin_session=/);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/Secure/);
      expect(setCookie).toMatch(/SameSite=Strict/);
      expect(setCookie).toMatch(/Path=\/api\/admin/);
      expect(res.body).toMatchObject({
        user: { username: 'root', role: 'ADMIN' },
        expiresAt: expect.stringMatching(/Z$/),
      });

      const me = await get('/auth/me').expect(200);
      expect((me.body as { user: { id: string } }).user.id).toBe(adminId);
    });

    it('answers 401 without a cookie and after logout', async () => {
      const res = await request(t.http).get('/api/admin/auth/me').expect(401);
      expect((res.body as ErrorBody).error.code).toBe('UNAUTHORIZED');
      await send('post', '/auth/logout').expect(204);
      await get('/auth/me').expect(401);
    });

    it('rejects state-changing requests without an allowed Origin (CSRF)', async () => {
      const missing = await request(t.http)
        .post('/api/admin/users')
        .set('Cookie', cookie)
        .send({ username: 'x1', password: PASSWORD })
        .expect(403);
      expect((missing.body as ErrorBody).error.code).toBe('CSRF_ORIGIN_MISMATCH');
      await request(t.http)
        .post('/api/admin/users')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .send({ username: 'x1', password: PASSWORD })
        .expect(403);
      await request(t.http)
        .post('/api/admin/auth/login')
        .send({ username: 'root', password: PASSWORD })
        .expect(403);
      // Safe methods need no Origin.
      await get('/users').expect(200);
    });

    it('forbids non-admins, in the panel and with a client token', async () => {
      await createUser(t, 'plain');
      const res = await request(t.http)
        .post('/api/admin/auth/login')
        .set('Origin', ORIGIN)
        .send({ username: 'plain', password: PASSWORD })
        .expect(403);
      expect((res.body as ErrorBody).error.code).toBe('FORBIDDEN');
      const clientToken = await rustdeskLogin(t, 'plain');
      await request(t.http)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(401);

      // An admin demoted while signed in loses access on the next request.
      await createUser(t, 'second', { role: UserRole.ADMIN });
      const secondCookie = await adminLogin(t, 'second');
      const second = await t.prisma.user.findUniqueOrThrow({ where: { username: 'second' } });
      await send('patch', `/users/${second.id}`).send({ role: 'USER' }).expect(200);
      await request(t.http).get('/api/admin/users').set('Cookie', secondCookie).expect(403); // the role is checked on every request
    });

    it('answers CORS preflight only for allowed origins', async () => {
      const ok = await request(t.http)
        .options('/api/admin/users')
        .set('Origin', ORIGIN)
        .set('Access-Control-Request-Method', 'POST');
      expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
      expect(ok.headers['access-control-allow-credentials']).toBe('true');
      const bad = await request(t.http)
        .options('/api/admin/users')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'POST');
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
      const rd = await request(t.http)
        .options('/api/login')
        .set('Origin', ORIGIN)
        .set('Access-Control-Request-Method', 'POST');
      expect(rd.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('users and tokens', () => {
    it('creates, lists, updates and deletes users; never exposes password hashes', async () => {
      const created = await send('post', '/users')
        .send({ username: 'Jane.Doe', password: PASSWORD, email: 'jane@example.test' })
        .expect(201);
      const jane = created.body as Record<string, unknown>;
      expect(jane).toMatchObject({
        username: 'jane.doe',
        role: 'USER',
        status: 'ACTIVE',
        email: 'jane@example.test',
        displayName: null,
      });
      expect(JSON.stringify(jane)).not.toMatch(/password|argon2/i);

      await send('post', '/users').send({ username: 'jane.doe', password: PASSWORD }).expect(409);

      const list = await get('/users?search=jane&sort=username:asc').expect(200);
      expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 50 });
      expect(JSON.stringify(list.body)).not.toMatch(/argon2|passwordHash/);

      const patched = await send('patch', `/users/${jane.id as string}`)
        .send({ displayName: 'Jane', status: 'DISABLED' })
        .expect(200);
      expect(patched.body).toMatchObject({ displayName: 'Jane', status: 'DISABLED' });

      await send('delete', `/users/${jane.id as string}`).expect(204);
      await get(`/users/${jane.id as string}`).expect(404);
      await get('/users/not-a-uuid').expect(404);
    });

    it('validates input with 422 and field details', async () => {
      const res = await send('post', '/users')
        .send({ username: 'x', password: 'short', unknown: true })
        .expect(422);
      const body = res.body as ErrorBody;
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.details?.map((d) => d.field).sort()).toEqual([
        'password',
        'unknown',
        'username',
      ]);
      await get('/users?sort=password:asc').expect(422);
      await get('/users?role=GOD').expect(422);
    });

    it('refuses to let administrators delete, demote or disable themselves', async () => {
      const self = await send('patch', `/users/${adminId}`).send({ role: 'USER' }).expect(409);
      expect((self.body as ErrorBody).error.code).toBe('SELF_MODIFICATION');
      await send('patch', `/users/${adminId}`).send({ status: 'DISABLED' }).expect(409);
      await send('delete', `/users/${adminId}`).expect(409);
      // Harmless self edits are fine.
      await send('patch', `/users/${adminId}`).send({ displayName: 'Root' }).expect(200);
    });

    it('never lets the last active administrator be removed', async () => {
      // Service level: removing the only active admin is refused whoever asks.
      const outsider = await createUser(t, 'outsider');
      await expect(
        t.users.update(outsider.id, adminId, { role: UserRole.USER }),
      ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
      await expect(t.users.delete(outsider.id, adminId)).rejects.toMatchObject({
        code: 'LAST_ADMIN',
      });

      // Two admins demoting each other at the same time: exactly one demotion wins.
      const second = (
        await send('post', '/users')
          .send({ username: 'admin2', password: PASSWORD, role: 'ADMIN' })
          .expect(201)
      ).body as { id: string };
      const secondCookie = await adminLogin(t, 'admin2');
      const [a, b] = await Promise.all([
        send('patch', `/users/${second.id}`).send({ role: 'USER' }),
        request(t.http)
          .patch(`/api/admin/users/${adminId}`)
          .set('Cookie', secondCookie)
          .set('Origin', ORIGIN)
          .send({ role: 'USER' }),
      ]);
      expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
      expect([a.status, b.status].find((s) => s !== 200)).toEqual(expect.any(Number));
      expect(
        await t.prisma.user.count({ where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE } }),
      ).toBe(1);
    });

    it('lists and revokes tokens; a revoked client token is rejected', async () => {
      const user = (
        await send('post', '/users').send({ username: 'kim', password: PASSWORD }).expect(201)
      ).body as { id: string };
      const clientToken = await rustdeskLogin(t, 'kim');
      const tokens = await get(`/users/${user.id}/tokens`).expect(200);
      const page = tokens.body as {
        total: number;
        data: Array<{ id: string; kind: string; clientId: string; active: boolean }>;
      };
      expect(page.total).toBe(1);
      expect(page.data[0]).toMatchObject({
        kind: 'RUSTDESK_CLIENT',
        clientId: '123456789',
        active: true,
      });

      await send('delete', `/tokens/${page.data[0]!.id}`).expect(204);
      await send('delete', `/tokens/${page.data[0]!.id}`).expect(204);
      await send('delete', '/tokens/00000000-0000-4000-8000-000000000000').expect(404);
      await request(t.http)
        .post('/api/currentUser')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(401);
    });

    it('password reset revokes every token of the user', async () => {
      const user = (
        await send('post', '/users').send({ username: 'lee', password: PASSWORD }).expect(201)
      ).body as { id: string };
      const clientToken = await rustdeskLogin(t, 'lee');
      await send('post', `/users/${user.id}/password`)
        .send({ password: 'a brand new password' })
        .expect(204);
      await request(t.http)
        .post('/api/currentUser')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(401);
      await rustdeskLogin(t, 'lee', 'a brand new password');
    });

    it('enforces pagination limits', async () => {
      const res = await get('/users?pageSize=201').expect(422);
      expect((res.body as ErrorBody).error.details?.[0]?.field).toBe('pageSize');
      await get('/users?page=0').expect(422);
      const ok = await get('/users?pageSize=200&page=3').expect(200);
      expect(ok.body).toMatchObject({ data: [], page: 3, pageSize: 200, total: 1 });
    });
  });

  describe('address books', () => {
    it('manages shared books, shares, peers and tags without returning credentials', async () => {
      const user = (
        await send('post', '/users').send({ username: 'member', password: PASSWORD }).expect(201)
      ).body as { id: string };
      const book = (
        await send('post', '/address-books').send({ name: 'Support', note: 'team' }).expect(201)
      ).body as { guid: string; kind: string };
      expect(book.kind).toBe(AddressBookKind.SHARED);

      const shares = await send('put', `/address-books/${book.guid}/shares`)
        .send([{ userId: user.id, rule: 2 }])
        .expect(200);
      expect(shares.body).toEqual([{ userId: user.id, username: 'member', rule: 2 }]);
      await send('put', `/address-books/${book.guid}/shares`)
        .send([{ userId: user.id, rule: 9 }])
        .expect(422);

      const peer = await send('post', `/address-books/${book.guid}/peers`)
        .send({ peerId: '987654321', alias: 'Kiosk', tags: ['lobby'], password: 'shared-secret' })
        .expect(201);
      expect(peer.body).toMatchObject({
        peerId: '987654321',
        alias: 'Kiosk',
        tags: ['lobby'],
        hasPassword: true,
        hasHash: false,
      });
      expect(JSON.stringify(peer.body)).not.toContain('shared-secret');

      // The member's RustDesk client sees the password; the admin API never does.
      const token = await rustdeskLogin(t, 'member');
      const clientView = await request(t.http)
        .post(`/api/ab/peers?current=1&pageSize=100&ab=${book.guid}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect((clientView.body as { data: Array<{ password: string }> }).data[0]?.password).toBe(
        'shared-secret',
      );
      const adminView = await get(`/address-books/${book.guid}/peers?tag=lobby`).expect(200);
      expect(JSON.stringify(adminView.body)).not.toContain('shared-secret');
      expect(adminView.body).toMatchObject({ total: 1 });

      const tags = await get(`/address-books/${book.guid}/tags`).expect(200);
      expect(tags.body).toEqual([{ name: 'lobby', color: 0xff9e9e9e, peerCount: 1 }]);
      const renamed = await send('patch', `/address-books/${book.guid}/tags/lobby`)
        .send({ name: 'front', color: 255 })
        .expect(200);
      expect(renamed.body).toEqual({ name: 'front', color: 255, peerCount: 1 });
      await send('post', `/address-books/${book.guid}/tags`)
        .send({ name: 'front', color: 1 })
        .expect(409);

      await send('patch', `/address-books/${book.guid}/peers/987654321`)
        .send({ password: '' })
        .expect(200);
      expect((await get(`/address-books/${book.guid}/peers`).expect(200)).body).toMatchObject({
        data: [{ hasPassword: false, tags: ['front'] }],
      });

      await send('delete', `/address-books/${book.guid}/tags/front`).expect(204);
      await send('delete', `/address-books/${book.guid}/peers/987654321`).expect(204);
      await send('delete', `/address-books/${book.guid}/peers/987654321`).expect(404);
      await send('delete', `/address-books/${book.guid}`).expect(204);
      await get(`/address-books/${book.guid}`).expect(404);
    });

    it('never returns personal-book hashes and refuses passwords and deletion there', async () => {
      await createUser(t, 'owner');
      const token = await rustdeskLogin(t, 'owner');
      const { guid } = (
        await request(t.http)
          .post('/api/ab/personal')
          .set('Authorization', `Bearer ${token}`)
          .expect(200)
      ).body as { guid: string };
      await request(t.http)
        .post(`/api/ab/peer/add/${guid}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ id: '42', hash: 'very-secret-hash' })
        .expect(200);

      const peers = await get(`/address-books/${guid}/peers`).expect(200);
      expect(peers.body).toMatchObject({ data: [{ peerId: '42', hasHash: true }] });
      expect(JSON.stringify(peers.body)).not.toContain('very-secret-hash');

      await send('post', `/address-books/${guid}/peers`)
        .send({ peerId: '43', password: 'x' })
        .expect(422);
      await send('delete', `/address-books/${guid}`).expect(409);
      const list = await get('/address-books?kind=PERSONAL').expect(200);
      expect(list.body).toMatchObject({
        total: 1,
        data: [{ guid, ownerUsername: 'owner', peerCount: 1 }],
      });
    });
  });

  describe('sessions, devices, audit and stats', () => {
    async function seedSessions(): Promise<void> {
      const at = (iso: string) => new Date(iso);
      const base = { deviceUuid: 'uuid-a', deviceId: '987654321' };
      await t.prisma.device.create({
        data: {
          uuid: 'uuid-a',
          rustdeskId: '987654321',
          hostname: 'desk-a',
          lastHeartbeatAt: new Date(),
        },
      });
      await t.prisma.device.create({
        data: {
          uuid: 'uuid-b',
          rustdeskId: '555555555',
          hostname: 'desk-b',
          lastHeartbeatAt: at('2026-01-01T00:00:00Z'),
        },
      });
      await t.prisma.session.createMany({
        data: [
          {
            ...base,
            connId: 1,
            initiatorId: '111',
            initiatorName: 'Alice',
            authenticated: true,
            status: SessionStatus.CLOSED,
            startedAt: at('2026-09-01T10:00:00Z'),
            closedAt: at('2026-09-01T10:10:00Z'),
            durationSeconds: 600,
          },
          {
            ...base,
            connId: 2,
            initiatorId: '111',
            initiatorName: 'Alice',
            authenticated: true,
            status: SessionStatus.CLOSED,
            startedAt: at('2026-09-01T11:30:00Z'),
            closedAt: at('2026-09-01T11:35:00Z'),
            durationSeconds: 300,
          },
          {
            ...base,
            connId: 3,
            initiatorId: '222',
            initiatorName: 'Bob',
            authenticated: true,
            status: SessionStatus.TIMEOUT,
            startedAt: at('2026-09-02T09:00:00Z'),
            closedAt: at('2026-09-02T11:00:00Z'),
            durationSeconds: 7200,
            durationEstimated: true,
          },
          {
            deviceUuid: 'uuid-b',
            deviceId: '555555555',
            connId: 4,
            authenticated: false,
            status: SessionStatus.CLOSED,
            startedAt: at('2026-09-02T12:00:00Z'),
            closedAt: at('2026-09-02T12:00:05Z'),
            durationSeconds: 5,
          },
          {
            ...base,
            connId: 5,
            initiatorId: '222',
            initiatorName: 'Bob',
            authenticated: true,
            status: SessionStatus.ACTIVE,
            startedAt: at('2026-09-02T23:00:00Z'),
          },
          // Outside the range.
          {
            ...base,
            connId: 6,
            initiatorId: '333',
            authenticated: true,
            status: SessionStatus.CLOSED,
            startedAt: at('2026-09-03T00:00:00Z'),
            closedAt: at('2026-09-03T00:01:00Z'),
            durationSeconds: 60,
          },
        ],
      });
    }
    const RANGE = 'from=2026-09-01T00:00:00Z&to=2026-09-03T00:00:00Z';

    it('computes stats against a known dataset', async () => {
      await seedSessions();
      const summary = await get(`/stats/summary?${RANGE}`).expect(200);
      expect(summary.body).toEqual({
        totalSessions: 5,
        totalDurationSeconds: 8105,
        avgDurationSeconds: 2026, // 8105 / 4 known durations = 2026.25
        timedOutSessions: 1,
        activeSessions: 1,
        unauthenticatedSessions: 1,
      });

      const daily = await get(`/stats/timeseries?${RANGE}&bucket=day`).expect(200);
      expect(daily.body).toEqual([
        { bucketStart: '2026-09-01T00:00:00.000Z', sessions: 2, durationSeconds: 900 },
        { bucketStart: '2026-09-02T00:00:00.000Z', sessions: 3, durationSeconds: 7205 },
      ]);
      const hourly = (
        await get(
          `/stats/timeseries?from=2026-09-01T10:00:00Z&to=2026-09-01T13:00:00Z&bucket=hour`,
        ).expect(200)
      ).body as Array<{ sessions: number }>;
      expect(hourly.map((p) => p.sessions)).toEqual([1, 1, 0]);

      const top = await get(`/stats/top?${RANGE}&by=initiator&limit=10`).expect(200);
      expect(top.body).toEqual([
        { id: '222', name: 'Bob', sessions: 2, durationSeconds: 7200 },
        { id: '111', name: 'Alice', sessions: 2, durationSeconds: 900 },
      ]);
      const targets = await get(`/stats/top?${RANGE}&by=target&limit=1`).expect(200);
      expect(targets.body).toEqual([
        { id: '987654321', name: 'desk-a', sessions: 4, durationSeconds: 8100 },
      ]);

      await get('/stats/summary?from=2026-09-01T00:00:00Z').expect(422);
      await get('/stats/summary?from=2026-09-01&to=2026-09-02').expect(422);
      const range = await get(
        '/stats/summary?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z',
      ).expect(422);
      expect((range.body as ErrorBody).error.code).toBe('RANGE_TOO_LARGE');
    });

    it('filters sessions and lists active ones', async () => {
      await seedSessions();
      const filtered = await get(
        `/sessions?${RANGE}&initiatorId=111&sort=durationSeconds:desc`,
      ).expect(200);
      expect(
        (filtered.body as { data: Array<{ connId: number }> }).data.map((s) => s.connId),
      ).toEqual([1, 2]);
      const long = await get('/sessions?minDurationSeconds=600&authenticated=true').expect(200);
      expect((long.body as { total: number }).total).toBe(2);
      const active = await get('/sessions/active').expect(200);
      expect(active.body).toMatchObject({
        total: 1,
        data: [{ connId: 5, status: 'ACTIVE', durationSeconds: null }],
      });
      await get('/sessions?status=NOPE').expect(422);
    });

    it('lists devices with the online filter', async () => {
      await seedSessions();
      const online = await get('/devices?online=true').expect(200);
      expect(online.body).toMatchObject({
        total: 1,
        data: [{ rustdeskId: '987654321', online: true }],
      });
      const offline = await get('/devices?online=false&search=desk').expect(200);
      expect(offline.body).toMatchObject({
        total: 1,
        data: [{ rustdeskId: '555555555', online: false }],
      });
      const detail = await get('/devices/uuid-a').expect(200);
      expect(detail.body).toMatchObject({ uuid: 'uuid-a', idChanges: [], sysinfo: null });
      await get('/devices/missing').expect(404);
    });

    it('lists raw audit events and serves system info', async () => {
      await request(t.http)
        .post('/api/audit/conn')
        .send({
          action: 'new',
          id: '987654321',
          uuid: 'uuid-a',
          conn_id: 9,
          session_id: 0,
          nonce: 'abc',
        })
        .expect(200);
      const events = await get('/audit-events?kind=conn&deviceId=987654321').expect(200);
      expect(events.body).toMatchObject({
        total: 1,
        data: [{ kind: 'conn', action: 'new', nonce: 'abc', payload: { conn_id: 9 } }],
      });
      const session = await get(
        `/sessions/${(events.body as { data: Array<{ sessionId: string }> }).data[0]!.sessionId}`,
      ).expect(200);
      expect((session.body as { events: unknown[] }).events).toHaveLength(1);

      const info = await get('/system/info').expect(200);
      expect(info.body).toEqual({
        version: expect.any(String),
        sessionTimeoutMinutes: 120,
        heartbeatGraceSeconds: 30,
        deviceOnlineThresholdSeconds: 45,
        disconnectTtlSeconds: 120,
      });
    });
  });

  it('serves health probes without auth', async () => {
    await request(t.http).get('/api/health/live').expect(200);
    const ready = await request(t.http).get('/api/health/ready').expect(200);
    expect(ready.body).toMatchObject({ status: 'ok', info: { database: { status: 'up' } } });
  });

  it('echoes or generates X-Request-Id', async () => {
    const echoed = await request(t.http).get('/api/health/live').set('X-Request-Id', 'req-123');
    expect(echoed.headers['x-request-id']).toBe('req-123');
    const generated = await request(t.http).get('/api/health/live');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
