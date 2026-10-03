import { Body, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/guards';
import { TokenService } from '../auth/token.service';
import { AdminController } from '../common/decorators/controllers';
import { DomainError } from '../common/errors/domain-error';
import { AdminErrorDto } from '../common/errors/error.dto';
import { PageQueryDto, parseSort } from '../common/pagination/pagination';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { USER_SORT_FIELDS, UsersService } from '../users/users.service';
import { toTokenDto, toUserDto } from './admin.mappers';
import {
  CreateUserDto,
  ResetPasswordDto,
  TokenPageDto,
  UpdateUserDto,
  UserDto,
  UserListQueryDto,
  UserPageDto,
} from './dto/users.dto';

const userId = new UuidParamPipe('User');

@AdminController('users')
export class AdminUsersController {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiOkResponse({ type: UserPageDto })
  async list(@Query() q: UserListQueryDto): Promise<UserPageDto> {
    const page = await this.users.list({
      search: q.search,
      role: q.role,
      status: q.status,
      page: q.page,
      pageSize: q.pageSize,
      sort: parseSort(q.sort, USER_SORT_FIELDS, { field: 'username', direction: 'asc' }),
    });
    return { ...page, data: page.data.map(toUserDto) };
  }

  @Post()
  @ApiOperation({ summary: 'Create a user' })
  @ApiCreatedResponse({ type: UserDto })
  @ApiConflictResponse({ type: AdminErrorDto, description: 'Username taken' })
  async create(@Body() body: CreateUserDto): Promise<UserDto> {
    return toUserDto(await this.users.create(body));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user' })
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ type: AdminErrorDto })
  async get(@Param('id', userId) id: string): Promise<UserDto> {
    return toUserDto(await this.users.get(id));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a user',
    description:
      'Disabling a user revokes their tokens. You cannot demote or disable yourself, nor the last active administrator (409).',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiConflictResponse({ type: AdminErrorDto, description: 'SELF_MODIFICATION or LAST_ADMIN' })
  async update(
    @Param('id', userId) id: string,
    @Body() body: UpdateUserDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<UserDto> {
    return toUserDto(await this.users.update(auth.user.id, id, body));
  }

  @Post(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset a password', description: 'Revokes every token of the user.' })
  @ApiNoContentResponse()
  async resetPassword(
    @Param('id', userId) id: string,
    @Body() body: ResetPasswordDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.users.resetPassword(auth.user.id, id, body.password);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a user',
    description:
      'Deletes their personal address book and tokens. Shared books they created remain.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: AdminErrorDto, description: 'SELF_MODIFICATION or LAST_ADMIN' })
  async delete(@Param('id', userId) id: string, @CurrentAuth() auth: AuthContext): Promise<void> {
    await this.users.delete(auth.user.id, id);
  }

  @Get(':id/tokens')
  @ApiOperation({
    summary: "List a user's tokens (RustDesk clients and admin sessions), newest first",
  })
  @ApiOkResponse({ type: TokenPageDto })
  async listTokens(
    @Param('id', userId) id: string,
    @Query() q: PageQueryDto,
  ): Promise<TokenPageDto> {
    await this.users.get(id);
    const page = await this.tokens.listForUser(id, q);
    const now = new Date();
    return { ...page, data: page.data.map((t) => toTokenDto(t, now)) };
  }
}

@AdminController('tokens')
export class AdminTokensController {
  constructor(private readonly tokens: TokenService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke a token',
    description:
      'Idempotent. A revoked RustDesk client token makes the client log out on its next call.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: AdminErrorDto })
  async revoke(
    @Param('id', new UuidParamPipe('Token')) id: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    const revoked = await this.tokens.revoke(id, `revoked by admin ${auth.user.username}`);
    if (!revoked && !(await this.tokens.exists(id))) throw DomainError.notFound('Token');
  }
}
