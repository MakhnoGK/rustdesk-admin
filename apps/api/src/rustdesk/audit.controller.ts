import { Body, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditIngestService } from '../audit/audit-ingest.service';
import { RustdeskController } from '../common/decorators/controllers';
import { DomainError } from '../common/errors/domain-error';
import { RustdeskErrorDto } from '../common/errors/error.dto';
import { DeviceCidrGuard } from '../common/http/device-cidr.guard';
import { RateLimit } from '../common/throttling/throttling';
import { AuditKind } from '../generated/prisma/client';
import { AuditAlarmRequestDto, AuditConnRequestDto, AuditFileRequestDto } from './dto/device.dto';
import { decodeAuditRecord } from './mappers/audit.mapper';

const UNAUTHENTICATED =
  'Unauthenticated by protocol: the client sends no Authorization header. Success is HTTP 200 with an EMPTY body ' +
  '(a non-empty 200 is retried by the client). A repeated nonce is a no-op. 4xx is final; 5xx is retried for ~2 minutes.';

/**
 * Audit records posted by the CONTROLLED device. Verified against rustdesk master e5bc204,
 * src/server/connection.rs (post_conn_audit, post_file_audit, post_alarm_audit, post_audit_async).
 *
 *   POST /api/audit/conn  {"id","uuid","conn_id","session_id","nonce", "action":"new","ip"}
 *                         {..., "peer":["<initiator id>","<initiator name>"], "type"}   (no action)
 *                         {..., "action":"close"}
 *   POST /api/audit/file  {"id","uuid","peer_id","conn_id","type","path","is_file","info","nonce"}
 *   POST /api/audit/alarm {"id","uuid","typ","info","conn_id","nonce","conn_audit_ref"?}
 */
@RustdeskController('audit')
@UseGuards(DeviceCidrGuard)
@RateLimit('device')
@ApiOkResponse({ description: 'Empty body' })
@ApiBadRequestResponse({
  type: RustdeskErrorDto,
  description: 'Malformed record (stored with the MALFORMED flag)',
})
@ApiForbiddenResponse({
  type: RustdeskErrorDto,
  description: 'Source address outside DEVICE_ALLOWED_CIDRS',
})
export class RustdeskAuditController {
  constructor(private readonly ingest: AuditIngestService) {}

  @Post('conn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Connection audit record (new / peer / close)',
    description: UNAUTHENTICATED,
  })
  @ApiBody({ type: AuditConnRequestDto })
  conn(@Body() body: unknown, @Req() req: Request): Promise<void> {
    return this.store(AuditKind.CONN, body, req);
  }

  @Post('file')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'File transfer audit record', description: UNAUTHENTICATED })
  @ApiBody({ type: AuditFileRequestDto })
  file(@Body() body: unknown, @Req() req: Request): Promise<void> {
    return this.store(AuditKind.FILE, body, req);
  }

  @Post('alarm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Security alarm audit record', description: UNAUTHENTICATED })
  @ApiBody({ type: AuditAlarmRequestDto })
  alarm(@Body() body: unknown, @Req() req: Request): Promise<void> {
    return this.store(AuditKind.ALARM, body, req);
  }

  private async store(kind: AuditKind, body: unknown, req: Request): Promise<void> {
    // Event time is the receipt time: RustDesk audit records carry no timestamp.
    const receivedAt = new Date();
    const result = await this.ingest.ingest(decodeAuditRecord(kind, body), {
      sourceIp: req.ip ?? null,
      receivedAt,
    });
    if (result.outcome === 'malformed') throw DomainError.badRequest(result.reason);
  }
}
