import {
  Body,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Put,
  Query,
  type ValidationError,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { AbPeersService } from '../address-books/ab-peers.service';
import { AbTagsService } from '../address-books/ab-tags.service';
import { BOOK_SORT_FIELDS, AddressBooksService } from '../address-books/address-books.service';
import type { PeerFields } from '../address-books/address-books.types';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/guards';
import { AdminController } from '../common/decorators/controllers';
import { DomainError, ErrorCode, ValidationFailedError } from '../common/errors/domain-error';
import { AdminErrorDto } from '../common/errors/error.dto';
import { parseSort, toPage } from '../common/pagination/pagination';
import { flattenValidationErrors } from '../common/pipes/validation';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { AddressBookKind } from '../generated/prisma/client';
import { toBookDto, toPeerDto, toShareDto, toTagDto } from './admin.mappers';
import {
  AddressBookDto,
  AddressBookListQueryDto,
  AddressBookPageDto,
  AdminPeerDto,
  AdminPeerPageDto,
  AdminTagDto,
  CreateAddressBookDto,
  CreatePeerDto,
  CreateTagDto,
  PeerListQueryDto,
  ShareDto,
  ShareInputDto,
  UpdateAddressBookDto,
  UpdatePeerDto,
  UpdateTagDto,
} from './dto/address-books.dto';

const guidParam = new UuidParamPipe('Address book');
const sharesBody = new ParseArrayPipe({
  items: ShareInputDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: (errors: ValidationError[]) =>
    new ValidationFailedError(flattenValidationErrors(errors)),
});

@AdminController('address-books')
export class AdminAddressBooksController {
  constructor(
    private readonly books: AddressBooksService,
    private readonly peers: AbPeersService,
    private readonly tags: AbTagsService,
  ) {}

  // ---- Books ----------------------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: 'List address books (personal and shared)' })
  @ApiOkResponse({ type: AddressBookPageDto })
  async list(@Query() q: AddressBookListQueryDto): Promise<AddressBookPageDto> {
    const page = await this.books.list({
      kind: q.kind,
      ownerId: q.ownerId,
      search: q.search,
      page: q.page,
      pageSize: q.pageSize,
      sort: parseSort(q.sort, BOOK_SORT_FIELDS, { field: 'name', direction: 'asc' }),
    });
    return { ...page, data: page.data.map(toBookDto) };
  }

  @Post()
  @ApiOperation({ summary: 'Create a shared address book (owned by the caller)' })
  @ApiCreatedResponse({ type: AddressBookDto })
  async create(
    @Body() body: CreateAddressBookDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AddressBookDto> {
    return toBookDto(await this.books.createShared(auth.user.id, body));
  }

  @Get(':guid')
  @ApiOperation({ summary: 'Get an address book' })
  @ApiOkResponse({ type: AddressBookDto })
  @ApiNotFoundResponse({ type: AdminErrorDto })
  async get(@Param('guid', guidParam) guid: string): Promise<AddressBookDto> {
    return toBookDto(await this.books.get(guid));
  }

  @Patch(':guid')
  @ApiOperation({ summary: 'Rename an address book or change its note' })
  @ApiOkResponse({ type: AddressBookDto })
  async update(
    @Param('guid', guidParam) guid: string,
    @Body() body: UpdateAddressBookDto,
    @CurrentAuth() auth: AuthContext,
  ): Promise<AddressBookDto> {
    return toBookDto(await this.books.update(auth.user.id, guid, body));
  }

  @Delete(':guid')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a shared address book',
    description: 'Personal books are deleted with their user (409 here).',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: AdminErrorDto })
  async delete(
    @Param('guid', guidParam) guid: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    await this.books.deleteShared(auth.user.id, guid);
  }

  @Get(':guid/shares')
  @ApiOperation({ summary: 'Users a book is shared with' })
  @ApiOkResponse({ type: [ShareDto] })
  async shares(@Param('guid', guidParam) guid: string): Promise<ShareDto[]> {
    return (await this.books.getShares(guid)).map(toShareDto);
  }

  @Put(':guid/shares')
  @ApiOperation({
    summary: 'Replace the share list of a shared book',
    description: 'Body: `[{userId, rule}]`; rule 1 read-only, 2 read/write, 3 full control.',
  })
  @ApiBody({ type: [ShareInputDto] })
  @ApiOkResponse({ type: [ShareDto] })
  async replaceShares(
    @Param('guid', guidParam) guid: string,
    @Body(sharesBody) body: ShareInputDto[],
    @CurrentAuth() auth: AuthContext,
  ): Promise<ShareDto[]> {
    return (await this.books.replaceShares(auth.user.id, guid, body)).map(toShareDto);
  }

  // ---- Peers ----------------------------------------------------------------------------

  @Get(':guid/peers')
  @ApiOperation({
    summary: 'Peers of a book',
    description: 'Credentials are never returned; see hasPassword / hasHash.',
  })
  @ApiOkResponse({ type: AdminPeerPageDto })
  async listPeers(
    @Param('guid', guidParam) guid: string,
    @Query() q: PeerListQueryDto,
  ): Promise<AdminPeerPageDto> {
    await this.books.get(guid);
    const { total, data } = await this.peers.list(
      guid,
      { page: q.page, pageSize: q.pageSize, search: q.search, tags: q.tag, tagMode: q.tagMode },
      { withSecrets: false },
    );
    return toPage(data.map(toPeerDto), total, q);
  }

  @Post(':guid/peers')
  @ApiOperation({ summary: 'Add a peer' })
  @ApiCreatedResponse({ type: AdminPeerDto })
  @ApiConflictResponse({ type: AdminErrorDto })
  async addPeer(
    @Param('guid', guidParam) guid: string,
    @Body() body: CreatePeerDto,
  ): Promise<AdminPeerDto> {
    const book = await this.books.get(guid);
    const { peerId, ...fields } = body;
    await this.peers.add(guid, peerId, this.peerFields(book.book.kind, fields));
    return toPeerDto(await this.peers.get(guid, peerId, { withSecrets: false }));
  }

  @Patch(':guid/peers/:peerId')
  @ApiParam({ name: 'peerId', description: 'RustDesk ID of the peer' })
  @ApiOperation({ summary: 'Update a peer' })
  @ApiOkResponse({ type: AdminPeerDto })
  async updatePeer(
    @Param('guid', guidParam) guid: string,
    @Param('peerId') peerId: string,
    @Body() body: UpdatePeerDto,
  ): Promise<AdminPeerDto> {
    const book = await this.books.get(guid);
    await this.peers.update(guid, peerId, this.peerFields(book.book.kind, body));
    return toPeerDto(await this.peers.get(guid, peerId, { withSecrets: false }));
  }

  @Delete(':guid/peers/:peerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'peerId', description: 'RustDesk ID of the peer' })
  @ApiOperation({ summary: 'Remove a peer' })
  @ApiNoContentResponse()
  async deletePeer(
    @Param('guid', guidParam) guid: string,
    @Param('peerId') peerId: string,
  ): Promise<void> {
    await this.books.get(guid);
    if ((await this.peers.delete(guid, [peerId])) === 0)
      throw DomainError.notFound(`Peer ${peerId}`);
  }

  // ---- Tags -----------------------------------------------------------------------------

  @Get(':guid/tags')
  @ApiOperation({ summary: 'Tags of a book with usage counts' })
  @ApiOkResponse({ type: [AdminTagDto] })
  async listTags(@Param('guid', guidParam) guid: string): Promise<AdminTagDto[]> {
    await this.books.get(guid);
    return (await this.tags.list(guid, { withCounts: true })).map(toTagDto);
  }

  @Post(':guid/tags')
  @ApiOperation({ summary: 'Create a tag' })
  @ApiCreatedResponse({ type: AdminTagDto })
  @ApiConflictResponse({ type: AdminErrorDto })
  async addTag(
    @Param('guid', guidParam) guid: string,
    @Body() body: CreateTagDto,
  ): Promise<AdminTagDto> {
    await this.books.get(guid);
    await this.tags.add(guid, body.name, body.color, 'conflict');
    return this.tag(guid, body.name);
  }

  @Patch(':guid/tags/:name')
  @ApiParam({ name: 'name', description: 'Current tag name (URL-encoded)' })
  @ApiOperation({ summary: 'Rename a tag and/or change its color; peers follow the rename' })
  @ApiOkResponse({ type: AdminTagDto })
  async updateTag(
    @Param('guid', guidParam) guid: string,
    @Param('name') name: string,
    @Body() body: UpdateTagDto,
  ): Promise<AdminTagDto> {
    await this.books.get(guid);
    if (body.color !== undefined) await this.tags.setColor(guid, name, body.color);
    const finalName = body.name ?? name;
    if (body.name !== undefined) await this.tags.rename(guid, name, body.name);
    return this.tag(guid, finalName);
  }

  @Delete(':guid/tags/:name')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'name', description: 'Tag name (URL-encoded)' })
  @ApiOperation({ summary: 'Delete a tag; it is removed from every peer' })
  @ApiNoContentResponse()
  async deleteTag(
    @Param('guid', guidParam) guid: string,
    @Param('name') name: string,
  ): Promise<void> {
    await this.books.get(guid);
    if ((await this.tags.delete(guid, [name])) === 0) throw DomainError.notFound(`Tag "${name}"`);
  }

  private async tag(guid: string, name: string): Promise<AdminTagDto> {
    const tag = (await this.tags.list(guid, { withCounts: true })).find((t) => t.name === name);
    if (!tag) throw DomainError.notFound(`Tag "${name}"`);
    return toTagDto(tag);
  }

  /** The admin API may set a shared book's password (write-only); personal books hold client hashes only. */
  private peerFields(kind: AddressBookKind, body: Omit<CreatePeerDto, 'peerId'>): PeerFields {
    const { password, ...rest } = body;
    if (password !== undefined && kind !== AddressBookKind.SHARED) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Only shared address books store a password',
        [{ field: 'password', message: 'not allowed for personal address books' }],
      );
    }
    return { ...rest, ...(password !== undefined ? { password } : {}) };
  }
}
