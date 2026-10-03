import { randomUUID } from 'node:crypto';
import { AuditKind, SessionCloseReason, SessionStatus } from '../src/generated/prisma/client';
import { createTestApp, devicePost, resetDatabase, type TestApp } from './utils/test-app';

const DEVICE = { id: '987654321', uuid: 'dGFyZ2V0LXV1aWQ=' };

function conn(
  connId: number,
  record: Record<string, unknown>,
  nonce: string | null = randomUUID(),
) {
  return { ...DEVICE, conn_id: connId, session_id: 0, ...(nonce ? { nonce } : {}), ...record };
}

describe('Connection audit ingestion and the session projection', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  const post = (body: unknown, path = '/api/audit/conn') => devicePost(t, path, body);
  const sessions = () => t.prisma.session.findMany({ orderBy: { createdAt: 'asc' } });

  it('new → peer → close produces one CLOSED session with its duration', async () => {
    const res = await post(conn(1, { action: 'new', ip: '203.0.113.7' })).expect(200);
    expect(res.text).toBe('');
    // Pretend the connection started 95 s ago.
    await t.prisma.session.updateMany({ data: { startedAt: new Date(Date.now() - 95_000) } });

    await post(
      conn(1, { peer: ['111222333', 'Alice'], type: 0, session_id: '18446744073709551615' }),
    ).expect(200);
    await post(conn(1, { action: 'close' })).expect(200);

    const [s] = await sessions();
    expect(s).toMatchObject({
      status: SessionStatus.CLOSED,
      closeReason: SessionCloseReason.CLIENT_CLOSE,
      deviceId: DEVICE.id,
      deviceUuid: DEVICE.uuid,
      connId: 1,
      initiatorId: '111222333',
      initiatorName: 'Alice',
      initiatorIp: '203.0.113.7',
      connType: 0,
      authenticated: true,
      rustdeskSessionId: '18446744073709551615',
      durationEstimated: false,
    });
    expect(s?.durationSeconds).toBeGreaterThanOrEqual(95);
    expect(s?.durationSeconds).toBeLessThan(100);
    expect(await t.prisma.auditEvent.count({ where: { sessionId: s?.id } })).toBe(3);
  });

  it('keeps 64-bit session ids exact when sent as JSON numbers', async () => {
    await devicePost(t, '/api/audit/conn', undefined)
      .set('Content-Type', 'text/plain')
      .send(
        `{"action":"new","id":"${DEVICE.id}","uuid":"${DEVICE.uuid}","conn_id":7,"session_id":18446744073709551615,"nonce":"${randomUUID()}"}`,
      )
      .expect(200);
    const [s] = await sessions();
    expect(s?.rustdeskSessionId).toBe('18446744073709551615');
  });

  it('a retried record (same nonce) is a no-op', async () => {
    const record = conn(2, { action: 'new', ip: '198.51.100.1' }, 'fixed-nonce');
    await post(record).expect(200);
    await post(record).expect(200);
    await Promise.all([post(record).expect(200), post(record).expect(200)]);
    expect(await t.prisma.auditEvent.count()).toBe(1);
    expect(await t.prisma.session.count()).toBe(1);
  });

  it('a duplicate close (different nonce) leaves the closed session unchanged', async () => {
    await post(conn(3, { action: 'new' })).expect(200);
    await post(conn(3, { action: 'close' })).expect(200);
    const [before] = await sessions();
    await post(conn(3, { action: 'close' })).expect(200);
    const all = await sessions();
    expect(all).toHaveLength(1);
    expect(all[0]?.closedAt).toEqual(before?.closedAt);
    expect(await t.prisma.auditEvent.count({ where: { sessionId: before?.id } })).toBe(3);
  });

  it('close without new records an UNKNOWN session with no duration', async () => {
    await post(conn(4, { action: 'close' })).expect(200);
    const [s] = await sessions();
    expect(s).toMatchObject({ status: SessionStatus.UNKNOWN, durationSeconds: null, connId: 4 });
    expect(s?.closedAt).not.toBeNull();
  });

  it('peer without new opens an ACTIVE authenticated session', async () => {
    await post(conn(5, { peer: ['555', 'Bob'], type: 2 })).expect(200);
    const [s] = await sessions();
    expect(s).toMatchObject({
      status: SessionStatus.ACTIVE,
      authenticated: true,
      initiatorId: '555',
      initiatorName: 'Bob',
      connType: 2,
    });
  });

  it('a new for an active (uuid, conn_id) supersedes the old session (client restart)', async () => {
    await post(conn(6, { action: 'new' })).expect(200);
    await post(conn(6, { action: 'new' })).expect(200);
    const [old, current] = await sessions();
    expect(old).toMatchObject({
      status: SessionStatus.UNKNOWN,
      closeReason: SessionCloseReason.SUPERSEDED,
      durationEstimated: true,
    });
    expect(current).toMatchObject({ status: SessionStatus.ACTIVE });
    // The close belongs to the new session.
    await post(conn(6, { action: 'close' })).expect(200);
    expect((await t.prisma.session.findUniqueOrThrow({ where: { id: current!.id } })).status).toBe(
      SessionStatus.CLOSED,
    );
  });

  it('stores malformed records with the MALFORMED flag and answers 400', async () => {
    const res = await post({ action: 'new', nonce: randomUUID() }).expect(400);
    expect(res.body).toEqual({ error: 'Missing or invalid field(s): id, uuid, conn_id' });
    const event = await t.prisma.auditEvent.findFirstOrThrow();
    expect(event).toMatchObject({ malformed: true, kind: AuditKind.CONN });
    expect(await t.prisma.session.count()).toBe(0);
  });

  it('keeps unknown fields in the raw payload', async () => {
    await post(conn(8, { action: 'new', conn_audit_ref: 'ref-1', future_field: { a: 1 } })).expect(
      200,
    );
    const event = await t.prisma.auditEvent.findFirstOrThrow();
    expect(event.payload).toMatchObject({ conn_audit_ref: 'ref-1', future_field: { a: 1 } });
  });

  it('deduplicates nonce-less records within the window', async () => {
    const record = conn(9, { action: 'new', ip: '192.0.2.1' }, null);
    await post(record).expect(200);
    await post(record).expect(200);
    expect(await t.prisma.auditEvent.count()).toBe(1);
    await post(conn(9, { action: 'close' }, null)).expect(200);
    expect(await t.prisma.auditEvent.count()).toBe(2);
  });

  it('links file and alarm records to the session of their connection', async () => {
    await post(conn(10, { action: 'new' })).expect(200);
    const [s] = await sessions();
    await post(
      {
        ...DEVICE,
        peer_id: '111',
        conn_id: 10,
        type: 0,
        path: '/tmp',
        is_file: true,
        info: '{"files":[]}',
        nonce: randomUUID(),
      },
      '/api/audit/file',
    ).expect(200);
    await post(
      { ...DEVICE, typ: 1, info: '{}', conn_id: 10, nonce: randomUUID() },
      '/api/audit/alarm',
    ).expect(200);
    await post(
      { ...DEVICE, typ: 1, info: '{}', conn_id: 99, nonce: randomUUID() },
      '/api/audit/alarm',
    ).expect(200);

    const events = await t.prisma.auditEvent.findMany({
      where: { kind: { in: [AuditKind.FILE, AuditKind.ALARM] } },
      orderBy: { receivedAt: 'asc' },
    });
    expect(events.map((e) => [e.kind, e.sessionId])).toEqual([
      [AuditKind.FILE, s?.id],
      [AuditKind.ALARM, s?.id],
      [AuditKind.ALARM, null],
    ]);
  });

  it('accepts the empty-body edge case as a malformed record', async () => {
    await devicePost(t, '/api/audit/conn', undefined)
      .set('Content-Length', '0')
      .send('')
      .expect(400);
  });
});

describe('Device endpoint allowlist', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ DEVICE_ALLOWED_CIDRS: ['10.0.0.0/8'] });
  });
  afterAll(async () => {
    await t.close();
  });

  it('rejects device posts from outside DEVICE_ALLOWED_CIDRS', async () => {
    const res = await devicePost(t, '/api/heartbeat', { ...DEVICE, ver: 1 }).expect(403);
    expect(res.body).toEqual({ error: 'Source address not allowed' });
    await devicePost(t, '/api/audit/conn', conn(1, { action: 'new' })).expect(403);
  });
});
