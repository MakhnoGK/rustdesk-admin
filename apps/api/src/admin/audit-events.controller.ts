import { Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { AuditQueryService } from '../audit/audit-query.service';
import { AdminController } from '../common/decorators/controllers';
import { AuditKind } from '../generated/prisma/client';
import { toAuditEventDto } from './admin.mappers';
import { AuditEventListQueryDto, AuditEventPageDto } from './dto/sessions.dto';

const KINDS = { conn: AuditKind.CONN, file: AuditKind.FILE, alarm: AuditKind.ALARM } as const;

@AdminController('audit-events')
export class AdminAuditEventsController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @ApiOperation({
    summary: 'Raw audit events as received from devices',
    description: '`from`/`to` filter `receivedAt` as `[from, to)`.',
  })
  @ApiOkResponse({ type: AuditEventPageDto })
  async list(@Query() q: AuditEventListQueryDto): Promise<AuditEventPageDto> {
    const page = await this.audit.list({
      kind: q.kind ? KINDS[q.kind] : undefined,
      deviceId: q.deviceId,
      sessionId: q.sessionId,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      page: q.page,
      pageSize: q.pageSize,
      direction: q.sort === 'receivedAt:asc' ? 'asc' : 'desc',
    });
    return { ...page, data: page.data.map(toAuditEventDto) };
  }
}
