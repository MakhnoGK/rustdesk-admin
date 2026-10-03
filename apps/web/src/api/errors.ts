import { z } from 'zod';

// The admin API's error envelope: {"error": {"code", "message", "details"?: [{"field", "message"}]}}.
const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  }),
});

export interface FieldIssue {
  field: string;
  message: string;
}

/** Every failed request becomes an ApiError: an HTTP error from the API, or a network failure. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    /** HTTP status; 0 for network failures. */
    readonly status: number,
    /** The API's error code (`VALIDATION_FAILED`, `LAST_ADMIN`, ...), `NETWORK_ERROR` or `UNKNOWN`. */
    readonly code: string,
    message: string,
    readonly details: FieldIssue[] = [],
    /** Seconds from the `Retry-After` header of a 429, if any. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }

  static network(): ApiError {
    return new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.');
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  /** Worth retrying automatically: network failures and 5xx. Never 4xx. */
  get isRetryable(): boolean {
    return this.isNetwork || this.isServerError;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function hasStatus(error: unknown, status: number): boolean {
  return isApiError(error) && error.status === status;
}

/** `Retry-After` as seconds: either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now: Date = new Date()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now.getTime()) / 1000));
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Your session has ended. Sign in again.';
  if (status === 403) return 'You do not have access to this.';
  if (status === 404) return 'Not found.';
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  if (status >= 500) return 'The server ran into a problem. Try again in a moment.';
  return 'The request could not be completed.';
}

/**
 * Builds an ApiError from a failed response and its (already parsed) body. Bodies that are not the
 * API's envelope — proxy error pages, HTML, stack traces — are never shown: a generic message is used.
 */
export function toApiError(response: Response, body: unknown): ApiError {
  const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
  const parsed = errorBodySchema.safeParse(body);
  if (!parsed.success || response.status >= 500) {
    const code = parsed.success ? parsed.data.error.code : 'UNKNOWN';
    return new ApiError(response.status, code, fallbackMessage(response.status), [], retryAfter);
  }
  const { code, message, details } = parsed.data.error;
  return new ApiError(response.status, code, message, details ?? [], retryAfter);
}

/** Safe text for a toast or an alert. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 429 && error.retryAfterSeconds !== null) {
      return `Too many requests. Try again in ${error.retryAfterSeconds} s.`;
    }
    return error.message;
  }
  return 'Something went wrong. Try again.';
}

/** 422 details (and the field of a 409) by form field name. */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  if (!isApiError(error)) return {};
  const out: Record<string, string> = {};
  for (const d of error.details) {
    // The API reports nested fields as `tags.0` or `body.username`; forms use the top-level name.
    const name = d.field.split('.')[0] ?? d.field;
    out[name] ??= d.message;
  }
  return out;
}
