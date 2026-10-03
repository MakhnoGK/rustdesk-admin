import { Body, Header, HttpCode, HttpStatus, Logger, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RustdeskController } from '../common/decorators/controllers';
import { DomainError } from '../common/errors/domain-error';
import { RustdeskErrorDto } from '../common/errors/error.dto';
import { DeviceCidrGuard } from '../common/http/device-cidr.guard';
import { RateLimit } from '../common/throttling/throttling';
import { DevicesService } from '../devices/devices.service';
import { DisconnectsService } from '../disconnects/disconnects.service';
import { SessionReconciliationService } from '../sessions/session-reconciliation.service';
import { HeartbeatRequestDto, HeartbeatResponseDto, SysinfoRequestDto } from './dto/device.dto';
import { decodeHeartbeat, decodeSysinfo, encodeHeartbeatResponse } from './mappers/device.mapper';

const TEXT = 'text/plain; charset=utf-8';

/**
 * Device heartbeat and system info, unauthenticated by protocol. Verified against rustdesk
 * master e5bc204, src/hbbs_http/sync.rs.
 *
 *   POST /api/heartbeat    {"id","uuid","ver","conns"?,"modified_at"} → {} | {"disconnect":[conn_id]} | {"sysinfo":1}
 *   POST /api/sysinfo      {system info} → text "SYSINFO_UPDATED" (or "ID_NOT_FOUND": client retries later)
 *   POST /api/sysinfo_ver  (empty body)  → text: the server-wide sysinfo version token
 */
@RustdeskController()
@UseGuards(DeviceCidrGuard)
@RateLimit('device')
export class RustdeskDeviceController {
  private readonly logger = new Logger(RustdeskDeviceController.name);

  constructor(
    private readonly devices: DevicesService,
    private readonly reconciliation: SessionReconciliationService,
    private readonly disconnects: DisconnectsService,
  ) {}

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Device heartbeat (~3 s with live connections, ~15 s otherwise)',
    description:
      'Updates the device, reconciles its sessions against `conns`, and delivers pending remote disconnects once. ' +
      '`strategy`/`modified_at` (RustDesk Pro) are never sent.',
  })
  @ApiBody({ type: HeartbeatRequestDto })
  @ApiOkResponse({ type: HeartbeatResponseDto })
  @ApiBadRequestResponse({ type: RustdeskErrorDto })
  async heartbeat(@Body() body: unknown, @Req() req: Request): Promise<Record<string, unknown>> {
    const receivedAt = new Date();
    const hb = decodeHeartbeat(body);
    if (!hb.uuid) throw DomainError.badRequest('Missing or invalid field: uuid');

    const { sysinfoMissing } = await this.devices.recordHeartbeat({
      uuid: hb.uuid,
      rustdeskId: hb.rustdeskId,
      heartbeatVersion: hb.ver,
      ip: req.ip ?? null,
      receivedAt,
    });
    await this.reconciliation.onHeartbeat(hb.uuid, hb.conns, receivedAt);
    const disconnect = await this.disconnects.deliver(hb.uuid, receivedAt);
    return encodeHeartbeatResponse({ disconnect, sysinfoMissing });
  }

  @Post('sysinfo')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', TEXT)
  @ApiOperation({
    summary: 'Upload system info',
    description: 'Answers plain text. Credential-like fields are redacted before storage.',
  })
  @ApiBody({ type: SysinfoRequestDto })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    description:
      '`SYSINFO_UPDATED`, or `ID_NOT_FOUND` when id/uuid are missing (the client retries later)',
    schema: { type: 'string', enum: ['SYSINFO_UPDATED', 'ID_NOT_FOUND'] },
  })
  async sysinfo(@Body() body: unknown, @Req() req: Request): Promise<string> {
    const info = decodeSysinfo(body);
    if (!info.uuid || !info.rustdeskId) {
      this.logger.warn({ ip: req.ip }, 'sysinfo without id/uuid rejected');
      return 'ID_NOT_FOUND';
    }
    await this.devices.recordSysinfo({
      uuid: info.uuid,
      rustdeskId: info.rustdeskId,
      hostname: info.hostname,
      username: info.username,
      os: info.os,
      version: info.version,
      sysinfo: info.sysinfo,
      ip: req.ip ?? null,
      receivedAt: new Date(),
    });
    return 'SYSINFO_UPDATED';
  }

  @Post('sysinfo_ver')
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', TEXT)
  @ApiOperation({
    summary: 'Server-wide sysinfo version token',
    description:
      'The client posts an empty body and compares the answer with the token stored at its last upload; a different value makes it upload again.',
  })
  @ApiProduces('text/plain')
  @ApiOkResponse({ schema: { type: 'string' } })
  sysinfoVersion(): Promise<string> {
    return this.devices.sysinfoVersion();
  }
}
