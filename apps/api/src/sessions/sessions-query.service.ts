import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import {
  orderBy,
  type Page,
  type SortSpec,
  skipTake,
  toPage,
} from '../common/pagination/pagination';
import { type AuditEvent, Prisma, type Session, SessionStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const SESSION_SORT_FIELDS = [
  'startedAt',
  'closedAt',
  'durationSeconds',
  'lastSeenAt',
] as const;
export type SessionSortField = (typeof SESSION_SORT_FIELDS)[number];

export interface SessionListQuery {
  status?: SessionStatus;
  deviceId?: string;
  initiatorId?: string;
  /** `[from, to)` on `startedAt`. */
  from?: Date;
  to?: Date;
  minDurationSeconds?: number;
  authenticated?: boolean;
  page: number;
  pageSize: number;
  sort: SortSpec<SessionSortField>;
}

/** A session with the current hostname of its target device (sessions have no FK to devices). */
export type SessionWithDevice = Session & { deviceHostname: string | null };

/** Hard cap on events returned with one session (a session normally has three). */
const MAX_EVENTS_PER_SESSION = 500;

@Injectable()
export class SessionsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SessionListQuery): Promise<Page<SessionWithDevice>> {
    const where: Prisma.SessionWhereInput = {
      status: query.status,
      deviceId: query.deviceId,
      initiatorId: query.initiatorId,
      authenticated: query.authenticated,
      ...(query.from || query.to ? { startedAt: { gte: query.from, lt: query.to } } : {}),
      ...(query.minDurationSeconds !== undefined
        ? { durationSeconds: { gte: query.minDurationSeconds } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
        orderBy: [
          orderBy(query.sort, ['closedAt', 'durationSeconds', 'lastSeenAt']),
          { id: 'desc' },
        ],
        ...skipTake(query),
      }),
      this.prisma.session.count({ where }),
    ]);
    return toPage(await this.withHostnames(data), total, query);
  }

  async active(page: { page: number; pageSize: number }): Promise<Page<SessionWithDevice>> {
    const where = { status: SessionStatus.ACTIVE };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        ...skipTake(page),
      }),
      this.prisma.session.count({ where }),
    ]);
    return toPage(await this.withHostnames(data), total, page);
  }

  async get(id: string): Promise<{ session: SessionWithDevice; events: AuditEvent[] }> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) throw DomainError.notFound('Session');
    const events = await this.prisma.auditEvent.findMany({
      where: { sessionId: id },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      take: MAX_EVENTS_PER_SESSION,
    });
    const [withHostname] = await this.withHostnames([session]);
    return { session: withHostname!, events };
  }

  /** One query per page: devices are keyed by machine UUID, which sessions store. */
  private async withHostnames(sessions: Session[]): Promise<SessionWithDevice[]> {
    const uuids = [...new Set(sessions.map((s) => s.deviceUuid))];
    const devices =
      uuids.length === 0
        ? []
        : await this.prisma.device.findMany({
            where: { uuid: { in: uuids } },
            select: { uuid: true, hostname: true },
          });
    const hostnames = new Map(devices.map((d) => [d.uuid, d.hostname]));
    return sessions.map((s) => ({ ...s, deviceHostname: hostnames.get(s.deviceUuid) ?? null }));
  }
}
