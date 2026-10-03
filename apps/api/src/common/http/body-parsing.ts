import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { errorNamespace, normalizeError, renderError } from '../errors/error-format';

/** Global ceiling for admin requests. */
const ADMIN_BODY_LIMIT = '1mb';
/** Default for RustDesk-facing routes without a specific entry below. */
const RUSTDESK_DEFAULT_LIMIT = '256kb';

/**
 * Per-endpoint limits for RustDesk-facing routes (first match wins). The legacy address book
 * (`POST /api/ab`) carries the whole book in one body, so it gets the largest allowance.
 */
const RUSTDESK_LIMITS: ReadonlyArray<{ match: (path: string) => boolean; limit: string }> = [
  { match: (p) => p.startsWith('/api/audit/'), limit: '64kb' },
  { match: (p) => p === '/api/heartbeat', limit: '16kb' },
  { match: (p) => p === '/api/sysinfo' || p === '/api/sysinfo_ver', limit: '256kb' },
  { match: (p) => p === '/api/ab', limit: '4mb' },
  { match: (p) => p === '/api/login', limit: '64kb' },
];

/**
 * RustDesk sends 64-bit integers (e.g. `session_id`) as JSON numbers. Integers outside the safe
 * range keep their exact source text instead of being rounded (JSON.parse source access, Node 22+).
 */
const preserveBigIntegers = function (
  _key: string,
  value: unknown,
  context?: { source?: string },
): unknown {
  if (
    typeof value === 'number' &&
    !Number.isSafeInteger(value) &&
    context?.source &&
    /^-?\d+$/.test(context.source)
  ) {
    return context.source;
  }
  return value;
};

class BodyParseError extends Error {
  readonly status = 400;
  readonly type = 'entity.parse.failed';
}

const textParsers = new Map<string, RequestHandler>();
function textParser(limit: string): RequestHandler {
  let parser = textParsers.get(limit);
  if (!parser) {
    // Accept every content type: Flutter posts /api/login without one (it arrives as text/plain).
    parser = express.text({ type: () => true, limit, defaultCharset: 'utf-8' });
    textParsers.set(limit, parser);
  }
  return parser;
}

/**
 * RustDesk-facing body handling: read the body as text whatever the Content-Type, treat an
 * empty body as `{}`, and parse JSON ourselves.
 */
const rustdeskBody: RequestHandler = (req, res, next) => {
  const limit = RUSTDESK_LIMITS.find((l) => l.match(req.path))?.limit ?? RUSTDESK_DEFAULT_LIMIT;
  textParser(limit)(req, res, (err?: unknown) => {
    if (err) return next(err);
    const raw: unknown = req.body;
    if (typeof raw !== 'string' || raw.trim() === '') {
      req.body = {};
      return next();
    }
    try {
      req.body = JSON.parse(raw, preserveBigIntegers) as unknown;
      next();
    } catch {
      next(new BodyParseError('Request body is not valid JSON'));
    }
  });
};

const adminJson = express.json({ limit: ADMIN_BODY_LIMIT });
const adminBody: RequestHandler = (req, res, next) => {
  adminJson(req, res, (err?: unknown) => {
    if (err) return next(err);
    req.body ??= {};
    next();
  });
};

/** Chooses the parser by namespace. Mounted once, before the Nest router. */
export const bodyParsing: RequestHandler = (req, res, next) => {
  if (errorNamespace(req.path) === 'admin') return adminBody(req, res, next);
  return rustdeskBody(req, res, next);
};

/** Renders body-parser failures (400 / 413) in the namespace's error format. */
export const bodyParsingErrorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) return next(err);
  const { status, body } = renderError(errorNamespace(req.path), normalizeError(err));
  res.status(status).json(body);
};
