import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../../config/app-config.service';
import { DomainError, ErrorCode } from '../errors/domain-error';
import { ipAllowed, parseCidr } from './cidr';

/**
 * Optional allowlist for the unauthenticated device endpoints (audit, heartbeat, sysinfo).
 * With DEVICE_ALLOWED_CIDRS empty every source is accepted.
 */
@Injectable()
export class DeviceCidrGuard implements CanActivate {
  private readonly logger = new Logger(DeviceCidrGuard.name);
  private readonly ranges;

  constructor(config: AppConfig) {
    this.ranges = config.get('DEVICE_ALLOWED_CIDRS').map(parseCidr);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (ipAllowed(req.ip, this.ranges)) return true;
    this.logger.warn(
      { ip: req.ip, path: req.path },
      'Device request rejected by DEVICE_ALLOWED_CIDRS',
    );
    throw new DomainError(
      ErrorCode.DEVICE_NOT_ALLOWED,
      HttpStatus.FORBIDDEN,
      'Source address not allowed',
    );
  }
}
