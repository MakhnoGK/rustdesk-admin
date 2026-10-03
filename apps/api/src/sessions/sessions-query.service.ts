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

/** Hard cap on events returned with one session (a session normally has three). */
const MAX_EVENTS_PER_SESSION = 500;

@Injectable()
export class SessionsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SessionListQuery): Promise<Page<Session>> {
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
    return toPage(data, total, query);
  }

  async active(page: { page: number; pageSize: number }): Promise<Page<Session>> {
    const where = { status: SessionStatus.ACTIVE };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        ...skipTake(page),
      }),
      this.prisma.session.count({ where }),
    ]);
    return toPage(data, total, page);
  }

  async get(id: string): Promise<{ session: Session; events: AuditEvent[] }> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session) throw DomainError.notFound('Session');
    const events = await this.prisma.auditEvent.findMany({
      where: { sessionId: id },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      take: MAX_EVENTS_PER_SESSION,
    });
    return { session, events };
  }
}
