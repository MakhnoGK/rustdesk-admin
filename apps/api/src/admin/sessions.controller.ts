import { Get, Param, Post, Query, Res } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/guards';
import { AdminController } from '../common/decorators/controllers';
import { AdminErrorDto } from '../common/errors/error.dto';
import { PageQueryDto, parseSort } from '../common/pagination/pagination';
import { UuidParamPipe } from '../common/pipes/uuid-param.pipe';
import { DisconnectsService } from '../disconnects/disconnects.service';
import { SESSION_SORT_FIELDS, SessionsQueryService } from '../sessions/sessions-query.service';
import { toAuditEventDto, toDisconnectDto, toSessionDto } from './admin.mappers';
import {
  DisconnectDto,
  SessionDetailDto,
  SessionListQueryDto,
  SessionPageDto,
} from './dto/sessions.dto';

const sessionId = new UuidParamPipe('Session');

@AdminController('sessions')
export class AdminSessionsController {
  constructor(
    private readonly sessions: SessionsQueryService,
    private readonly disconnects: DisconnectsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Session history',
    description: '`from`/`to` filter `startedAt` as `[from, to)`.',
  })
  @ApiOkResponse({ type: SessionPageDto })
  async list(@Query() q: SessionListQueryDto): Promise<SessionPageDto> {
    const page = await this.sessions.list({
      status: q.status,
      deviceId: q.deviceId,
      initiatorId: q.initiatorId,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      minDurationSeconds: q.minDurationSeconds,
      authenticated: q.authenticated,
      page: q.page,
      pageSize: q.pageSize,
      sort: parseSort(q.sort, SESSION_SORT_FIELDS, { field: 'startedAt', direction: 'desc' }),
    });
    return { ...page, data: page.data.map(toSessionDto) };
  }

  @Get('active')
  @ApiOperation({ summary: 'Active sessions, newest first' })
  @ApiOkResponse({ type: SessionPageDto })
  async active(@Query() q: PageQueryDto): Promise<SessionPageDto> {
    const page = await this.sessions.active(q);
    return { ...page, data: page.data.map(toSessionDto) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'A session with its audit events' })
  @ApiOkResponse({ type: SessionDetailDto })
  @ApiNotFoundResponse({ type: AdminErrorDto })
  async get(@Param('id', sessionId) id: string): Promise<SessionDetailDto> {
    const { session, events } = await this.sessions.get(id);
    return { ...toSessionDto(session), events: events.map(toAuditEventDto) };
  }

  @Post(':id/disconnect')
  @ApiOperation({
    summary: 'Request a remote disconnect',
    description:
      'Stored and delivered in the next heartbeat of the target device (`{"disconnect": [conn_id]}`). Works only while the device ' +
      'sends heartbeats; expires after DISCONNECT_TTL_SECONDS. 201 when created, 200 when an undelivered request already exists. ' +
      'The session closes when the client reports the close (ADMIN_DISCONNECT) or by reconciliation.',
  })
  @ApiCreatedResponse({ type: DisconnectDto })
  @ApiOkResponse({ type: DisconnectDto, description: 'An undelivered request already existed' })
  @ApiConflictResponse({ type: AdminErrorDto, description: 'SESSION_NOT_ACTIVE' })
  async disconnect(
    @Param('id', sessionId) id: string,
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DisconnectDto> {
    const { record, created } = await this.disconnects.request(auth.user.id, id);
    res.status(created ? 201 : 200);
    return toDisconnectDto(record);
  }

  @Get(':id/disconnect')
  @ApiOperation({ summary: 'Delivery state of the latest disconnect request' })
  @ApiOkResponse({ type: DisconnectDto })
  @ApiNotFoundResponse({ type: AdminErrorDto })
  async disconnectState(@Param('id', sessionId) id: string): Promise<DisconnectDto> {
    return toDisconnectDto(await this.disconnects.latest(id));
  }

  @Get(':id/disconnects')
  @ApiOperation({
    summary: 'Every disconnect request of a session, newest first',
    description: 'At most 100 entries. Empty when nothing was requested.',
  })
  @ApiOkResponse({ type: [DisconnectDto] })
  @ApiNotFoundResponse({ type: AdminErrorDto })
  async disconnectHistory(@Param('id', sessionId) id: string): Promise<DisconnectDto[]> {
    return (await this.disconnects.history(id)).map(toDisconnectDto);
  }
}
