import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  DomainError,
  type ErrorCode,
  ErrorCode as Codes,
  type ErrorDetail,
  ValidationFailedError,
} from './domain-error';

/** Which wire format an error is rendered in, chosen by the request path. */
export type ErrorNamespace = 'admin' | 'rustdesk' | 'health';

export const ADMIN_PREFIX = '/api/admin';
export const HEALTH_PREFIX = '/api/health';

export function errorNamespace(path: string): ErrorNamespace {
  if (path === ADMIN_PREFIX || path.startsWith(`${ADMIN_PREFIX}/`)) return 'admin';
  if (path === HEALTH_PREFIX || path.startsWith(`${HEALTH_PREFIX}/`)) return 'health';
  return 'rustdesk';
}

export interface NormalizedError {
  status: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
  /** True for unexpected failures: logged with stack, message hidden from the client. */
  internal: boolean;
}

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: Codes.BAD_REQUEST,
  401: Codes.UNAUTHORIZED,
  403: Codes.FORBIDDEN,
  404: Codes.NOT_FOUND,
  409: Codes.CONFLICT,
  413: Codes.PAYLOAD_TOO_LARGE,
  422: Codes.VALIDATION_FAILED,
  429: Codes.RATE_LIMITED,
  503: Codes.SERVICE_UNAVAILABLE,
};

function codeForStatus(status: number): ErrorCode {
  return STATUS_CODES[status] ?? (status >= 500 ? Codes.INTERNAL_ERROR : Codes.BAD_REQUEST);
}

const INTERNAL: NormalizedError = {
  status: HttpStatus.INTERNAL_SERVER_ERROR,
  code: Codes.INTERNAL_ERROR,
  message: 'Internal server error',
  internal: true,
};

function httpExceptionMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object' && 'message' in response) {
    const { message } = response;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.map(String).join('; ');
  }
  return exception.message;
}

/** Errors thrown by Express body parsing carry `status` and `type`. */
function isBodyParserError(e: unknown): e is { status: number; type: string; message: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { status?: unknown }).status === 'number' &&
    typeof (e as { type?: unknown }).type === 'string'
  );
}

/** Maps any thrown value to a status, a stable code and a client-safe message. */
export function normalizeError(exception: unknown): NormalizedError {
  if (exception instanceof DomainError) {
    return {
      status: exception.status,
      code: exception.code,
      message: exception.message,
      details: exception.details,
      internal: false,
    };
  }
  if (exception instanceof ValidationFailedError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: Codes.VALIDATION_FAILED,
      message: exception.message,
      details: exception.details,
      internal: false,
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status >= 500) return { ...INTERNAL, status, code: codeForStatus(status) };
    return {
      status,
      code: codeForStatus(status),
      message: httpExceptionMessage(exception),
      internal: false,
    };
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        code: Codes.ALREADY_EXISTS,
        message: 'Resource already exists',
        internal: false,
      };
    }
    if (exception.code === 'P2025') {
      return {
        status: HttpStatus.NOT_FOUND,
        code: Codes.NOT_FOUND,
        message: 'Resource not found',
        internal: false,
      };
    }
    return INTERNAL;
  }
  if (isBodyParserError(exception) && exception.status >= 400 && exception.status < 500) {
    const message =
      exception.type === 'entity.too.large'
        ? 'Request body too large'
        : exception.type === 'entity.parse.failed'
          ? 'Request body is not valid JSON'
          : 'Invalid request body';
    return {
      status: exception.status,
      code: codeForStatus(exception.status),
      message,
      internal: false,
    };
  }
  return INTERNAL;
}

export interface AdminErrorBody {
  error: { code: ErrorCode; message: string; details?: ErrorDetail[] };
}

export interface RustdeskErrorBody {
  error: string;
}

/**
 * Renders a normalized error for a namespace and returns the final status and body.
 * Admin validation failures are 422 with details; RustDesk validation failures are 400.
 */
export function renderError(
  namespace: ErrorNamespace,
  error: NormalizedError,
): { status: number; body: AdminErrorBody | RustdeskErrorBody } {
  if (namespace === 'rustdesk') {
    const status = error.code === Codes.VALIDATION_FAILED ? HttpStatus.BAD_REQUEST : error.status;
    return { status, body: { error: error.message } };
  }
  const body: AdminErrorBody = { error: { code: error.code, message: error.message } };
  if (error.details && error.details.length > 0) body.error.details = error.details;
  return { status: error.status, body };
}
