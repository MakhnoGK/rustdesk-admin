import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppConfig } from '../config/app-config.service';
import { DomainError, ErrorCode } from '../common/errors/domain-error';
import { TokenKind, UserRole } from '../generated/prisma/client';
import { ADMIN_COOKIE_NAME, type AuthContext, type AuthenticatedRequest } from './auth.types';
import { TokenService } from './token.service';

type AuthRequest = Request & AuthenticatedRequest;

const PUBLIC_KEY = 'auth:public';
/** Skips the auth guard of the controller for one route (e.g. admin login). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** The authenticated context set by the guards. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    if (!req.auth) throw DomainError.unauthorized();
    return req.auth;
  },
);

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

/** RustDesk client routes: `Authorization: Bearer <token>`; any failure is a 401. */
@Injectable()
export class RustdeskAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = bearerToken(req);
    if (!token) throw DomainError.unauthorized('Missing bearer token');
    req.auth = await this.tokens.authenticate(TokenKind.RUSTDESK_CLIENT, token);
    return true;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for the cookie-authenticated admin API, on top of SameSite=Strict: every
 * state-changing request (login included) must carry an Origin from ADMIN_ALLOWED_ORIGINS.
 */
@Injectable()
export class AdminOriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(config: AppConfig) {
    this.allowed = new Set(config.get('ADMIN_ALLOWED_ORIGINS').map((o) => new URL(o).origin));
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    const origin = req.headers.origin;
    if (origin && this.allowed.has(origin)) return true;
    throw DomainError.forbidden(ErrorCode.CSRF_ORIGIN_MISMATCH, 'Request origin is not allowed');
  }
}

/** Admin routes: session cookie, role ADMIN. Routes marked `@Public()` skip it. */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[ADMIN_COOKIE_NAME];
    if (!token) throw DomainError.unauthorized('Not signed in');
    const auth = await this.tokens.authenticate(TokenKind.ADMIN_WEB, token);
    if (auth.user.role !== UserRole.ADMIN) {
      throw DomainError.forbidden(ErrorCode.FORBIDDEN, 'Administrator role required');
    }
    req.auth = auth;
    return true;
  }
}
