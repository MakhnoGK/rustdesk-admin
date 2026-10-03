import { Body, Get, HttpCode, HttpStatus, Logger, Post, Req, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { ADMIN_COOKIE_NAME, ADMIN_COOKIE_PATH, type AuthContext } from '../auth/auth.types';
import { CurrentAuth, Public } from '../auth/guards';
import { TokenService } from '../auth/token.service';
import { AdminController } from '../common/decorators/controllers';
import { DomainError, ErrorCode } from '../common/errors/domain-error';
import { RateLimit } from '../common/throttling/throttling';
import { toIso } from '../common/time/time';
import { AppConfig } from '../config/app-config.service';
import { TokenKind, UserRole } from '../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { toUserDto } from './admin.mappers';
import { AdminLoginDto, AdminSessionDto } from './dto/users.dto';

/** Admin panel sign-in: an httpOnly, SameSite=Strict session cookie holding an ADMIN_WEB JWT. */
@AdminController('auth')
export class AdminAuthController {
  private readonly logger = new Logger(AdminAuthController.name);

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly config: AppConfig,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('ADMIN_COOKIE_SECURE'),
      sameSite: 'strict',
      path: ADMIN_COOKIE_PATH,
    };
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit('login')
  @ApiOperation({
    summary: 'Sign in; sets the session cookie',
    description:
      'Requires an Origin header listed in ADMIN_ALLOWED_ORIGINS. Only role ADMIN may sign in.',
  })
  @ApiOkResponse({ type: AdminSessionDto })
  async login(
    @Body() body: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminSessionDto> {
    let user;
    try {
      user = await this.users.verifyCredentials(body.username, body.password);
      if (user.role !== UserRole.ADMIN)
        throw DomainError.forbidden(ErrorCode.FORBIDDEN, 'Administrator role required');
    } catch (e) {
      this.logger.warn(
        {
          username: body.username,
          ip: req.ip,
          reason: e instanceof DomainError ? e.code : 'error',
        },
        'Admin login failed',
      );
      throw e;
    }
    const { token, record } = await this.tokens.issue({
      userId: user.id,
      kind: TokenKind.ADMIN_WEB,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.cookie(ADMIN_COOKIE_NAME, token, { ...this.cookieOptions(), expires: record.expiresAt });
    this.logger.log(
      { userId: user.id, username: user.username, ip: req.ip },
      'Admin login succeeded',
    );
    return { user: toUserDto(user), expiresAt: toIso(record.expiresAt) };
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out: revokes the session token and clears the cookie' })
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[ADMIN_COOKIE_NAME];
    if (token) {
      try {
        const auth = await this.tokens.authenticate(TokenKind.ADMIN_WEB, token);
        await this.tokens.revoke(auth.tokenId, 'admin logout');
        this.logger.log({ userId: auth.user.id, tokenId: auth.tokenId }, 'Admin logout');
      } catch {
        // Already invalid: clearing the cookie is all that is left to do.
      }
    }
    res.clearCookie(ADMIN_COOKIE_NAME, this.cookieOptions());
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in administrator' })
  @ApiOkResponse({ type: AdminSessionDto })
  async me(@CurrentAuth() auth: AuthContext): Promise<AdminSessionDto> {
    return {
      user: toUserDto(await this.users.get(auth.user.id)),
      expiresAt: toIso(auth.expiresAt),
    };
  }
}
