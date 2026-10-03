import { Body, Get, HttpCode, HttpStatus, Logger, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RustdeskAuthGuard } from '../auth/guards';
import { TokenService } from '../auth/token.service';
import { RustdeskController } from '../common/decorators/controllers';
import { DomainError, ErrorCode } from '../common/errors/domain-error';
import { RustdeskErrorDto } from '../common/errors/error.dto';
import { RateLimit } from '../common/throttling/throttling';
import { Prisma, TokenKind } from '../generated/prisma/client';
import { UsersService } from '../users/users.service';
import {
  ClientIdentityDto,
  LoginRequestDto,
  LoginResponseDto,
  UserPayloadDto,
} from './dto/auth.dto';
import { toUserPayload } from './mappers/user.mapper';

/**
 * RustDesk client login and current user.
 * Verified against rustdesk master e5bc204: flutter/lib/models/user_model.dart (login, logout,
 * refreshCurrentUser), flutter/lib/common/hbbs/hbbs.dart (LoginRequest, LoginResponse, UserPayload).
 *
 *   POST /api/login        {"username","password","id","uuid","autoLogin","type":"account","deviceInfo"}
 *                          → {"type":"access_token","access_token","user":{...}}
 *   POST /api/currentUser  {"id","uuid"} + Bearer → UserPayload
 *   POST /api/logout       {"id","uuid"} + Bearer → 200
 *   GET  /api/login-options → [] (no OIDC providers)
 */
@RustdeskController()
export class RustdeskAuthController {
  private readonly logger = new Logger(RustdeskAuthController.name);

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit('login')
  @ApiOperation({
    summary: 'Log in from the RustDesk client',
    description:
      'The body is parsed as JSON whatever the Content-Type (the client sends none). 2FA and email verification are not supported.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({
    type: RustdeskErrorDto,
    description: 'Invalid body or 2FA fields present',
  })
  @ApiUnauthorizedResponse({ type: RustdeskErrorDto, description: 'Wrong username or password' })
  @ApiForbiddenResponse({ type: RustdeskErrorDto, description: 'Account disabled' })
  async login(@Body() body: LoginRequestDto, @Req() req: Request): Promise<LoginResponseDto> {
    if (body.verificationCode || body.tfaCode || body.secret) {
      throw new DomainError(
        ErrorCode.TWO_FACTOR_UNSUPPORTED,
        HttpStatus.BAD_REQUEST,
        'Two-factor authentication and email verification are not supported by this server',
      );
    }
    if (body.type !== undefined && body.type !== 'account') {
      throw DomainError.badRequest(`Login type "${body.type}" is not supported`);
    }

    let user;
    try {
      user = await this.users.verifyCredentials(body.username, body.password);
    } catch (e) {
      this.logger.warn(
        {
          username: body.username,
          ip: req.ip,
          clientId: body.id,
          reason: e instanceof DomainError ? e.code : 'error',
        },
        'RustDesk login failed',
      );
      throw e;
    }

    const { token } = await this.tokens.issue({
      userId: user.id,
      kind: TokenKind.RUSTDESK_CLIENT,
      clientId: body.id ?? null,
      clientUuid: body.uuid ?? null,
      deviceInfo: (body.deviceInfo ?? null) as Prisma.InputJsonValue | null,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    this.logger.log(
      { userId: user.id, username: user.username, ip: req.ip, clientId: body.id },
      'RustDesk login succeeded',
    );
    return { type: 'access_token', access_token: token, user: toUserPayload(user) };
  }

  @Post('currentUser')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RustdeskAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The user the bearer token belongs to' })
  @ApiOkResponse({ type: UserPayloadDto })
  @ApiUnauthorizedResponse({
    type: RustdeskErrorDto,
    description: 'The client drops its token and shows the logged-out state',
  })
  currentUser(@Body() _body: ClientIdentityDto, @CurrentAuth() auth: AuthContext): UserPayloadDto {
    return toUserPayload(auth.user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RustdeskAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke the bearer token',
    description: 'Answers 200 with an empty body; the client ignores the result.',
  })
  @ApiOkResponse({ description: 'Empty body' })
  async logout(@Body() _body: ClientIdentityDto, @CurrentAuth() auth: AuthContext): Promise<void> {
    await this.tokens.revoke(auth.tokenId, 'client logout');
    this.logger.log({ userId: auth.user.id, tokenId: auth.tokenId }, 'RustDesk logout');
  }

  @Get('login-options')
  @ApiOperation({
    summary: 'OIDC providers offered on the login screen',
    description: 'Always `[]`: OIDC is a RustDesk Pro feature.',
  })
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'string' }, example: [] } })
  loginOptions(): string[] {
    return [];
  }
}
