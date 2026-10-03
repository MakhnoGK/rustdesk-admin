// Address-book wire format ↔ domain. Verified against rustdesk master e5bc204:
// flutter/lib/models/ab_model.dart, flutter/lib/models/peer_model.dart (Peer.fromJson/toJson),
// flutter/lib/common/hbbs/hbbs.dart (AbProfile, AbTag).

import { type ErrorDetail, ValidationFailedError } from '../../common/errors/domain-error';
import {
  DEFAULT_TAG_COLOR,
  type PeerFields,
  type PeerRecord,
  type TagRecord,
} from '../../address-books/address-books.types';
import { AddressBookKind, type Prisma } from '../../generated/prisma/client';
import { isObject, type JsonObject } from './wire';

const CORE_FIELDS = new Set([
  'id',
  'alias',
  'tags',
  'note',
  'username',
  'hostname',
  'platform',
  'hash',
  'password',
]);
const STRING_LIMITS: Record<'alias' | 'note' | 'username' | 'hostname' | 'platform', number> = {
  alias: 255,
  note: 2000,
  username: 255,
  hostname: 255,
  platform: 64,
};
const CREDENTIAL_MAX = 1024;
const PEER_ID_MAX = 64;
const TAG_NAME_MAX = 100;
const MAX_TAGS_PER_PEER = 100;
const MAX_EXTRA_KEYS = 32;
const MAX_EXTRA_BYTES = 8 * 1024;
export const MAX_IDS_PER_DELETE = 1000;

function fail(field: string, message: string): never {
  throw new ValidationFailedError([{ field, message }]);
}

function decodeTagNames(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) fail(field, 'must be an array of strings');
  if (value.length > MAX_TAGS_PER_PEER)
    fail(field, `must contain at most ${MAX_TAGS_PER_PEER} tags`);
  return [
    ...new Set(
      value.map((t, i) => {
        if (typeof t !== 'string' || t.length === 0 || t.length > TAG_NAME_MAX)
          fail(`${field}[${i}]`, `must be a string of 1-${TAG_NAME_MAX} characters`);
        return t;
      }),
    ),
  ];
}

/**
 * Decodes one AbPeer. Personal books keep `hash` (the client's saved-password hash); shared books
 * keep `password`. Unknown fields (forceAlwaysRelay, rdpPort, ...) are kept verbatim in `extra`.
 */
export function decodeAbPeer(
  body: unknown,
  opts: { kind: AddressBookKind },
): { peerId: string; fields: PeerFields } {
  if (!isObject(body)) fail('body', 'must be a JSON object');
  const id = body.id;
  if (typeof id !== 'string' || id.length === 0 || id.length > PEER_ID_MAX)
    fail('id', `must be a string of 1-${PEER_ID_MAX} characters`);

  const fields: PeerFields = {};
  for (const [key, max] of Object.entries(STRING_LIMITS) as Array<
    [keyof typeof STRING_LIMITS, number]
  >) {
    const v = body[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || v.length > max)
      fail(key, `must be a string of at most ${max} characters`);
    fields[key] = v;
  }
  if (body.tags !== undefined && body.tags !== null)
    fields.tags = decodeTagNames(body.tags, 'tags');

  const credentialKey = opts.kind === AddressBookKind.PERSONAL ? 'hash' : 'password';
  const credential = body[credentialKey];
  if (credential !== undefined && credential !== null) {
    if (typeof credential !== 'string' || credential.length > CREDENTIAL_MAX)
      fail(credentialKey, `must be a string of at most ${CREDENTIAL_MAX} characters`);
    fields[credentialKey] = credential;
  }

  const extra = Object.fromEntries(
    Object.entries(body).filter(([k]) => !CORE_FIELDS.has(k)),
  ) as Record<string, Prisma.InputJsonValue>;
  if (
    Object.keys(extra).length > MAX_EXTRA_KEYS ||
    JSON.stringify(extra).length > MAX_EXTRA_BYTES
  ) {
    fail('body', 'too many or too large additional fields');
  }
  if (Object.keys(extra).length > 0) fields.extra = extra;
  return { peerId: id, fields };
}

/** Encodes a peer for the client; core fields always win over stored extras. */
export function encodeAbPeer(peer: PeerRecord, kind: AddressBookKind): JsonObject {
  const secrets = peer.secrets ?? { hash: '', password: '' };
  return {
    ...peer.extra,
    id: peer.peerId,
    alias: peer.alias,
    tags: peer.tags,
    note: peer.note,
    username: peer.username,
    hostname: peer.hostname,
    platform: peer.platform,
    ...(kind === AddressBookKind.PERSONAL
      ? { hash: secrets.hash }
      : { password: secrets.password }),
  };
}

/** Tag colors are 32-bit ARGB; a signed value is reinterpreted as unsigned. */
export function decodeTagColor(value: unknown, field = 'color'): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < -0x80000000 ||
    value > 0xffffffff
  ) {
    fail(field, 'must be a 32-bit ARGB integer');
  }
  return value >>> 0;
}

export function decodeTagName(value: unknown, field = 'name'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > TAG_NAME_MAX)
    fail(field, `must be a string of 1-${TAG_NAME_MAX} characters`);
  return value;
}

export function encodeTag(tag: TagRecord): { name: string; color: number } {
  return { name: tag.name, color: tag.color };
}

/** `DELETE /api/ab/peer/<guid>` and `DELETE /api/ab/tag/<guid>` bodies: a bare JSON array of strings. */
export function decodeStringArray(body: unknown, what: string): string[] {
  if (!Array.isArray(body)) fail('body', `must be a JSON array of ${what}`);
  if (body.length > MAX_IDS_PER_DELETE)
    fail('body', `must contain at most ${MAX_IDS_PER_DELETE} items`);
  const errors: ErrorDetail[] = [];
  body.forEach((v, i) => {
    if (typeof v !== 'string' || v.length === 0 || v.length > TAG_NAME_MAX)
      errors.push({ field: `[${i}]`, message: 'must be a non-empty string' });
  });
  if (errors.length > 0) throw new ValidationFailedError(errors);
  return [...new Set(body as string[])];
}

// ---- Legacy address book (GET/POST /api/ab) ---------------------------------------------

export interface LegacyBook {
  peers: Array<{ peerId: string; fields: PeerFields }>;
  tags: Array<{ name: string; color: number }>;
}

/** `{"data": "<JSON string of {tags, peers, tag_colors}>"}`; tag_colors is itself a JSON string. */
export function encodeLegacyBook(peers: PeerRecord[], tags: TagRecord[]): { data: string } {
  const tagColors = Object.fromEntries(tags.map((t) => [t.name, t.color]));
  return {
    data: JSON.stringify({
      tags: tags.map((t) => t.name),
      peers: peers.map((p) => encodeAbPeer(p, AddressBookKind.PERSONAL)),
      tag_colors: JSON.stringify(tagColors),
    }),
  };
}

export function decodeLegacyBook(body: unknown): LegacyBook {
  if (!isObject(body) || typeof body.data !== 'string') fail('data', 'must be a JSON string');
  let book: unknown;
  try {
    book = JSON.parse(body.data);
  } catch {
    fail('data', 'must contain valid JSON');
  }
  if (!isObject(book)) fail('data', 'must encode a JSON object');

  const names =
    book.tags === undefined || book.tags === null ? [] : decodeTagNames(book.tags, 'data.tags');
  let colors: JsonObject = {};
  if (typeof book.tag_colors === 'string' && book.tag_colors.length > 0) {
    try {
      const parsed: unknown = JSON.parse(book.tag_colors);
      if (isObject(parsed)) colors = parsed;
    } catch {
      fail('data.tag_colors', 'must contain valid JSON');
    }
  } else if (isObject(book.tag_colors)) {
    colors = book.tag_colors;
  }

  const rawPeers = book.peers === undefined || book.peers === null ? [] : book.peers;
  if (!Array.isArray(rawPeers)) fail('data.peers', 'must be an array');
  const seen = new Set<string>();
  const peers = rawPeers
    .map((p, i) => {
      try {
        return decodeAbPeer(p, { kind: AddressBookKind.PERSONAL });
      } catch (e) {
        if (e instanceof ValidationFailedError) {
          throw new ValidationFailedError(
            e.details.map((d) => ({ field: `data.peers[${i}].${d.field}`, message: d.message })),
          );
        }
        throw e;
      }
    })
    .filter((p) => (seen.has(p.peerId) ? false : (seen.add(p.peerId), true)));

  const tags = names.map((name) => ({
    name,
    color:
      typeof colors[name] === 'number'
        ? decodeTagColor(colors[name], `data.tag_colors.${name}`)
        : DEFAULT_TAG_COLOR,
  }));
  return { peers, tags };
}
