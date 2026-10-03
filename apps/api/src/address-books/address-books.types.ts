import type { AddressBook, Prisma } from '../generated/prisma/client';

/** Share rule of a book for a user: 1 read-only, 2 read/write, 3 full control. */
export const AbRule = { READ: 1, READ_WRITE: 2, FULL: 3 } as const;
export type AbRule = (typeof AbRule)[keyof typeof AbRule];

export function isAbRule(value: number): value is AbRule {
  return value === 1 || value === 2 || value === 3;
}

export interface BookAccess {
  book: AddressBook;
  rule: AbRule;
}

/** Default color for tags created implicitly (a peer referencing an unknown tag): opaque grey. */
export const DEFAULT_TAG_COLOR = 0xff9e9e9e;
export const MAX_TAG_COLOR = 0xffffffff;

/** Peer fields as the domain sees them; `undefined` means "leave unchanged". */
export interface PeerFields {
  alias?: string;
  note?: string;
  username?: string;
  hostname?: string;
  platform?: string;
  tags?: string[];
  /** Plaintext saved-password hash (personal books). '' or null clears it. */
  hash?: string | null;
  /** Plaintext shared password (shared books). '' or null clears it. */
  password?: string | null;
  /** Other client fields, merged key by key into the stored JSON. */
  extra?: Record<string, Prisma.InputJsonValue>;
}

export interface PeerRecord {
  rowId: string;
  peerId: string;
  alias: string;
  note: string;
  username: string;
  hostname: string;
  platform: string;
  tags: string[];
  extra: Record<string, unknown>;
  hasHash: boolean;
  hasPassword: boolean;
  /** Decrypted credentials; only populated when explicitly requested (RustDesk clients). */
  secrets?: { hash: string; password: string };
  createdAt: Date;
  updatedAt: Date;
}

export interface TagRecord {
  name: string;
  color: number;
  peerCount?: number;
}

export interface PeerListQuery {
  page: number;
  pageSize: number;
  search?: string;
  tag?: string;
}
