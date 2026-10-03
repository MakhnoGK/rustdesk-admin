// Decodes /api/audit/{conn,file,alarm} bodies into domain audit records.
// Verified against rustdesk master e5bc204, src/server/connection.rs (post_conn_audit,
// post_file_audit, post_alarm_audit).

import type { AuditRecordInput } from '../../audit/audit-ingest.service';
import { AuditKind, type Prisma } from '../../generated/prisma/client';
import type { ConnAction } from '../../sessions/session-state';
import { isObject, type JsonObject, readInt, readInt64Text, readString } from './wire';

const NONCE_MAX = 128;

/** `{"action":"new"}`, `{"action":"close"}`, or a record with `peer` and no action → `peer`. */
function connAction(body: JsonObject): ConnAction | null {
  if (body.action === 'new' || body.action === 'close') return body.action;
  if (body.action === undefined && Array.isArray(body.peer)) return 'peer';
  return null;
}

export function decodeAuditRecord(kind: AuditKind, body: unknown): AuditRecordInput {
  if (!isObject(body)) {
    return {
      kind,
      deviceId: null,
      deviceUuid: null,
      connId: null,
      rustdeskSessionId: null,
      nonce: null,
      malformedReason: 'Body must be a JSON object',
      conn: null,
      // Kept for forensics; wrapped because the column holds a JSON document.
      payload: { body: (body ?? null) as Prisma.InputJsonValue | null },
    };
  }

  const deviceId = readString(body, 'id', 64);
  const deviceUuid = readString(body, 'uuid', 128);
  const connId = readInt(body, 'conn_id');
  const missing = [
    deviceId ? null : 'id',
    deviceUuid ? null : 'uuid',
    connId === null ? 'conn_id' : null,
  ].filter((f): f is string => f !== null);

  let conn: AuditRecordInput['conn'] = null;
  if (kind === AuditKind.CONN) {
    const peer = Array.isArray(body.peer) ? (body.peer as unknown[]) : [];
    conn = {
      action: connAction(body),
      initiatorIp: readString(body, 'ip', 64),
      initiatorId: typeof peer[0] === 'string' && peer[0] ? peer[0].slice(0, 64) : null,
      initiatorName: typeof peer[1] === 'string' && peer[1] ? peer[1].slice(0, 256) : null,
      connType: readInt(body, 'type'),
    };
  }

  return {
    kind,
    deviceId,
    deviceUuid,
    connId,
    rustdeskSessionId: readInt64Text(body, 'session_id'),
    nonce: readString(body, 'nonce', NONCE_MAX),
    malformedReason:
      missing.length > 0 ? `Missing or invalid field(s): ${missing.join(', ')}` : null,
    conn,
    payload: body as Prisma.InputJsonObject,
  };
}
