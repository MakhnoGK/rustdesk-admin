import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DomainError, ErrorCode } from '../common/errors/domain-error';
import { type Page, type SortSpec, skipTake, toPage } from '../common/pagination/pagination';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import {
  AddressBookKind,
  Prisma,
  type User,
  UserRole,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService, type PrismaTx } from '../prisma/prisma.service';

/** A user without the password hash; the only shape that leaves this service. */
export type UserRecord = Omit<User, 'passwordHash'>;
const omitHash = { passwordHash: true } as const;

export const USER_SORT_FIELDS = ['username', 'createdAt', 'updatedAt', 'role', 'status'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export interface UserListQuery {
  search?: string;
  role?: UserRole;
  status?: UserStatus;
  page: number;
  pageSize: number;
  sort: SortSpec<UserSortField>;
}

export interface CreateUserInput {
  username: string;
  password: string;
  displayName?: string | null;
  email?: string | null;
  note?: string | null;
  role?: UserRole;
  status?: UserStatus;
}

export interface UpdateUserInput {
  displayName?: string | null;
  email?: string | null;
  note?: string | null;
  role?: UserRole;
  status?: UserStatus;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Checks a username/password pair. The password is verified before the account status is
   * revealed, so a disabled account cannot be probed without its password.
   */
  async verifyCredentials(username: string, password: string): Promise<UserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { username: normalizeUsername(username) },
    });
    const ok = await this.passwords.verify(user?.passwordHash ?? null, password);
    if (!user || !ok) {
      throw new DomainError(
        ErrorCode.INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
        'Wrong username or password',
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw DomainError.forbidden(ErrorCode.USER_DISABLED, 'This account is disabled');
    }
    const { passwordHash: _hash, ...record } = user;
    return record;
  }

  async get(id: string): Promise<UserRecord> {
    const user = await this.prisma.user.findUnique({ where: { id }, omit: omitHash });
    if (!user) throw DomainError.notFound('User');
    return user;
  }

  async list(query: UserListQuery): Promise<Page<UserRecord>> {
    const where: Prisma.UserWhereInput = {
      role: query.role,
      status: query.status,
      ...(query.search
        ? {
            OR: [
              { username: { contains: query.search, mode: 'insensitive' } },
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        omit: omitHash,
        orderBy: [{ [query.sort.field]: query.sort.direction }, { id: 'asc' }],
        ...skipTake(query),
      }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(data, total, query);
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const username = normalizeUsername(input.username);
    const passwordHash = await this.passwords.hash(input.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          passwordHash,
          displayName: input.displayName ?? null,
          email: input.email ?? null,
          note: input.note ?? null,
          role: input.role ?? UserRole.USER,
          status: input.status ?? UserStatus.ACTIVE,
        },
        omit: omitHash,
      });
      this.logger.log({ userId: user.id, username, role: user.role }, 'User created');
      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw DomainError.conflict(ErrorCode.ALREADY_EXISTS, `User "${username}" already exists`);
      }
      throw e;
    }
  }

  async update(actorId: string, id: string, input: UpdateUserInput): Promise<UserRecord> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id }, omit: omitHash });
      if (!current) throw DomainError.notFound('User');

      const losesAdmin =
        current.role === UserRole.ADMIN &&
        current.status === UserStatus.ACTIVE &&
        ((input.role !== undefined && input.role !== UserRole.ADMIN) ||
          (input.status !== undefined && input.status !== UserStatus.ACTIVE));
      if (losesAdmin) {
        if (actorId === id) {
          throw DomainError.conflict(
            ErrorCode.SELF_MODIFICATION,
            'You cannot demote or disable yourself',
          );
        }
        await this.assertNotLastActiveAdmin(tx, id);
      }

      const user = await tx.user.update({
        where: { id },
        data: {
          displayName: input.displayName,
          email: input.email,
          note: input.note,
          role: input.role,
          status: input.status,
        },
        omit: omitHash,
      });
      if (current.status === UserStatus.ACTIVE && user.status !== UserStatus.ACTIVE) {
        await this.tokens.revokeAllForUser(id, 'user disabled', tx);
      }
      this.logger.log({ actorId, userId: id, changes: Object.keys(input) }, 'User updated');
      return user;
    });
  }

  async resetPassword(actorId: string, id: string, password: string): Promise<void> {
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({ where: { id }, data: { passwordHash } });
      if (count === 0) throw DomainError.notFound('User');
      await this.tokens.revokeAllForUser(id, 'password reset', tx);
    });
    this.logger.log({ actorId, userId: id }, 'User password reset');
  }

  async delete(actorId: string, id: string): Promise<void> {
    if (actorId === id) {
      throw DomainError.conflict(ErrorCode.SELF_MODIFICATION, 'You cannot delete yourself');
    }
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, omit: omitHash });
      if (!user) throw DomainError.notFound('User');
      if (user.role === UserRole.ADMIN && user.status === UserStatus.ACTIVE) {
        await this.assertNotLastActiveAdmin(tx, id);
      }
      // The personal book goes with its owner; shared books it created stay (owner set null).
      await tx.addressBook.deleteMany({ where: { ownerId: id, kind: AddressBookKind.PERSONAL } });
      await tx.user.delete({ where: { id } });
    });
    this.logger.log({ actorId, userId: id }, 'User deleted');
  }

  /**
   * Locks every active administrator row, then refuses if `userId` is the only one. The lock
   * serialises concurrent demotions so two admins cannot remove each other at once.
   */
  private async assertNotLastActiveAdmin(tx: PrismaTx, userId: string): Promise<void> {
    const admins = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id FOR UPDATE`;
    if (admins.length <= 1 && admins.some((a) => a.id === userId)) {
      throw DomainError.conflict(
        ErrorCode.LAST_ADMIN,
        'The last active administrator cannot be removed',
      );
    }
  }

  /** Seed helper: creates the first administrator only when no administrator exists. */
  async ensureInitialAdmin(
    username: string,
    password: string,
  ): Promise<{ created: boolean; username: string }> {
    const existing = await this.prisma.user.count({ where: { role: UserRole.ADMIN } });
    if (existing > 0) return { created: false, username: normalizeUsername(username) };
    const user = await this.create({
      username,
      password,
      role: UserRole.ADMIN,
      displayName: 'Administrator',
    });
    return { created: true, username: user.username };
  }
}
