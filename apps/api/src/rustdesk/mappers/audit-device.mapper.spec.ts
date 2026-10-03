import { AuditKind } from '../../generated/prisma/enums';
import { decodeAuditRecord } from './audit.mapper';
import {
  decodeHeartbeat,
  decodeSysinfo,
  encodeHeartbeatResponse,
  redactSecrets,
} from './device.mapper';

describe('audit record decoding', () => {
  const base = { id: '987654321', uuid: 'dXVpZA==', conn_id: 3, session_id: 0, nonce: 'n' };

  it('recognises new, peer and close records', () => {
    expect(
      decodeAuditRecord(AuditKind.CONN, { ...base, action: 'new', ip: '1.2.3.4' }).conn,
    ).toMatchObject({ action: 'new', initiatorIp: '1.2.3.4' });
    expect(
      decodeAuditRecord(AuditKind.CONN, { ...base, peer: ['111', 'Alice'], type: 2 }).conn,
    ).toMatchObject({
      action: 'peer',
      initiatorId: '111',
      initiatorName: 'Alice',
      connType: 2,
    });
    expect(decodeAuditRecord(AuditKind.CONN, { ...base, action: 'close' }).conn?.action).toBe(
      'close',
    );
    expect(decodeAuditRecord(AuditKind.CONN, { ...base, action: 'weird' }).conn?.action).toBeNull();
  });

  it('flags records missing id, uuid or conn_id and keeps the raw payload', () => {
    const r = decodeAuditRecord(AuditKind.CONN, { action: 'new', extra: 1 });
    expect(r.malformedReason).toBe('Missing or invalid field(s): id, uuid, conn_id');
    expect(r.payload).toEqual({ action: 'new', extra: 1 });
    expect(decodeAuditRecord(AuditKind.FILE, 'nope').malformedReason).toBe(
      'Body must be a JSON object',
    );
  });

  it('keeps 64-bit session ids as decimal text', () => {
    expect(
      decodeAuditRecord(AuditKind.CONN, { ...base, session_id: '18446744073709551615' })
        .rustdeskSessionId,
    ).toBe('18446744073709551615');
    expect(decodeAuditRecord(AuditKind.CONN, { ...base, session_id: 42 }).rustdeskSessionId).toBe(
      '42',
    );
  });
});

describe('heartbeat and sysinfo', () => {
  it('decodes conns leniently and encodes only the keys the client acts on', () => {
    expect(
      decodeHeartbeat({ uuid: 'u', id: '1', ver: 1004002, conns: [1, 2, 2, 'x', 1.5] }),
    ).toEqual({ uuid: 'u', rustdeskId: '1', ver: 1004002n, conns: [1, 2] });
    expect(decodeHeartbeat({ uuid: 'u' }).conns).toEqual([]);
    expect(encodeHeartbeatResponse({ disconnect: [], sysinfoMissing: false })).toEqual({});
    expect(encodeHeartbeatResponse({ disconnect: [4], sysinfoMissing: true })).toEqual({
      disconnect: [4],
      sysinfo: 1,
    });
  });

  it('redacts credential-like sysinfo keys at any depth', () => {
    expect(
      redactSecrets({
        'preset-address-book-password': 'x',
        nested: { api_token: 't', ok: 1 },
        list: [{ secret: 's' }],
      }),
    ).toEqual({
      'preset-address-book-password': '[redacted]',
      nested: { api_token: '[redacted]', ok: 1 },
      list: [{ secret: '[redacted]' }],
    });
    expect(decodeSysinfo({ id: '1', uuid: 'u', hostname: 'h', cpu: 'x' })).toMatchObject({
      hostname: 'h',
      sysinfo: { cpu: 'x' },
    });
  });
});
