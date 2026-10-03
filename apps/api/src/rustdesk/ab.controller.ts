import {
  Body,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AbPeersService } from '../address-books/ab-peers.service';
import { AbTagsService } from '../address-books/ab-tags.service';
import { AddressBooksService } from '../address-books/address-books.service';
import type { BookAccess } from '../address-books/address-books.types';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RustdeskAuthGuard } from '../auth/guards';
import { RustdeskController } from '../common/decorators/controllers';
import { RustdeskErrorDto } from '../common/errors/error.dto';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import {
  AbPeerDto,
  AbPeerPageDto,
  AbPeersQueryDto,
  AbPersonalResponseDto,
  AbProfileDto,
  AbProfilePageDto,
  AbSettingsResponseDto,
  AbTagDto,
  AbTagRenameDto,
  RustdeskPageQueryDto,
} from './dto/ab.dto';
import {
  decodeAbPeer,
  decodeStringArray,
  decodeTagColor,
  encodeAbPeer,
  encodeTag,
} from './mappers/ab.mapper';

const EMPTY_200 =
  'HTTP 200 with an EMPTY body. The client treats 204 and any non-empty body as a failure.';
const guidParam = new UuidParamPipe('Address book');

/**
 * Address book, current API. Verified against rustdesk master e5bc204:
 * flutter/lib/models/ab_model.dart, flutter/lib/common/hbbs/hbbs.dart.
 *
 *   POST   /api/ab/personal                         → {"guid"}             (404 here = legacy mode)
 *   POST   /api/ab/settings                         → {"max_peer_one_ab"}
 *   POST   /api/ab/shared/profiles?current&pageSize → {"total","data":[AbProfile]}
 *   POST   /api/ab/peers?current&pageSize&ab=<guid> → {"total","data":[AbPeer]}
 *   POST   /api/ab/tags/<guid>                      → [{"name","color"}]
 *   POST   /api/ab/peer/add/<guid>      AbPeer                → 200 empty
 *   PUT    /api/ab/peer/update/<guid>   {"id", ...changed}    → 200 empty
 *   DELETE /api/ab/peer/<guid>          ["<peer id>", ...]    → 200 empty
 *   POST   /api/ab/tag/add/<guid>       {"name","color"}      → 200 empty
 *   PUT    /api/ab/tag/rename/<guid>    {"old","new"}         → 200 empty
 *   PUT    /api/ab/tag/update/<guid>    {"name","color"}      → 200 empty
 *   DELETE /api/ab/tag/<guid>           ["<tag>", ...]        → 200 empty
 */
@RustdeskController('ab')
@UseGuards(RustdeskAuthGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: RustdeskErrorDto, description: 'The client drops its token' })
export class RustdeskAbController {
  constructor(
    private readonly books: AddressBooksService,
    private readonly peers: AbPeersService,
    private readonly tags: AbTagsService,
  ) {}

  @Post('personal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Guid of the caller's personal book (created on first call)",
    description: 'A 200 here makes the client use this API instead of the legacy `/api/ab`.',
  })
  @ApiOkResponse({ type: AbPersonalResponseDto })
  async personal(@CurrentAuth() auth: AuthContext): Promise<AbPersonalResponseDto> {
    const book = await this.books.getOrCreatePersonal(auth.user.id);
    return { guid: book.guid };
  }

  @Post('settings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Address book limits' })
  @ApiOkResponse({ type: AbSettingsResponseDto })
  settings(): AbSettingsResponseDto {
    return { max_peer_one_ab: this.books.maxPeersPerBook };
  }

  @Post('shared/profiles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Shared books visible to the caller',
    description: 'The client adds the personal book to the list itself.',
  })
  @ApiOkResponse({ type: AbProfilePageDto })
  async sharedProfiles(
    @Query() q: RustdeskPageQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AbProfilePageDto> {
    const { total, data } = await this.books.listSharedForUser(auth.user.id, {
      page: q.current,
      pageSize: q.pageSize,
    });
    return {
      total,
      data: data.map((b): AbProfileDto => ({
        guid: b.book.guid,
        name: b.book.name,
        owner: b.ownerUsername ?? '',
        note: b.book.note ?? '',
        rule: b.rule,
        info: {},
      })),
    };
  }

  @Post('peers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Peers of one book, paginated' })
  @ApiOkResponse({ type: AbPeerPageDto })
  @ApiNotFoundResponse({ type: RustdeskErrorDto })
  async listPeers(
    @Query() q: AbPeersQueryDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AbPeerPageDto> {
    const access = await this.access(auth, guidParam.transform(q.ab));
    const { total, data } = await this.peers.list(
      access.book.guid,
      { page: q.current, pageSize: q.pageSize },
      { withSecrets: true },
    );
    return {
      total,
      data: data.map((p) => encodeAbPeer(p, access.book.kind) as unknown as AbPeerDto),
    };
  }

  @Post('tags/:guid')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'guid', description: 'Address book guid' })
  @ApiOperation({ summary: 'Tags of one book (a bare JSON array)' })
  @ApiOkResponse({ type: [AbTagDto] })
  async listTags(
    @Param('guid', guidParam) guid: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AbTagDto[]> {
    const access = await this.access(auth, guid);
    return (await this.tags.list(access.book.guid)).map(encodeTag);
  }

  @Post('peer/add/:guid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a peer', description: EMPTY_200 })
  @ApiBody({ type: AbPeerDto })
  @ApiOkResponse({ description: 'Empty body' })
  @ApiForbiddenResponse({
    type: RustdeskErrorDto,
    description: 'Read-only book or peer limit reached',
  })
  async addPeer(
    @Param('guid', guidParam) guid: string,
    @Body() body: unknown,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    const access = await this.writable(auth, guid);
    const { peerId, fields } = decodeAbPeer(body, { kind: access.book.kind });
    await this.peers.add(guid, peerId, fields);
  }

  @Put('peer/update/:guid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a peer (only the fields sent change)', description: EMPTY_200 })
  @ApiBody({ type: AbPeerDto })
  @ApiOkResponse({ description: 'Empty body' })
  async updatePeer(
    @Param('guid', guidParam) guid: string,
    @Body() body: unknown,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    const access = await this.writable(auth, guid);
    const { peerId, fields } = decodeAbPeer(body, { kind: access.book.kind });
    await this.peers.update(guid, peerId, fields);
  }

  @Delete('peer/:guid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete peers by RustDesk ID', description: EMPTY_200 })
  @ApiBody({ schema: { type: 'array', items: { type: 'string' }, example: ['123456789'] } })
  @ApiOkResponse({ description: 'Empty body' })
  async deletePeers(
    @Param('guid', guidParam) guid: string,
    @Body() body: unknown,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.writable(auth, guid);
    await this.peers.delete(guid, decodeStringArray(body, 'peer IDs'));
  }

  @Post('tag/add/:guid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a tag (idempotent)', description: EMPTY_200 })
  @ApiOkResponse({ description: 'Empty body' })
  async addTag(
    @Param('guid', guidParam) guid: string,
    @Body() body: AbTagDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.writable(auth, guid);
    await this.tags.add(guid, body.name, decodeTagColor(body.color), 'ignore');
  }

  @Put('tag/rename/:guid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rename a tag, in every peer too', description: EMPTY_200 })
  @ApiOkResponse({ description: 'Empty body' })
  async renameTag(
    @Param('guid', guidParam) guid: string,
    @Body() body: AbTagRenameDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.writable(auth, guid);
    await this.tags.rename(guid, body.old, body.new);
  }

  @Put('tag/update/:guid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change a tag's color", description: EMPTY_200 })
  @ApiOkResponse({ description: 'Empty body' })
  async updateTag(
    @Param('guid', guidParam) guid: string,
    @Body() body: AbTagDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.writable(auth, guid);
    await this.tags.setColor(guid, body.name, decodeTagColor(body.color));
  }

  @Delete('tag/:guid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete tags, from every peer too', description: EMPTY_200 })
  @ApiBody({ schema: { type: 'array', items: { type: 'string' }, example: ['office'] } })
  @ApiOkResponse({ description: 'Empty body' })
  async deleteTags(
    @Param('guid', guidParam) guid: string,
    @Body() body: unknown,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.writable(auth, guid);
    await this.tags.delete(guid, decodeStringArray(body, 'tag names'));
  }

  private access(auth: AuthContext, guid: string): Promise<BookAccess> {
    return this.books.resolveAccess(auth.user.id, guid);
  }

  private async writable(auth: AuthContext, guid: string): Promise<BookAccess> {
    const access = await this.access(auth, guid);
    this.books.assertWritable(access);
    return access;
  }
}
