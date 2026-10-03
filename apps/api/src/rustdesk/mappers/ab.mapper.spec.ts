import { ValidationFailedError } from '../../common/errors/domain-error';
import type { PeerRecord } from '../../address-books/address-books.types';
import { AddressBookKind } from '../../generated/prisma/enums';
import {
  decodeAbPeer,
  decodeLegacyBook,
  decodeStringArray,
  decodeTagColor,
  encodeAbPeer,
  encodeLegacyBook,
} from './ab.mapper';

const record = (overrides: Partial<PeerRecord> = {}): PeerRecord => ({
  rowId: 'r',
  peerId: '987654321',
  alias: 'Desk',
  note: '',
  username: 'u',
  hostname: 'h',
  platform: 'Linux',
  tags: ['a'],
  extra: { forceAlwaysRelay: 'true', rdpPort: '3389', id: 'must-not-win' },
  hasHash: true,
  hasPassword: false,
  secrets: { hash: 'H', password: 'P' },
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('AbPeer wire mapping', () => {
  it('keeps unknown client fields in extra and the right credential per book kind', () => {
    const body = {
      id: '987654321',
      alias: 'Desk',
      tags: ['a', 'a', 'b'],
      hash: 'H',
      password: 'P',
      forceAlwaysRelay: 'false',
      same_server: true,
    };
    expect(decodeAbPeer(body, { kind: AddressBookKind.PERSONAL })).toEqual({
      peerId: '987654321',
      fields: {
        alias: 'Desk',
        tags: ['a', 'b'],
        hash: 'H',
        extra: { forceAlwaysRelay: 'false', same_server: true },
      },
    });
    expect(decodeAbPeer(body, { kind: AddressBookKind.SHARED }).fields).toMatchObject({
      password: 'P',
    });
    expect(decodeAbPeer(body, { kind: AddressBookKind.SHARED }).fields).not.toHaveProperty('hash');
  });

  it('rejects bad shapes with field details', () => {
    expect(() => decodeAbPeer({ alias: 'x' }, { kind: AddressBookKind.PERSONAL })).toThrow(
      ValidationFailedError,
    );
    expect(() => decodeAbPeer({ id: '1', tags: 'a' }, { kind: AddressBookKind.PERSONAL })).toThrow(
      ValidationFailedError,
    );
    expect(() => decodeAbPeer({ id: '1', alias: 5 }, { kind: AddressBookKind.PERSONAL })).toThrow(
      ValidationFailedError,
    );
    expect(() => decodeAbPeer([], { kind: AddressBookKind.PERSONAL })).toThrow(
      ValidationFailedError,
    );
  });

  it('encodes core fields over stored extras and only the book-kind credential', () => {
    const personal = encodeAbPeer(record(), AddressBookKind.PERSONAL);
    expect(personal).toMatchObject({
      id: '987654321',
      hash: 'H',
      forceAlwaysRelay: 'true',
      rdpPort: '3389',
    });
    expect(personal).not.toHaveProperty('password');
    const shared = encodeAbPeer(record(), AddressBookKind.SHARED);
    expect(shared).toMatchObject({ password: 'P' });
    expect(shared).not.toHaveProperty('hash');
  });

  it('normalises signed ARGB colors', () => {
    expect(decodeTagColor(-1)).toBe(0xffffffff);
    expect(decodeTagColor(4283215696)).toBe(4283215696);
    expect(() => decodeTagColor(2 ** 32)).toThrow(ValidationFailedError);
    expect(() => decodeTagColor(1.5)).toThrow(ValidationFailedError);
  });

  it('decodes JSON arrays of strings for deletes', () => {
    expect(decodeStringArray(['1', '2', '1'], 'ids')).toEqual(['1', '2']);
    expect(() => decodeStringArray({}, 'ids')).toThrow(ValidationFailedError);
    expect(() => decodeStringArray([1], 'ids')).toThrow(ValidationFailedError);
  });
});

describe('legacy address book', () => {
  it('round-trips through the double-encoded format', () => {
    const encoded = encodeLegacyBook([record()], [{ name: 'a', color: 7 }]);
    const inner = JSON.parse(encoded.data) as {
      tags: string[];
      tag_colors: string;
      peers: unknown[];
    };
    expect(inner.tags).toEqual(['a']);
    expect(JSON.parse(inner.tag_colors)).toEqual({ a: 7 });

    const decoded = decodeLegacyBook(encoded);
    expect(decoded.tags).toEqual([{ name: 'a', color: 7 }]);
    expect(decoded.peers).toHaveLength(1);
    expect(decoded.peers[0]?.fields).toMatchObject({ hash: 'H', tags: ['a'] });
  });

  it('defaults missing colors and drops duplicate peers', () => {
    const decoded = decodeLegacyBook({
      data: JSON.stringify({ tags: ['x'], peers: [{ id: '1' }, { id: '1' }] }),
    });
    expect(decoded.tags[0]?.color).toBe(0xff9e9e9e);
    expect(decoded.peers).toHaveLength(1);
  });

  it('reports the failing peer with its index', () => {
    try {
      decodeLegacyBook({ data: JSON.stringify({ peers: [{ id: '1' }, { alias: 'no id' }] }) });
      fail('expected an error');
    } catch (e) {
      expect((e as ValidationFailedError).details[0]?.field).toBe('data.peers[1].id');
    }
  });
});
