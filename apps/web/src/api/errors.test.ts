import { ApiError, errorMessage, fieldErrorsOf, parseRetryAfter, toApiError } from './errors';

const response = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers });

describe('toApiError', () => {
  it('parses the API error envelope', () => {
    const error = toApiError(response(422), {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid request',
        details: [{ field: 'peerId', message: 'must not be empty' }],
      },
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details).toEqual([{ field: 'peerId', message: 'must not be empty' }]);
  });

  it('never exposes a non-envelope body (HTML error pages, stack traces)', () => {
    const error = toApiError(response(502), '<html><body>Bad Gateway nginx</body></html>');
    expect(error.message).toBe('The server ran into a problem. Try again in a moment.');
    expect(error.code).toBe('UNKNOWN');
  });

  it('hides internal text of 5xx even in the envelope', () => {
    const error = toApiError(response(500), {
      error: { code: 'INTERNAL_ERROR', message: 'TypeError: x is undefined at foo.ts:12' },
    });
    expect(error.message).not.toContain('TypeError');
    expect(error.code).toBe('INTERNAL_ERROR');
  });

  it('reads Retry-After on 429', () => {
    const error = toApiError(response(429, { 'Retry-After': '30' }), {
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
    expect(error.retryAfterSeconds).toBe(30);
    expect(errorMessage(error)).toBe('Too many requests. Try again in 30 s.');
  });
});

describe('retry policy flags', () => {
  it('retries network failures and 5xx, never 4xx', () => {
    expect(ApiError.network().isRetryable).toBe(true);
    expect(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x').isRetryable).toBe(true);
    expect(new ApiError(404, 'NOT_FOUND', 'x').isRetryable).toBe(false);
    expect(new ApiError(429, 'RATE_LIMITED', 'x').isRetryable).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('accepts seconds and HTTP dates', () => {
    const now = new Date('2026-10-03T12:00:00Z');
    expect(parseRetryAfter('5', now)).toBe(5);
    expect(parseRetryAfter('Sat, 03 Oct 2026 12:01:00 GMT', now)).toBe(60);
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter('soon', now)).toBeNull();
  });
});

describe('fieldErrorsOf', () => {
  it('maps details to top-level form fields, first message wins', () => {
    const error = new ApiError(422, 'VALIDATION_FAILED', 'Invalid', [
      { field: 'tags.0', message: 'too long' },
      { field: 'tags.1', message: 'empty' },
      { field: 'alias', message: 'too long' },
    ]);
    expect(fieldErrorsOf(error)).toEqual({ tags: 'too long', alias: 'too long' });
    expect(fieldErrorsOf(new Error('x'))).toEqual({});
  });
});
