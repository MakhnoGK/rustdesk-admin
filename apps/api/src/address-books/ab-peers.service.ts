import { Injectable, Logger } from '@nestjs/common';
import { DomainError, ErrorCode } from '../common/errors/domain-error';
import { skipTake } from '../common/pagination/pagination';
import { type AbPeer, Prisma } from '../generated/prisma/client';
import { PrismaService, type PrismaTx } from '../prisma/prisma.service';
import { AbTagsService } from './ab-tags.service';
import { type PeerFields, type PeerListQuery, type PeerRecord } from './address-books.types';
import { AddressBooksService } from './address-books.service';
import { CredentialCipherService } from './credential-cipher.service';

const peerInclude = { tags: { include: { tag: { select: { name: true } } } } } as const;
type PeerRow = AbPeer & { tags: Array<{ tag: { name: string } }> };

export interface ReplaceBookInput {
  peers: Array<{ peerId: string; fields: PeerFields }>;
  tags: Array<{ name: string; color: number }>;
}

/** Peers of one address book; credentials are encrypted at rest. */
@Injectable()
export class AbPeersService {
  private readonly logger = new Logger(AbPeersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly books: AddressBooksService,
    private readonly tags: AbTagsService,
    private readonly cipher: CredentialCipherService,
  ) {}

  async list(
    guid: string,
    query: PeerListQuery,
    opts: { withSecrets: boolean },
  ): Promise<{ total: number; data: PeerRecord[] }> {
    const where: Prisma.AbPeerWhereInput = {
      bookGuid: guid,
      ...(query.tag ? { tags: { some: { tag: { name: query.tag } } } } : {}),
      ...(query.search
        ? {
            OR: (['peerId', 'alias', 'hostname', 'username', 'note'] as const).map((f) => ({
              [f]: { contains: query.search, mode: 'insensitive' as const },
            })),
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.abPeer.findMany({
        where,
        include: peerInclude,
        orderBy: [{ peerId: 'asc' }],
        ...skipTake(query),
      }),
      this.prisma.abPeer.count({ where }),
    ]);
    return { total, data: rows.map((r) => this.toRecord(r, opts.withSecrets)) };
  }

  /** Every peer of a book (legacy address book API); bounded by AB_MAX_PEERS when set. */
  async listAll(guid: string, opts: { withSecrets: boolean }): Promise<PeerRecord[]> {
    const rows = await this.prisma.abPeer.findMany({
      where: { bookGuid: guid },
      include: peerInclude,
      orderBy: [{ peerId: 'asc' }],
    });
    return rows.map((r) => this.toRecord(r, opts.withSecrets));
  }

  async get(guid: string, peerId: string, opts: { withSecrets: boolean }): Promise<PeerRecord> {
    const row = await this.prisma.abPeer.findUnique({
      where: { bookGuid_peerId: { bookGuid: guid, peerId } },
      include: peerInclude,
    });
    if (!row) throw DomainError.notFound(`Peer ${peerId}`);
    return this.toRecord(row, opts.withSecrets);
  }

  async add(guid: string, peerId: string, fields: PeerFields): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockBook(tx, guid);
      await this.assertCapacity(tx, guid, 1);
      const exists = await tx.abPeer.findUnique({
        where: { bookGuid_peerId: { bookGuid: guid, peerId } },
        select: { id: true },
      });
      if (exists)
        throw DomainError.conflict(
          ErrorCode.ALREADY_EXISTS,
          `Peer ${peerId} is already in this address book`,
        );
      const peer = await tx.abPeer.create({
        data: { bookGuid: guid, peerId, ...this.columns(fields), extra: fields.extra ?? {} },
      });
      if (fields.tags) await this.setTags(tx, guid, peer.id, fields.tags);
    });
    this.logger.log({ guid, peerId }, 'Address book peer added');
  }

  async update(guid: string, peerId: string, fields: PeerFields): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const peer = await tx.abPeer.findUnique({
        where: { bookGuid_peerId: { bookGuid: guid, peerId } },
      });
      if (!peer) throw DomainError.notFound(`Peer ${peerId}`);
      const extra =
        fields.extra && Object.keys(fields.extra).length > 0
          ? { ...(peer.extra as Prisma.JsonObject), ...fields.extra }
          : undefined;
      await tx.abPeer.update({ where: { id: peer.id }, data: { ...this.columns(fields), extra } });
      if (fields.tags) await this.setTags(tx, guid, peer.id, fields.tags);
    });
    this.logger.log({ guid, peerId, fields: Object.keys(fields) }, 'Address book peer updated');
  }

  async delete(guid: string, peerIds: string[]): Promise<number> {
    if (peerIds.length === 0) return 0;
    const { count } = await this.prisma.abPeer.deleteMany({
      where: { bookGuid: guid, peerId: { in: peerIds } },
    });
    this.logger.log(
      { guid, requested: peerIds.length, deleted: count },
      'Address book peers deleted',
    );
    return count;
  }

  /** Replaces every peer and tag of a book in one transaction (legacy `POST /api/ab`). */
  async replaceAll(guid: string, input: ReplaceBookInput): Promise<void> {
    const max = this.books.maxPeersPerBook;
    if (max > 0 && input.peers.length > max) {
      throw DomainError.forbidden(
        ErrorCode.AB_PEER_LIMIT,
        `An address book may hold at most ${max} peers`,
      );
    }
    await this.prisma.$transaction(
      async (tx) => {
        await this.lockBook(tx, guid);
        await tx.abPeer.deleteMany({ where: { bookGuid: guid } });
        await tx.abTag.deleteMany({ where: { bookGuid: guid } });
        if (input.tags.length > 0) {
          await tx.abTag.createMany({
            data: input.tags.map((t) => ({ bookGuid: guid, name: t.name, color: BigInt(t.color) })),
            skipDuplicates: true,
          });
        }
        for (const { peerId, fields } of input.peers) {
          const peer = await tx.abPeer.create({
            data: { bookGuid: guid, peerId, ...this.columns(fields), extra: fields.extra ?? {} },
          });
          if (fields.tags && fields.tags.length > 0)
            await this.setTags(tx, guid, peer.id, fields.tags);
        }
      },
      { timeout: 30_000 },
    );
    this.logger.log(
      { guid, peers: input.peers.length, tags: input.tags.length },
      'Address book replaced (legacy API)',
    );
  }

  /** Re-encrypts every stored credential that is not under the current key. Returns rows changed. */
  async reencryptAll(batchSize = 500): Promise<number> {
    let changed = 0;
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.abPeer.findMany({
        where: { OR: [{ hashEnc: { not: null } }, { passwordEnc: { not: null } }] },
        select: { id: true, hashEnc: true, passwordEnc: true },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (rows.length === 0) return changed;
      for (const row of rows) {
        const stale = [row.hashEnc, row.passwordEnc].some(
          (v) => v && this.cipher.keyIdOf(v) !== this.cipher.currentKeyId,
        );
        if (!stale) continue;
        await this.prisma.abPeer.update({
          where: { id: row.id },
          data: {
            hashEnc: row.hashEnc ? this.cipher.encrypt(this.cipher.decrypt(row.hashEnc)) : null,
            passwordEnc: row.passwordEnc
              ? this.cipher.encrypt(this.cipher.decrypt(row.passwordEnc))
              : null,
          },
        });
        changed += 1;
      }
      cursor = rows[rows.length - 1]?.id;
    }
  }

  private columns(fields: PeerFields) {
    return {
      alias: fields.alias,
      note: fields.note,
      username: fields.username,
      hostname: fields.hostname,
      platform: fields.platform,
      hashEnc: this.cipher.seal(fields.hash),
      passwordEnc: this.cipher.seal(fields.password),
    };
  }

  private async setTags(
    tx: PrismaTx,
    guid: string,
    peerRowId: string,
    names: string[],
  ): Promise<void> {
    const tagIds = await this.tags.ensureTagIds(tx, guid, names);
    await tx.abPeerTag.deleteMany({ where: { peerId: peerRowId } });
    if (tagIds.length > 0) {
      await tx.abPeerTag.createMany({
        data: tagIds.map((tagId) => ({ peerId: peerRowId, tagId })),
        skipDuplicates: true,
      });
    }
  }

  /** Serialises writers of one book so the peer limit cannot be overrun by concurrent adds. */
  private async lockBook(tx: PrismaTx, guid: string): Promise<void> {
    const rows = await tx.$queryRaw<
      { guid: string }[]
    >`SELECT guid FROM address_books WHERE guid = ${guid}::uuid FOR UPDATE`;
    if (rows.length === 0) throw DomainError.notFound('Address book');
  }

  private async assertCapacity(tx: PrismaTx, guid: string, adding: number): Promise<void> {
    const max = this.books.maxPeersPerBook;
    if (max === 0) return;
    const count = await tx.abPeer.count({ where: { bookGuid: guid } });
    if (count + adding > max) {
      throw DomainError.forbidden(
        ErrorCode.AB_PEER_LIMIT,
        `An address book may hold at most ${max} peers`,
      );
    }
  }

  private toRecord(row: PeerRow, withSecrets: boolean): PeerRecord {
    return {
      rowId: row.id,
      peerId: row.peerId,
      alias: row.alias,
      note: row.note,
      username: row.username,
      hostname: row.hostname,
      platform: row.platform,
      tags: row.tags.map((t) => t.tag.name).sort(),
      extra: (row.extra ?? {}) as Record<string, unknown>,
      hasHash: row.hashEnc !== null,
      hasPassword: row.passwordEnc !== null,
      ...(withSecrets
        ? {
            secrets: {
              hash: this.cipher.open(row.hashEnc),
              password: this.cipher.open(row.passwordEnc),
            },
          }
        : {}),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
