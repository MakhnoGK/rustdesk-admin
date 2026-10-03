import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { SessionCloseReason, SessionStatus, UserRole } from '../src/generated/prisma/client';
import { SessionReconciliationService } from '../src/sessions/session-reconciliation.service';
import {
  adminLogin,
  createTestApp,
  createUser,
  devicePost,
  ORIGIN,
  resetDatabase,
  type TestApp,
} from './utils/test-app';

const DEVICE = { id: '987654321', uuid: 'aGVhcnRiZWF0LXV1aWQ=' };
const hb = (conns?: number[]) => ({
  ...DEVICE,
  ver: 1004002,
  modified_at: 0,
  ...(conns ? { conns } : {}),
});
const conn = (connId: number, record: Record<string, unknown>) => ({
  ...DEVICE,
  conn_id: connId,
  session_id: 0,
  nonce: randomUUID(),
  ...record,
});

describe('Heartbeat, device registry and remote disconnect', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ HEARTBEAT_GRACE_SECONDS: 30 });
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  const age = (seconds: number) =>
    t.prisma.session.updateMany({ data: { startedAt: new Date(Date.now() - seconds * 1000) } });

  it('registers the device and asks for sysinfo until it is uploaded', async () => {
    const first = await devicePost(t, '/api/heartbeat', hb()).expect(200);
    expect(first.body).toEqual({ sysinfo: 1 });
    const device = await t.prisma.device.findUniqueOrThrow({ where: { uuid: DEVICE.uuid } });
    expect(device).toMatchObject({ rustdeskId: DEVICE.id, heartbeatVersion: 1004002n });
    expect(device.lastHeartbeatAt).not.toBeNull();

    const sysinfo = await devicePost(t, '/api/sysinfo', {
      ...DEVICE,
      version: '1.4.2',
      hostname: 'desk-01',
      username: 'jane',
      os: 'Windows 11',
      'preset-address-book-password': 'secret',
    }).expect(200);
    expect(sysinfo.text).toBe('SYSINFO_UPDATED');
    expect(sysinfo.headers['content-type']).toMatch(/^text\/plain/);

    const after = await devicePost(t, '/api/heartbeat', hb()).expect(200);
    expect(after.body).toEqual({});
    expect(after.body).not.toHaveProperty('strategy');

    const stored = await t.prisma.device.findUniqueOrThrow({ where: { uuid: DEVICE.uuid } });
    expect(stored).toMatchObject({
      hostname: 'desk-01',
      username: 'jane',
      os: 'Windows 11',
      version: '1.4.2',
    });
    expect((stored.sysinfo as Record<string, unknown>)['preset-address-book-password']).toBe(
      '[redacted]',
    );
  });

  it('answers ID_NOT_FOUND for sysinfo without id/uuid and a stable sysinfo_ver token', async () => {
    const res = await devicePost(t, '/api/sysinfo', { hostname: 'x' }).expect(200);
    expect(res.text).toBe('ID_NOT_FOUND');
    const v1 = await request(t.http).post('/api/sysinfo_ver').expect(200);
    const v2 = await request(t.http).post('/api/sysinfo_ver').send('').expect(200);
    expect(v1.text).toMatch(/^[0-9a-f-]{36}$/);
    expect(v2.text).toBe(v1.text);
  });

  it('records RustDesk ID changes for the same uuid', async () => {
    await devicePost(t, '/api/heartbeat', hb()).expect(200);
    await devicePost(t, '/api/heartbeat', { ...hb(), id: '111111111' }).expect(200);
    const device = await t.prisma.device.findUniqueOrThrow({
      where: { uuid: DEVICE.uuid },
      include: { idChanges: true },
    });
    expect(device.rustdeskId).toBe('111111111');
    expect(device.idChanges.map((c) => [c.oldRustdeskId, c.newRustdeskId])).toEqual([
      [DEVICE.id, '111111111'],
    ]);
  });

  it('updates lastSeenAt for conns present in the heartbeat', async () => {
    await devicePost(t, '/api/audit/conn', conn(1, { action: 'new' })).expect(200);
    await age(300);
    await devicePost(t, '/api/heartbeat', hb([1])).expect(200);
    const s = await t.prisma.session.findFirstOrThrow();
    expect(s.status).toBe(SessionStatus.ACTIVE);
    expect(s.lastSeenAt).not.toBeNull();
  });

  it('does not reconcile a session inside the grace period', async () => {
    await devicePost(t, '/api/audit/conn', conn(2, { action: 'new' })).expect(200);
    await devicePost(t, '/api/heartbeat', hb()).expect(200);
    expect((await t.prisma.session.findFirstOrThrow()).status).toBe(SessionStatus.ACTIVE);
  });

  it('closes sessions missing from conns after the grace period; a later close only logs', async () => {
    await devicePost(t, '/api/audit/conn', conn(3, { action: 'new' })).expect(200);
    await devicePost(t, '/api/audit/conn', conn(4, { action: 'new' })).expect(200);
    await age(60);
    await devicePost(t, '/api/heartbeat', hb([4])).expect(200);

    const s3 = await t.prisma.session.findFirstOrThrow({ where: { connId: 3 } });
    const s4 = await t.prisma.session.findFirstOrThrow({ where: { connId: 4 } });
    expect(s3).toMatchObject({
      status: SessionStatus.CLOSED,
      closeReason: SessionCloseReason.HEARTBEAT_RECONCILED,
      durationEstimated: true,
    });
    expect(s3.durationSeconds).toBeGreaterThanOrEqual(60);
    expect(s4.status).toBe(SessionStatus.ACTIVE);

    await devicePost(t, '/api/audit/conn', conn(3, { action: 'close' })).expect(200);
    const after = await t.prisma.session.findUniqueOrThrow({ where: { id: s3.id } });
    expect(after.closeReason).toBe(SessionCloseReason.HEARTBEAT_RECONCILED);
    expect(after.closedAt).toEqual(s3.closedAt);
    expect(await t.prisma.session.count()).toBe(2);
    expect(await t.prisma.auditEvent.count({ where: { sessionId: s3.id } })).toBe(2);
  });

  it('delivers an admin disconnect exactly once and closes the session as ADMIN_DISCONNECT', async () => {
    await createUser(t, 'root', { role: UserRole.ADMIN });
    const cookie = await adminLogin(t, 'root');
    await devicePost(t, '/api/audit/conn', conn(7, { action: 'new' })).expect(200);
    const session = await t.prisma.session.findFirstOrThrow();

    const created = await request(t.http)
      .post(`/api/admin/sessions/${session.id}/disconnect`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(201);
    expect(created.body).toMatchObject({
      state: 'REQUESTED',
      connId: 7,
      sessionId: session.id,
      deliveredAt: null,
    });

    const first = await devicePost(t, '/api/heartbeat', hb([7])).expect(200);
    expect(first.body).toMatchObject({ disconnect: [7] });
    const second = await devicePost(t, '/api/heartbeat', hb([7])).expect(200);
    expect(second.body).not.toHaveProperty('disconnect');

    const state = await request(t.http)
      .get(`/api/admin/sessions/${session.id}/disconnect`)
      .set('Cookie', cookie)
      .expect(200);
    expect(state.body).toMatchObject({ state: 'DELIVERED', deliveredAt: expect.any(String) });

    await devicePost(t, '/api/audit/conn', conn(7, { action: 'close' })).expect(200);
    const closed = await t.prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(closed).toMatchObject({
      status: SessionStatus.CLOSED,
      closeReason: SessionCloseReason.ADMIN_DISCONNECT,
    });

    await request(t.http)
      .post(`/api/admin/sessions/${session.id}/disconnect`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(409);
  });

  it('does not deliver expired disconnect requests', async () => {
    await createUser(t, 'root', { role: UserRole.ADMIN });
    const cookie = await adminLogin(t, 'root');
    await devicePost(t, '/api/audit/conn', conn(8, { action: 'new' })).expect(200);
    const session = await t.prisma.session.findFirstOrThrow();
    await request(t.http)
      .post(`/api/admin/sessions/${session.id}/disconnect`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(201);
    await t.prisma.pendingDisconnect.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await devicePost(t, '/api/heartbeat', hb([8])).expect(200);
    expect(res.body).not.toHaveProperty('disconnect');
    const state = await request(t.http)
      .get(`/api/admin/sessions/${session.id}/disconnect`)
      .set('Cookie', cookie)
      .expect(200);
    expect((state.body as { state: string }).state).toBe('EXPIRED');

    // A new request is allowed after expiry; the history keeps both, newest first.
    await request(t.http)
      .post(`/api/admin/sessions/${session.id}/disconnect`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(201);
    const history = await request(t.http)
      .get(`/api/admin/sessions/${session.id}/disconnects`)
      .set('Cookie', cookie)
      .expect(200);
    expect(history.body).toMatchObject([
      { state: 'REQUESTED', requestedBy: { username: 'root' } },
      { state: 'EXPIRED' },
    ]);
  });

  it('lists an empty disconnect history and 404s for an unknown session', async () => {
    await createUser(t, 'root', { role: UserRole.ADMIN });
    const cookie = await adminLogin(t, 'root');
    await devicePost(t, '/api/audit/conn', conn(9, { action: 'new' })).expect(200);
    const session = await t.prisma.session.findFirstOrThrow();
    const empty = await request(t.http)
      .get(`/api/admin/sessions/${session.id}/disconnects`)
      .set('Cookie', cookie)
      .expect(200);
    expect(empty.body).toEqual([]);
    await request(t.http)
      .get(`/api/admin/sessions/${randomUUID()}/disconnects`)
      .set('Cookie', cookie)
      .expect(404);
  });

  it('returns the target hostname and the connection type name with sessions', async () => {
    await createUser(t, 'root', { role: UserRole.ADMIN });
    const cookie = await adminLogin(t, 'root');
    await devicePost(t, '/api/heartbeat', hb()).expect(200);
    await devicePost(t, '/api/sysinfo', { ...DEVICE, hostname: 'desk-01' }).expect(200);
    await devicePost(t, '/api/audit/conn', conn(4, { action: 'new' })).expect(200);
    await devicePost(t, '/api/audit/conn', conn(4, { peer: ['111', 'Ann'], type: 1 })).expect(200);
    await devicePost(t, '/api/audit/conn', conn(5, { peer: ['222', 'Ben'], type: 42 })).expect(200);

    const active = await request(t.http)
      .get('/api/admin/sessions/active')
      .set('Cookie', cookie)
      .expect(200);
    const byConn = Object.fromEntries(
      (active.body as { data: Array<{ connId: number }> }).data.map((s) => [s.connId, s]),
    );
    expect(byConn[4]).toMatchObject({
      deviceHostname: 'desk-01',
      connType: 1,
      connTypeName: 'FILE_TRANSFER',
    });
    expect(byConn[5]).toMatchObject({ connType: 42, connTypeName: null });

    // Sessions of a device that never sent sysinfo have no hostname.
    await devicePost(t, '/api/audit/conn', {
      ...conn(1, { action: 'new' }),
      id: '555',
      uuid: 'b3RoZXItdXVpZA==',
    }).expect(200);
    const other = await request(t.http)
      .get('/api/admin/sessions?deviceId=555')
      .set('Cookie', cookie)
      .expect(200);
    expect(other.body).toMatchObject({ data: [{ deviceHostname: null, connTypeName: null }] });
  });

  it('rejects a heartbeat without uuid', async () => {
    const res = await devicePost(t, '/api/heartbeat', { id: '1' }).expect(400);
    expect(res.body).toEqual({ error: 'Missing or invalid field: uuid' });
  });
});

describe('Session timeout sweep', () => {
  let t: TestApp;
  let sweeper: SessionReconciliationService;

  beforeAll(async () => {
    t = await createTestApp({ SESSION_TIMEOUT_MINUTES: 120 });
    sweeper = t.app.get(SessionReconciliationService);
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('times out sessions without liveness and spares those seen in heartbeats', async () => {
    const hours = (h: number) => new Date(Date.now() - h * 3_600_000);
    const base = { deviceUuid: 'dev', deviceId: '1', status: SessionStatus.ACTIVE };
    const stale = await t.prisma.session.create({
      data: { ...base, connId: 1, startedAt: hours(3) },
    });
    const staleSeen = await t.prisma.session.create({
      data: { ...base, connId: 2, startedAt: hours(5), lastSeenAt: hours(2.5) },
    });
    const longButAlive = await t.prisma.session.create({
      data: { ...base, connId: 3, startedAt: hours(10), lastSeenAt: new Date() },
    });
    const young = await t.prisma.session.create({
      data: { ...base, connId: 4, startedAt: hours(1) },
    });

    expect(await sweeper.sweepTimeouts()).toBe(2);

    const a = await t.prisma.session.findUniqueOrThrow({ where: { id: stale.id } });
    expect(a).toMatchObject({
      status: SessionStatus.TIMEOUT,
      closeReason: SessionCloseReason.TIMEOUT,
      durationEstimated: true,
      durationSeconds: 7200,
    });
    expect(a.closedAt?.getTime()).toBe(stale.startedAt.getTime() + 7_200_000);

    const b = await t.prisma.session.findUniqueOrThrow({ where: { id: staleSeen.id } });
    expect(b.status).toBe(SessionStatus.TIMEOUT);
    expect(b.closedAt).toEqual(staleSeen.lastSeenAt);
    expect(b.durationSeconds).toBe(9000);

    expect(
      (await t.prisma.session.findUniqueOrThrow({ where: { id: longButAlive.id } })).status,
    ).toBe(SessionStatus.ACTIVE);
    expect((await t.prisma.session.findUniqueOrThrow({ where: { id: young.id } })).status).toBe(
      SessionStatus.ACTIVE,
    );
  });

  it('concurrent sweeps never process a session twice', async () => {
    const old = new Date(Date.now() - 5 * 3_600_000);
    await t.prisma.session.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        deviceUuid: 'dev',
        deviceId: '1',
        connId: i,
        status: SessionStatus.ACTIVE,
        startedAt: old,
      })),
    });
    const results = await Promise.all([
      sweeper.sweepTimeouts(),
      sweeper.sweepTimeouts(),
      sweeper.sweepTimeouts(),
    ]);
    const processed = results.reduce<number>((sum, r) => sum + (r ?? 0), 0);
    expect(processed).toBe(50);
    expect(await t.prisma.session.count({ where: { status: SessionStatus.TIMEOUT } })).toBe(50);
  });
});
