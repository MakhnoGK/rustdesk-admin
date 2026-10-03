import { Injectable, Logger } from '@nestjs/common';
import { DomainError, ErrorCode } from '../common/errors/domain-error';
import { PrismaService, type PrismaTx } from '../prisma/prisma.service';
import { DEFAULT_TAG_COLOR, type TagRecord } from './address-books.types';

/**
 * Tags of one address book. Peers reference tags through `ab_peer_tags`, so renaming or
 * deleting a tag propagates to every peer without rewriting peer rows.
 */
@Injectable()
export class AbTagsService {
  private readonly logger = new Logger(AbTagsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(guid: string, opts: { withCounts?: boolean } = {}): Promise<TagRecord[]> {
    const tags = await this.prisma.abTag.findMany({
      where: { bookGuid: guid },
      orderBy: { name: 'asc' },
      include: opts.withCounts ? { _count: { select: { peers: true } } } : undefined,
    });
    return tags.map((t) => ({
      name: t.name,
      color: Number(t.color),
      ...(opts.withCounts
        ? { peerCount: (t as typeof t & { _count: { peers: number } })._count.peers }
        : {}),
    }));
  }

  /**
   * Adds a tag. RustDesk clients re-send tags they believe are missing, so `onExisting: 'ignore'`
   * makes the call idempotent; the admin API uses `'conflict'`.
   */
  async add(
    guid: string,
    name: string,
    color: number,
    onExisting: 'ignore' | 'conflict',
  ): Promise<void> {
    const result = await this.prisma.abTag.createMany({
      data: [{ bookGuid: guid, name, color: BigInt(color) }],
      skipDuplicates: true,
    });
    if (result.count === 0 && onExisting === 'conflict') {
      throw DomainError.conflict(ErrorCode.ALREADY_EXISTS, `Tag "${name}" already exists`);
    }
    if (result.count > 0) this.logger.log({ guid, tag: name }, 'Tag added');
  }

  async rename(guid: string, from: string, to: string): Promise<void> {
    if (from === to) return;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.abTag.findUnique({
        where: { bookGuid_name: { bookGuid: guid, name: from } },
      });
      if (!existing) throw DomainError.notFound(`Tag "${from}"`);
      const clash = await tx.abTag.findUnique({
        where: { bookGuid_name: { bookGuid: guid, name: to } },
      });
      if (clash) throw DomainError.conflict(ErrorCode.ALREADY_EXISTS, `Tag "${to}" already exists`);
      await tx.abTag.update({ where: { id: existing.id }, data: { name: to } });
    });
    this.logger.log({ guid, from, to }, 'Tag renamed');
  }

  async setColor(guid: string, name: string, color: number): Promise<void> {
    const { count } = await this.prisma.abTag.updateMany({
      where: { bookGuid: guid, name },
      data: { color: BigInt(color) },
    });
    if (count === 0) throw DomainError.notFound(`Tag "${name}"`);
    this.logger.log({ guid, tag: name }, 'Tag color updated');
  }

  /** Deletes tags by name (missing names are ignored); peers lose them through the cascade. */
  async delete(guid: string, names: string[]): Promise<number> {
    if (names.length === 0) return 0;
    const { count } = await this.prisma.abTag.deleteMany({
      where: { bookGuid: guid, name: { in: names } },
    });
    this.logger.log({ guid, requested: names.length, deleted: count }, 'Tags deleted');
    return count;
  }

  /** Ensures the named tags exist (creating unknown ones with the default color) and returns their ids. */
  async ensureTagIds(tx: PrismaTx, guid: string, names: string[]): Promise<string[]> {
    const unique = [...new Set(names)];
    if (unique.length === 0) return [];
    await tx.abTag.createMany({
      data: unique.map((name) => ({ bookGuid: guid, name, color: BigInt(DEFAULT_TAG_COLOR) })),
      skipDuplicates: true,
    });
    const tags = await tx.abTag.findMany({
      where: { bookGuid: guid, name: { in: unique } },
      select: { id: true },
    });
    return tags.map((t) => t.id);
  }
}
