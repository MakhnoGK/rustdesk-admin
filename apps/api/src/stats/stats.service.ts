import { HttpStatus, Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../common/errors/domain-error';
import { AppConfig } from '../config/app-config.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type StatsBucket = 'hour' | 'day';
export type TopBy = 'initiator' | 'target';

export interface StatsRange {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

export interface SummaryStats {
  totalSessions: number;
  totalDurationSeconds: number;
  avgDurationSeconds: number;
  timedOutSessions: number;
  activeSessions: number;
  unauthenticatedSessions: number;
}

export interface TimeseriesPoint {
  bucketStart: Date;
  sessions: number;
  durationSeconds: number;
}

export interface TopEntry {
  id: string;
  name: string | null;
  sessions: number;
  durationSeconds: number;
}

const toNumber = (v: bigint | number | null): number => (v === null ? 0 : Number(v));

/** Session analytics, aggregated in PostgreSQL over sessions whose `started_at` is in `[from, to)`. */
@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async summary(range: StatsRange): Promise<SummaryStats> {
    this.assertRange(range);
    const [row] = await this.prisma.$queryRaw<
      Array<{
        totalSessions: number;
        totalDurationSeconds: bigint | null;
        avgDurationSeconds: number | null;
        timedOutSessions: number;
        activeSessions: number;
        unauthenticatedSessions: number;
      }>
    >`
      SELECT count(*)::int AS "totalSessions",
             sum(duration_seconds)::bigint AS "totalDurationSeconds",
             round(avg(duration_seconds))::int AS "avgDurationSeconds",
             (count(*) FILTER (WHERE status = 'TIMEOUT'))::int AS "timedOutSessions",
             (count(*) FILTER (WHERE status = 'ACTIVE'))::int AS "activeSessions",
             (count(*) FILTER (WHERE NOT authenticated))::int AS "unauthenticatedSessions"
      FROM sessions
      WHERE started_at >= ${range.from} AND started_at < ${range.to}`;
    return {
      totalSessions: row?.totalSessions ?? 0,
      totalDurationSeconds: toNumber(row?.totalDurationSeconds ?? null),
      avgDurationSeconds: row?.avgDurationSeconds ?? 0,
      timedOutSessions: row?.timedOutSessions ?? 0,
      activeSessions: row?.activeSessions ?? 0,
      unauthenticatedSessions: row?.unauthenticatedSessions ?? 0,
    };
  }

  /** One point per UTC hour/day in the range, empty buckets included. */
  async timeseries(range: StatsRange, bucket: StatsBucket): Promise<TimeseriesPoint[]> {
    this.assertRange(range);
    const step = Prisma.sql`${`1 ${bucket}`}::interval`;
    const rows = await this.prisma.$queryRaw<
      Array<{ bucketStart: Date; sessions: number; durationSeconds: bigint | null }>
    >`
      WITH agg AS (
        SELECT date_trunc(${bucket}, started_at AT TIME ZONE 'UTC') AS b,
               count(*) AS n,
               sum(duration_seconds) AS d
        FROM sessions
        WHERE started_at >= ${range.from} AND started_at < ${range.to}
        GROUP BY 1
      ),
      buckets AS (
        SELECT generate_series(
                 date_trunc(${bucket}, ${range.from}::timestamptz AT TIME ZONE 'UTC'),
                 (${range.to}::timestamptz AT TIME ZONE 'UTC') - interval '1 microsecond',
                 ${step}
               ) AS b
      )
      SELECT (buckets.b AT TIME ZONE 'UTC') AS "bucketStart",
             COALESCE(agg.n, 0)::int AS sessions,
             COALESCE(agg.d, 0)::bigint AS "durationSeconds"
      FROM buckets LEFT JOIN agg ON agg.b = buckets.b
      ORDER BY buckets.b`;
    return rows.map((r) => ({
      bucketStart: r.bucketStart,
      sessions: r.sessions,
      durationSeconds: toNumber(r.durationSeconds),
    }));
  }

  async top(range: StatsRange, by: TopBy, limit: number): Promise<TopEntry[]> {
    this.assertRange(range);
    const rows =
      by === 'initiator'
        ? await this.prisma.$queryRaw<
            Array<{
              id: string;
              name: string | null;
              sessions: number;
              durationSeconds: bigint | null;
            }>
          >`
            SELECT initiator_id AS id,
                   (array_agg(initiator_name ORDER BY started_at DESC))[1] AS name,
                   count(*)::int AS sessions,
                   COALESCE(sum(duration_seconds), 0)::bigint AS "durationSeconds"
            FROM sessions
            WHERE started_at >= ${range.from} AND started_at < ${range.to} AND initiator_id IS NOT NULL
            GROUP BY initiator_id
            ORDER BY sessions DESC, "durationSeconds" DESC, id
            LIMIT ${limit}`
        : await this.prisma.$queryRaw<
            Array<{
              id: string;
              name: string | null;
              sessions: number;
              durationSeconds: bigint | null;
            }>
          >`
            SELECT s.device_id AS id,
                   max(d.hostname) AS name,
                   count(*)::int AS sessions,
                   COALESCE(sum(s.duration_seconds), 0)::bigint AS "durationSeconds"
            FROM sessions s
            LEFT JOIN devices d ON d.uuid = s.device_uuid
            WHERE s.started_at >= ${range.from} AND s.started_at < ${range.to}
            GROUP BY s.device_id
            ORDER BY sessions DESC, "durationSeconds" DESC, id
            LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      sessions: r.sessions,
      durationSeconds: toNumber(r.durationSeconds),
    }));
  }

  private assertRange({ from, to }: StatsRange): void {
    if (from >= to) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        HttpStatus.UNPROCESSABLE_ENTITY,
        '`from` must be before `to`',
        [{ field: 'to', message: 'must be after from' }],
      );
    }
    const maxDays = this.config.get('STATS_MAX_RANGE_DAYS');
    if (to.getTime() - from.getTime() > maxDays * 86_400_000) {
      throw new DomainError(
        ErrorCode.RANGE_TOO_LARGE,
        HttpStatus.UNPROCESSABLE_ENTITY,
        `The range may span at most ${maxDays} days`,
        [{ field: 'to', message: `must be at most ${maxDays} days after from` }],
      );
    }
  }
}
