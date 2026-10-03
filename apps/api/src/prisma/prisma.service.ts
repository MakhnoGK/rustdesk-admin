import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../config/app-config.service';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma client over the `pg` driver adapter. Connections are opened lazily on the first
 * query, so building the application (e.g. for OpenAPI emission) needs no database.
 *
 * Every connection runs with TimeZone=UTC: the adapter exchanges timestamps without an offset,
 * so on a server whose default time zone is not UTC they would shift against now(),
 * CURRENT_TIMESTAMP and the UTC buckets of the stats queries.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL'),
        options: '-c TimeZone=UTC',
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connections closed');
  }
}

/** The client handed to `$transaction(async (tx) => ...)` callbacks. */
export type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
