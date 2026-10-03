import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '../../generated/prisma/client';
import { DomainError, ErrorCode, ValidationFailedError } from './domain-error';
import { errorNamespace, normalizeError, renderError } from './error-format';

describe('errorNamespace', () => {
  it.each([
    ['/api/admin', 'admin'],
    ['/api/admin/users', 'admin'],
    ['/api/administrator', 'rustdesk'],
    ['/api/login', 'rustdesk'],
    ['/api/audit/conn', 'rustdesk'],
    ['/api/health/ready', 'health'],
    ['/unknown', 'rustdesk'],
  ])('%s → %s', (path, ns) => {
    expect(errorNamespace(path)).toBe(ns);
  });
});

describe('normalizeError + renderError', () => {
  it('renders domain errors as a string for RustDesk and an object for admin', () => {
    const err = DomainError.forbidden(ErrorCode.AB_READ_ONLY, 'read-only');
    expect(renderError('rustdesk', normalizeError(err))).toEqual({
      status: 403,
      body: { error: 'read-only' },
    });
    expect(renderError('admin', normalizeError(err))).toEqual({
      status: 403,
      body: { error: { code: 'AB_READ_ONLY', message: 'read-only' } },
    });
  });

  it('validation failures are 400 for RustDesk and 422 with details for admin', () => {
    const err = new ValidationFailedError([{ field: 'name', message: 'name must be a string' }]);
    expect(renderError('rustdesk', normalizeError(err))).toEqual({
      status: 400,
      body: { error: 'Invalid request: name must be a string' },
    });
    expect(renderError('admin', normalizeError(err))).toEqual({
      status: 422,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid request: name must be a string',
          details: [{ field: 'name', message: 'name must be a string' }],
        },
      },
    });
  });

  it('maps Nest HTTP exceptions to stable codes', () => {
    expect(normalizeError(new NotFoundException('Cannot GET /x'))).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Cannot GET /x',
    });
    expect(normalizeError(new BadRequestException(['a', 'b']))).toMatchObject({
      status: 400,
      message: 'a; b',
    });
    expect(normalizeError(new ThrottlerException())).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('maps Prisma unique and not-found errors, hides everything else', () => {
    const unique = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const missing = new Prisma.PrismaClientKnownRequestError('gone', {
      code: 'P2025',
      clientVersion: 'x',
    });
    const other = new Prisma.PrismaClientKnownRequestError('secret detail', {
      code: 'P1001',
      clientVersion: 'x',
    });
    expect(normalizeError(unique)).toMatchObject({ status: 409, code: 'ALREADY_EXISTS' });
    expect(normalizeError(missing)).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(normalizeError(other)).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      internal: true,
    });
    expect(normalizeError(new Error('connection string postgres://user:pw@x'))).toMatchObject({
      status: 500,
      message: 'Internal server error',
    });
  });

  it('maps body-parser errors', () => {
    expect(normalizeError({ status: 413, type: 'entity.too.large', message: 'big' })).toMatchObject(
      { status: 413, code: 'PAYLOAD_TOO_LARGE' },
    );
    expect(
      normalizeError({ status: 400, type: 'entity.parse.failed', message: 'x' }),
    ).toMatchObject({ status: 400, message: 'Request body is not valid JSON' });
  });

  it('omits empty details', () => {
    const err = new DomainError(ErrorCode.CONFLICT, HttpStatus.CONFLICT, 'c', []);
    expect(renderError('admin', normalizeError(err)).body).toEqual({
      error: { code: 'CONFLICT', message: 'c' },
    });
  });
});
