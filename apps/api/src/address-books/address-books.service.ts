import { Injectable, Logger } from '@nestjs/common';
import { DomainError, ErrorCode } from '../common/errors/domain-error';
import { type Page, type SortSpec, skipTake, toPage } from '../common/pagination/pagination';
import { AppConfig } from '../config/app-config.service';
import { type AddressBook, AddressBookKind, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AbRule, type BookAccess } from './address-books.types';

export const PERSONAL_BOOK_NAME = 'My address book';

export const BOOK_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;
export type BookSortField = (typeof BOOK_SORT_FIELDS)[number];

export interface BookSummary {
  book: AddressBook;
  ownerUsername: string | null;
  peerCount: number;
  shareCount: number;
}

export interface BookListQuery {
  kind?: AddressBookKind;
  ownerId?: string;
  search?: string;
  page: number;
  pageSize: number;
  sort: SortSpec<BookSortField>;
}

export interface ShareInput {
  userId: string;
  rule: AbRule;
}

export interface ShareRecord {
  userId: string;
  username: string;
  rule: AbRule;
}

/** Address books, access rules and shares. Shared by the RustDesk and admin controllers. */
@Injectable()
export class AddressBooksService {
  private readonly logger = new Logger(AddressBooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** `max_peer_one_ab`: 0 means unlimited. */
  get maxPeersPerBook(): number {
    return this.config.get('AB_MAX_PEERS');
  }

  /** Returns the user's personal book, creating it on first use (race-safe via the partial unique index). */
  async getOrCreatePersonal(userId: string): Promise<AddressBook> {
    const existing = await this.prisma.addressBook.findFirst({
      where: { ownerId: userId, kind: AddressBookKind.PERSONAL },
    });
    if (existing) return existing;
    try {
      const book = await this.prisma.addressBook.create({
        data: { ownerId: userId, kind: AddressBookKind.PERSONAL, name: PERSONAL_BOOK_NAME },
      });
      this.logger.log({ userId, guid: book.guid }, 'Personal address book created');
      return book;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.addressBook.findFirstOrThrow({
          where: { ownerId: userId, kind: AddressBookKind.PERSONAL },
        });
      }
      throw e;
    }
  }

  /**
   * The caller's rule on a book. Owners have full control; shared books grant their share rule.
   * A book the caller cannot see is reported as not found, so guids cannot be probed.
   */
  async resolveAccess(userId: string, guid: string): Promise<BookAccess> {
    const book = await this.prisma.addressBook.findUnique({
      where: { guid },
      include: { shares: { where: { userId } } },
    });
    if (!book) throw DomainError.notFound('Address book');
    const { shares, ...plain } = book;
    if (book.ownerId === userId) return { book: plain, rule: AbRule.FULL };
    const share = shares[0];
    if (book.kind === AddressBookKind.SHARED && share)
      return { book: plain, rule: share.rule as AbRule };
    throw DomainError.notFound('Address book');
  }

  /** Peer and tag mutations need read/write or full control. */
  assertWritable(access: BookAccess): void {
    if (access.rule < AbRule.READ_WRITE) {
      throw DomainError.forbidden(ErrorCode.AB_READ_ONLY, 'This address book is read-only for you');
    }
  }

  /** Shared books visible to a user (owned or shared with them); the personal book is excluded. */
  async listSharedForUser(
    userId: string,
    page: { page: number; pageSize: number },
  ): Promise<{
    total: number;
    data: Array<{ book: AddressBook; rule: AbRule; ownerUsername: string | null }>;
  }> {
    const where: Prisma.AddressBookWhereInput = {
      kind: AddressBookKind.SHARED,
      OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
    };
    const [books, total] = await this.prisma.$transaction([
      this.prisma.addressBook.findMany({
        where,
        include: { owner: { select: { username: true } }, shares: { where: { userId } } },
        orderBy: [{ name: 'asc' }, { guid: 'asc' }],
        ...skipTake(page),
      }),
      this.prisma.addressBook.count({ where }),
    ]);
    return {
      total,
      data: books.map(({ owner, shares, ...book }) => ({
        book,
        ownerUsername: owner?.username ?? null,
        rule: book.ownerId === userId ? AbRule.FULL : ((shares[0]?.rule ?? AbRule.READ) as AbRule),
      })),
    };
  }

  // ---- Admin operations ------------------------------------------------------------------

  async list(query: BookListQuery): Promise<Page<BookSummary>> {
    const where: Prisma.AddressBookWhereInput = {
      kind: query.kind,
      ownerId: query.ownerId,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.addressBook.findMany({
        where,
        include: {
          owner: { select: { username: true } },
          _count: { select: { peers: true, shares: true } },
        },
        orderBy: [{ [query.sort.field]: query.sort.direction }, { guid: 'asc' }],
        ...skipTake(query),
      }),
      this.prisma.addressBook.count({ where }),
    ]);
    return toPage(
      rows.map((r) => this.toSummary(r)),
      total,
      query,
    );
  }

  async get(guid: string): Promise<BookSummary> {
    const row = await this.prisma.addressBook.findUnique({
      where: { guid },
      include: {
        owner: { select: { username: true } },
        _count: { select: { peers: true, shares: true } },
      },
    });
    if (!row) throw DomainError.notFound('Address book');
    return this.toSummary(row);
  }

  async createShared(
    actorId: string,
    input: { name: string; note?: string | null },
  ): Promise<BookSummary> {
    const book = await this.prisma.addressBook.create({
      data: {
        name: input.name,
        note: input.note ?? null,
        kind: AddressBookKind.SHARED,
        ownerId: actorId,
      },
    });
    this.logger.log({ actorId, guid: book.guid }, 'Shared address book created');
    return this.get(book.guid);
  }

  async update(
    actorId: string,
    guid: string,
    input: { name?: string; note?: string | null },
  ): Promise<BookSummary> {
    const { count } = await this.prisma.addressBook.updateMany({
      where: { guid },
      data: { name: input.name, note: input.note },
    });
    if (count === 0) throw DomainError.notFound('Address book');
    this.logger.log({ actorId, guid, changes: Object.keys(input) }, 'Address book updated');
    return this.get(guid);
  }

  async deleteShared(actorId: string, guid: string): Promise<void> {
    const book = await this.prisma.addressBook.findUnique({ where: { guid } });
    if (!book) throw DomainError.notFound('Address book');
    if (book.kind !== AddressBookKind.SHARED) {
      throw DomainError.conflict(
        ErrorCode.CONFLICT,
        'Personal address books are deleted together with their user',
      );
    }
    await this.prisma.addressBook.delete({ where: { guid } });
    this.logger.log({ actorId, guid }, 'Shared address book deleted');
  }

  async getShares(guid: string): Promise<ShareRecord[]> {
    const book = await this.prisma.addressBook.findUnique({
      where: { guid },
      include: {
        shares: {
          include: { user: { select: { username: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!book) throw DomainError.notFound('Address book');
    return book.shares.map((s) => ({
      userId: s.userId,
      username: s.user.username,
      rule: s.rule as AbRule,
    }));
  }

  /** Replaces the whole share list of a shared book in one transaction. */
  async replaceShares(actorId: string, guid: string, shares: ShareInput[]): Promise<ShareRecord[]> {
    const userIds = shares.map((s) => s.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw DomainError.badRequest('Each user may appear only once', [
        { field: 'shares', message: 'duplicate userId' },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      const book = await tx.addressBook.findUnique({ where: { guid } });
      if (!book) throw DomainError.notFound('Address book');
      if (book.kind !== AddressBookKind.SHARED) {
        throw DomainError.conflict(ErrorCode.CONFLICT, 'Only shared address books can be shared');
      }
      const found = await tx.user.count({ where: { id: { in: userIds } } });
      if (found !== userIds.length) throw DomainError.notFound('One or more users');
      await tx.addressBookShare.deleteMany({ where: { bookGuid: guid } });
      if (shares.length > 0) {
        await tx.addressBookShare.createMany({
          data: shares.map((s) => ({ bookGuid: guid, userId: s.userId, rule: s.rule })),
        });
      }
    });
    this.logger.log({ actorId, guid, shares: shares.length }, 'Address book shares replaced');
    return this.getShares(guid);
  }

  private toSummary(
    row: AddressBook & {
      owner: { username: string } | null;
      _count: { peers: number; shares: number };
    },
  ): BookSummary {
    const { owner, _count, ...book } = row;
    return {
      book,
      ownerUsername: owner?.username ?? null,
      peerCount: _count.peers,
      shareCount: _count.shares,
    };
  }
}
