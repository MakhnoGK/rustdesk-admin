import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AppConfig } from '../config/app-config.service';
import { addSeconds, sqlDurationSeconds } from '../common/time/time';
import { PrismaService } from '../prisma/prisma.service';

/** Advisory-lock key (two-int form) that makes the timeout sweep single-instance. */
const SWEEP_LOCK: [number, number] = [0x52440001, 1];

export interface HeartbeatReconciliation {
  seen: number;
  closed: Array<{ id: string; connId: number }>;
}

/** Liveness-driven session transitions: heartbeat reconciliation and the timeout sweep. */
@Injectable()
export class SessionReconciliationService {
  private readonly logger = new Logger(SessionReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /**
   * A heartbeat lists the conn IDs alive on the device. Active sessions in the list get
   * `last_seen_at = now`; active sessions missing from it, and older than the grace period,
   * are closed as HEARTBEAT_RECONCILED with an estimated duration.
   */
  async onHeartbeat(
    deviceUuid: string,
    conns: number[],
    now: Date,
  ): Promise<HeartbeatReconciliation> {
    const graceCutoff = addSeconds(now, -this.config.get('HEARTBEAT_GRACE_SECONDS'));
    const connArray = Prisma.sql`${conns}::int[]`;

    const seen =
      conns.length === 0
        ? 0
        : await this.prisma.$executeRaw`
            UPDATE sessions SET last_seen_at = ${now}, updated_at = ${now}
            WHERE status = 'ACTIVE' AND device_uuid = ${deviceUuid} AND conn_id = ANY(${connArray})`;

    const closed = await this.prisma.$queryRaw<
      Array<{ id: string; connId: number; durationSeconds: number }>
    >`
      UPDATE sessions
      SET status = 'CLOSED',
          close_reason = 'HEARTBEAT_RECONCILED',
          closed_at = ${now},
          duration_seconds = ${sqlDurationSeconds(Prisma.raw('started_at'), Prisma.sql`${now}::timestamptz`)},
          duration_estimated = true,
          updated_at = ${now}
      WHERE status = 'ACTIVE'
        AND device_uuid = ${deviceUuid}
        AND NOT (conn_id = ANY(${connArray}))
        AND started_at < ${graceCutoff}
      RETURNING id, conn_id AS "connId", duration_seconds AS "durationSeconds"`;

    for (const s of closed) {
      this.logger.log(
        {
          sessionId: s.id,
          deviceUuid,
          connId: s.connId,
          transition: 'ACTIVE→CLOSED',
          reason: 'HEARTBEAT_RECONCILED',
          durationSeconds: s.durationSeconds,
        },
        'Session transition',
      );
    }
    return { seen, closed: closed.map(({ id, connId }) => ({ id, connId })) };
  }

  /**
   * Times out active sessions without liveness evidence: `coalesce(last_seen_at, started_at)`
   * older than SESSION_TIMEOUT_MINUTES. One set-based UPDATE under a transaction-scoped
   * advisory lock, so concurrent instances never process the same rows twice. Returns the
   * number of sessions timed out, or null when another instance holds the lock.
   */
  async sweepTimeouts(now = new Date()): Promise<number | null> {
    const timeoutSeconds = this.config.get('SESSION_TIMEOUT_MINUTES') * 60;
    const cutoff = addSeconds(now, -timeoutSeconds);
    const interval = Prisma.sql`make_interval(secs => ${timeoutSeconds})`;

    return this.prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(${SWEEP_LOCK[0]}::int, ${SWEEP_LOCK[1]}::int) AS locked`;
      if (!lock?.locked) {
        this.logger.debug('Timeout sweep skipped: another instance holds the lock');
        return null;
      }
      const closedAt = Prisma.sql`COALESCE(last_seen_at, started_at + ${interval})`;
      const rows = await tx.$queryRaw<Array<{ id: string; deviceUuid: string; connId: number }>>`
        UPDATE sessions
        SET status = 'TIMEOUT',
            close_reason = 'TIMEOUT',
            closed_at = ${closedAt},
            duration_seconds = ${sqlDurationSeconds(Prisma.raw('started_at'), closedAt)},
            duration_estimated = true,
            updated_at = ${now}
        WHERE status = 'ACTIVE' AND COALESCE(last_seen_at, started_at) < ${cutoff}
        RETURNING id, device_uuid AS "deviceUuid", conn_id AS "connId"`;
      for (const s of rows) {
        this.logger.log(
          {
            sessionId: s.id,
            deviceUuid: s.deviceUuid,
            connId: s.connId,
            transition: 'ACTIVE→TIMEOUT',
            reason: 'TIMEOUT',
          },
          'Session transition',
        );
      }
      this.logger.log({ timedOut: rows.length }, 'Session timeout sweep finished');
      return rows.length;
    });
  }
}
