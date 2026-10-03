import { Injectable, Logger } from '@nestjs/common';
import { addSeconds } from '../common/time/time';
import { AppConfig } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

const RETENTION_LOCK: [number, number] = [0x52440001, 2];
const BATCH_SIZE = 5_000;
/** Upper bound per run; the next run continues where this one stopped. */
const MAX_BATCHES_PER_RUN = 200;
/** Expired tokens are kept this long for the admin's token history, then purged. */
const EXPIRED_TOKEN_KEEP_DAYS = 30;

/**
 * AUDIT_RETENTION_DAYS > 0: deletes audit events older than the window, one short transaction
 * per batch so the table is never locked for long. Sessions are kept (their event links go
 * null). Also purges long-expired tokens.
 */
@Injectable()
export class AuditRetentionService {
  private readonly logger = new Logger(AuditRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** Returns the number of audit events deleted. */
  async run(now = new Date()): Promise<number> {
    const days = this.config.get('AUDIT_RETENTION_DAYS');
    if (days <= 0) return 0;
    const cutoff = addSeconds(now, -days * 86_400);

    let deleted = 0;
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const n = await this.prisma.$transaction(async (tx) => {
        // Another instance deleting right now: let it finish the work.
        const [lock] = await tx.$queryRaw<[{ locked: boolean }]>`
          SELECT pg_try_advisory_xact_lock(${RETENTION_LOCK[0]}::int, ${RETENTION_LOCK[1]}::int) AS locked`;
        if (!lock?.locked) return -1;
        return tx.$executeRaw`
          DELETE FROM audit_events
          WHERE id IN (SELECT id FROM audit_events WHERE received_at < ${cutoff} ORDER BY received_at LIMIT ${BATCH_SIZE})`;
      });
      if (n < 0) break;
      deleted += n;
      if (n < BATCH_SIZE) break;
    }

    const tokens = await this.prisma.authToken.deleteMany({
      where: { expiresAt: { lt: addSeconds(now, -EXPIRED_TOKEN_KEEP_DAYS * 86_400) } },
    });
    this.logger.log(
      { deletedEvents: deleted, deletedTokens: tokens.count, cutoff: cutoff.toISOString() },
      'Audit retention run finished',
    );
    return deleted;
  }
}
