import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config.service';
import { DomainError } from '../common/errors/domain-error';
import { type Page, skipTake, toPage } from '../common/pagination/pagination';
import { addSeconds } from '../common/time/time';
import { type AuthToken, Prisma, TokenKind, UserStatus } from '../generated/prisma/client';
import { PrismaService, type PrismaTx } from '../prisma/prisma.service';
import type { AuthContext } from './auth.types';

const ISSUER = 'rustdesk-admin';
/** `last_used_at` is refreshed at most this often per token, to avoid a write per request. */
const LAST_USED_RESOLUTION_MS = 60_000;

interface JwtClaims {
  sub: string;
  jti: string;
}

export interface IssueTokenInput {
  userId: string;
  kind: TokenKind;
  clientId?: string | null;
  clientUuid?: string | null;
  deviceInfo?: Prisma.InputJsonValue | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Issues and verifies JWTs. Every token is a row in `auth_tokens` keyed by its `jti`, so it
 * can be listed and revoked; each request checks the row, not just the signature.
 * RustDesk client tokens and admin tokens use different secrets and audiences.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  private secretFor(kind: TokenKind): string {
    return kind === TokenKind.ADMIN_WEB
      ? this.config.get('ADMIN_JWT_SECRET')
      : this.config.get('RUSTDESK_JWT_SECRET');
  }

  private ttlFor(kind: TokenKind): number {
    return kind === TokenKind.ADMIN_WEB
      ? this.config.adminSessionTtlSeconds
      : this.config.rustdeskTokenTtlSeconds;
  }

  async issue(
    input: IssueTokenInput,
    now = new Date(),
  ): Promise<{ token: string; record: AuthToken }> {
    const jti = randomUUID();
    const ttl = this.ttlFor(input.kind);
    const record = await this.prisma.authToken.create({
      data: {
        id: jti,
        userId: input.userId,
        kind: input.kind,
        clientId: input.clientId ?? null,
        clientUuid: input.clientUuid ?? null,
        deviceInfo: input.deviceInfo ?? Prisma.DbNull,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
        issuedAt: now,
        expiresAt: addSeconds(now, ttl),
      },
    });
    const token = await this.jwt.signAsync({ sub: input.userId, jti } satisfies JwtClaims, {
      secret: this.secretFor(input.kind),
      expiresIn: ttl,
      issuer: ISSUER,
      audience: input.kind,
    });
    return { token, record };
  }

  /** Verifies signature, expiry, revocation and the user's status. Throws 401 on any failure. */
  async authenticate(kind: TokenKind, token: string, now = new Date()): Promise<AuthContext> {
    let claims: JwtClaims;
    try {
      claims = await this.jwt.verifyAsync<JwtClaims>(token, {
        secret: this.secretFor(kind),
        issuer: ISSUER,
        audience: kind,
      });
    } catch {
      throw DomainError.unauthorized('Invalid or expired token');
    }

    const record = await this.prisma.authToken.findUnique({
      where: { id: claims.jti },
      include: { user: true },
    });
    if (!record || record.kind !== kind || record.userId !== claims.sub) {
      throw DomainError.unauthorized('Invalid or expired token');
    }
    if (record.revokedAt) throw DomainError.unauthorized('Token has been revoked');
    if (record.expiresAt <= now) throw DomainError.unauthorized('Invalid or expired token');
    if (record.user.status !== UserStatus.ACTIVE)
      throw DomainError.unauthorized('Account is disabled');

    if (
      !record.lastUsedAt ||
      now.getTime() - record.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
    ) {
      await this.prisma.authToken.update({ where: { id: record.id }, data: { lastUsedAt: now } });
    }

    const { user } = record;
    return {
      tokenId: record.id,
      kind: record.kind,
      expiresAt: record.expiresAt,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        note: user.note,
        role: user.role,
        status: user.status,
      },
    };
  }

  /** Revokes one token; returns false when it was already revoked or does not exist. */
  async revoke(
    tokenId: string,
    reason: string,
    db: PrismaTx | PrismaService = this.prisma,
  ): Promise<boolean> {
    const { count } = await db.authToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    if (count > 0) this.logger.log({ tokenId, reason }, 'Token revoked');
    return count > 0;
  }

  async exists(tokenId: string): Promise<boolean> {
    return (await this.prisma.authToken.count({ where: { id: tokenId } })) > 0;
  }

  /** A user's tokens, newest first. */
  async listForUser(
    userId: string,
    page: { page: number; pageSize: number },
  ): Promise<Page<AuthToken>> {
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.authToken.findMany({
        where,
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        ...skipTake(page),
      }),
      this.prisma.authToken.count({ where }),
    ]);
    return toPage(rows, total, page);
  }

  /** Revokes every live token of a user (password reset, disable, delete). */
  async revokeAllForUser(
    userId: string,
    reason: string,
    db: PrismaTx | PrismaService = this.prisma,
  ): Promise<number> {
    const { count } = await db.authToken.updateMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    if (count > 0) this.logger.log({ userId, count, reason }, 'User tokens revoked');
    return count;
  }
}
