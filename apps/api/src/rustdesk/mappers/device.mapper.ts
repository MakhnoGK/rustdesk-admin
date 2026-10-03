// Decodes /api/heartbeat and /api/sysinfo bodies and encodes the heartbeat response.
// Verified against rustdesk master e5bc204, src/hbbs_http/sync.rs (start_hbbs_sync_async).

import type { Prisma } from '../../generated/prisma/client';
import { isObject, type JsonObject, readBigInt, readString } from './wire';

export interface DecodedHeartbeat {
  uuid: string | null;
  rustdeskId: string | null;
  ver: bigint | null;
  /** Conn IDs alive on the device; the client omits the key when there are none. */
  conns: number[];
}

export function decodeHeartbeat(body: unknown): DecodedHeartbeat {
  const obj: JsonObject = isObject(body) ? body : {};
  const conns = Array.isArray(obj.conns)
    ? obj.conns.filter(
        (c): c is number =>
          typeof c === 'number' && Number.isInteger(c) && Math.abs(c) <= 2_147_483_647,
      )
    : [];
  return {
    uuid: readString(obj, 'uuid', 128),
    rustdeskId: readString(obj, 'id', 64),
    ver: readBigInt(obj, 'ver'),
    conns: [...new Set(conns)],
  };
}

/**
 * Heartbeat response. The client acts on `disconnect` (closes those conn IDs) and `sysinfo`
 * (re-uploads system info). `strategy` and `modified_at` belong to RustDesk Pro strategies and
 * are never sent.
 */
export function encodeHeartbeatResponse(input: {
  disconnect: number[];
  sysinfoMissing: boolean;
}): Record<string, unknown> {
  const response: Record<string, unknown> = {};
  if (input.disconnect.length > 0) response.disconnect = input.disconnect;
  if (input.sysinfoMissing) response.sysinfo = 1;
  return response;
}

export interface DecodedSysinfo {
  uuid: string | null;
  rustdeskId: string | null;
  hostname: string | null;
  username: string | null;
  os: string | null;
  version: string | null;
  /** The document to store, with credential-like values redacted. */
  sysinfo: Prisma.InputJsonObject;
}

const SECRET_KEY = /pass(word)?|secret|token/i;

/** Replaces values of credential-like keys (e.g. `preset-address-book-password`) recursively. */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SECRET_KEY.test(k) ? '[redacted]' : redactSecrets(v, depth + 1),
      ]),
    );
  }
  return value;
}

export function decodeSysinfo(body: unknown): DecodedSysinfo {
  const obj: JsonObject = isObject(body) ? body : {};
  return {
    uuid: readString(obj, 'uuid', 128),
    rustdeskId: readString(obj, 'id', 64),
    hostname: readString(obj, 'hostname', 255),
    username: readString(obj, 'username', 255),
    os: readString(obj, 'os', 255),
    version: readString(obj, 'version', 64),
    sysinfo: redactSecrets(obj) as Prisma.InputJsonObject,
  };
}
