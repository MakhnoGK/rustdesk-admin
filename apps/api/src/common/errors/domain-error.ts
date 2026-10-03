import { HttpStatus } from '@nestjs/common';

/** Stable machine-readable error codes. The admin panel switches on these; never rename one. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TWO_FACTOR_UNSUPPORTED: 'TWO_FACTOR_UNSUPPORTED',
  USER_DISABLED: 'USER_DISABLED',
  FORBIDDEN: 'FORBIDDEN',
  CSRF_ORIGIN_MISMATCH: 'CSRF_ORIGIN_MISMATCH',
  DEVICE_NOT_ALLOWED: 'DEVICE_NOT_ALLOWED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  LAST_ADMIN: 'LAST_ADMIN',
  SELF_MODIFICATION: 'SELF_MODIFICATION',
  AB_READ_ONLY: 'AB_READ_ONLY',
  AB_PEER_LIMIT: 'AB_PEER_LIMIT',
  SESSION_NOT_ACTIVE: 'SESSION_NOT_ACTIVE',
  RANGE_TOO_LARGE: 'RANGE_TOO_LARGE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  field: string;
  message: string;
}

/**
 * An expected failure raised by domain services. The exception filter renders it in the
 * format of the calling namespace (RustDesk string error or admin error object).
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: HttpStatus,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static notFound(what: string): DomainError {
    return new DomainError(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, `${what} not found`);
  }

  static conflict(code: ErrorCode, message: string): DomainError {
    return new DomainError(code, HttpStatus.CONFLICT, message);
  }

  static forbidden(code: ErrorCode, message: string): DomainError {
    return new DomainError(code, HttpStatus.FORBIDDEN, message);
  }

  static badRequest(message: string, details?: ErrorDetail[]): DomainError {
    return new DomainError(ErrorCode.BAD_REQUEST, HttpStatus.BAD_REQUEST, message, details);
  }

  static unauthorized(message = 'Unauthorized'): DomainError {
    return new DomainError(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED, message);
  }
}

/** Raised by the validation pipes: 400 on RustDesk routes, 422 with details on admin routes. */
export class ValidationFailedError extends Error {
  constructor(readonly details: ErrorDetail[]) {
    super(
      details.length > 0
        ? `Invalid request: ${details.map((d) => d.message).join('; ')}`
        : 'Invalid request',
    );
    this.name = 'ValidationFailedError';
  }
}
