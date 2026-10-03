import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { type ErrorDetail, ValidationFailedError } from '../errors/domain-error';

/** Flattens class-validator errors into `[{field, message}]` with dotted paths. */
export function flattenValidationErrors(errors: ValidationError[], parent = ''): ErrorDetail[] {
  const out: ErrorDetail[] = [];
  for (const error of errors) {
    const field = parent ? `${parent}.${error.property}` : error.property;
    for (const message of Object.values(error.constraints ?? {})) {
      out.push({ field, message });
    }
    if (error.children && error.children.length > 0) {
      out.push(...flattenValidationErrors(error.children, field));
    }
  }
  return out;
}

const exceptionFactory = (errors: ValidationError[]) =>
  new ValidationFailedError(flattenValidationErrors(errors));

/** Admin API: strict — unknown properties are rejected (422). */
export const adminValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory,
});

/**
 * RustDesk API: lenient — clients add fields between versions, so unknown properties are
 * stripped instead of rejected. Failures render as 400 `{"error": "..."}`.
 */
export const rustdeskValidationPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
  exceptionFactory,
});
