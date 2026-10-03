import { applyDecorators, Controller, UseGuards, UsePipes } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ADMIN_COOKIE_NAME } from '../../auth/auth.types';
import { AdminAuthGuard, AdminOriginGuard } from '../../auth/guards';
import { AdminErrorDto, RustdeskErrorDto } from '../errors/error.dto';
import { adminValidationPipe, rustdeskValidationPipe } from '../pipes/validation';

/**
 * A RustDesk-facing controller under `/api/...`: lenient validation, string errors.
 * Authentication is added per route (some RustDesk endpoints are unauthenticated by protocol).
 */
export function RustdeskController(path = ''): ClassDecorator {
  return applyDecorators(
    Controller(path ? `api/${path}` : 'api'),
    ApiTags('rustdesk'),
    UsePipes(rustdeskValidationPipe),
    ApiTooManyRequestsResponse({ type: RustdeskErrorDto, description: 'Rate limited' }),
  );
}

/** An admin controller under `/api/admin/...`: cookie auth, role ADMIN, Origin check, strict validation. */
export function AdminController(path: string): ClassDecorator {
  return applyDecorators(
    Controller(`api/admin/${path}`),
    ApiTags('admin'),
    ApiCookieAuth(ADMIN_COOKIE_NAME),
    UseGuards(AdminOriginGuard, AdminAuthGuard),
    UsePipes(adminValidationPipe),
    ApiUnauthorizedResponse({
      type: AdminErrorDto,
      description: 'Not signed in or session expired',
    }),
    ApiForbiddenResponse({
      type: AdminErrorDto,
      description: 'Not an administrator, or Origin not allowed',
    }),
    ApiUnprocessableEntityResponse({ type: AdminErrorDto, description: 'Validation failed' }),
    ApiTooManyRequestsResponse({ type: AdminErrorDto, description: 'Rate limited' }),
  );
}
