import { type BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';

/** Logs the start of a graceful shutdown (jobs stop, HTTP drains, Prisma disconnects after it). */
@Injectable()
export class LifecycleLogger implements BeforeApplicationShutdown {
  private readonly logger = new Logger('Lifecycle');

  beforeApplicationShutdown(signal?: string): void {
    this.logger.log({ signal }, 'Shutting down');
  }
}
