import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { errorNamespace, normalizeError, renderError } from '../errors/error-format';

/**
 * The one global exception filter. RustDesk-facing routes answer `{"error": "<string>"}`;
 * `/api/admin/*` answers `{"error": {"code", "message", "details"?}}`. Health checks keep
 * Terminus' own body. Internal errors are logged with their stack and never leak to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const namespace = errorNamespace(req.path);

    if (namespace === 'health' && exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const normalized = normalizeError(exception);
    if (normalized.internal) {
      this.logger.error(
        { err: exception, method: req.method, path: req.path },
        'Unhandled error while processing request',
      );
    }
    if (res.headersSent) return;
    const { status, body } = renderError(namespace, normalized);
    res.status(status).json(body);
  }
}
