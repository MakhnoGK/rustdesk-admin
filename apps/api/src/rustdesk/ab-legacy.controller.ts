import { Body, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AbPeersService } from '../address-books/ab-peers.service';
import { AbTagsService } from '../address-books/ab-tags.service';
import { AddressBooksService } from '../address-books/address-books.service';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth, RustdeskAuthGuard } from '../auth/guards';
import { RustdeskController } from '../common/decorators/controllers';
import { RustdeskErrorDto } from '../common/errors/error.dto';
import { LegacyAbDto } from './dto/ab.dto';
import { decodeLegacyBook, encodeLegacyBook } from './mappers/ab.mapper';

/**
 * Legacy address book for old clients (used only when `POST /api/ab/personal` answers 404, which
 * this server never does). Served from the caller's personal book so both modes share data.
 * Verified against rustdesk master e5bc204, flutter/lib/models/ab_model.dart (LegacyAb).
 *
 *   GET  /api/ab → {"data": "<JSON string of {tags, peers, tag_colors}>"}
 *   POST /api/ab   {"data": "<same>"} → 200 empty; replaces the whole book
 */
@RustdeskController('ab')
@UseGuards(RustdeskAuthGuard)
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: RustdeskErrorDto })
export class RustdeskLegacyAbController {
  constructor(
    private readonly books: AddressBooksService,
    private readonly peers: AbPeersService,
    private readonly tags: AbTagsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Legacy: the whole personal address book as one JSON string' })
  @ApiOkResponse({ type: LegacyAbDto })
  async get(@CurrentAuth() auth: AuthContext): Promise<LegacyAbDto> {
    const book = await this.books.getOrCreatePersonal(auth.user.id);
    const [peers, tags] = await Promise.all([
      this.peers.listAll(book.guid, { withSecrets: true }),
      this.tags.list(book.guid),
    ]);
    return encodeLegacyBook(peers, tags);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Legacy: replace the whole personal address book',
    description: 'HTTP 200 with an empty body.',
  })
  @ApiBody({ type: LegacyAbDto })
  @ApiOkResponse({ description: 'Empty body' })
  async replace(@Body() body: unknown, @CurrentAuth() auth: AuthContext): Promise<void> {
    const decoded = decodeLegacyBook(body);
    const book = await this.books.getOrCreatePersonal(auth.user.id);
    await this.peers.replaceAll(book.guid, decoded);
  }
}
