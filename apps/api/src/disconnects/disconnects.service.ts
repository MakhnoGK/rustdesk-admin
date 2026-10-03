import { Injectable, Logger } from '@nestjs/common';
import { DomainError, ErrorCode } from '../common/errors/domain-error';
import { addSeconds } from '../common/time/time';
import { AppConfig } from '../config/app-config.service';
import { type PendingDisconnect, SessionStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Bound on the history of one session. A new request is only possible once the previous one was
 * delivered or expired, so a session reaches this only after hours of retries.
 */
export const MAX_HISTORY = 100;

export type DisconnectState = 'REQUESTED' | 'DELIVERED' | 'EXPIRED';

export interface DisconnectRecord extends PendingDisconnect {
  state: DisconnectState;
  requestedByUsername: string | null;
}

export function disconnectState(
  d: Pick<PendingDisconnect, 'deliveredAt' | 'expiresAt'>,
  now = new Date(),
): DisconnectState {
  if (d.deliveredAt) return 'DELIVERED';
  return d.expiresAt <= now ? 'EXPIRED' : 'REQUESTED';
}

/**
 * Remote disconnect through the heartbeat protocol: an administrator's request is stored and
 * handed to the device in its next heartbeat response (`{"disconnect": [conn_id]}`), once.
 * It only works while the device keeps sending heartbeats.
 */
@Injectable()
export class DisconnectsService {
  private readonly logger = new Logger(DisconnectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** Creates a request, or returns the one still waiting for delivery (idempotent). */
  async request(
    actorId: string,
    sessionId: string,
    now = new Date(),
  ): Promise<{ record: DisconnectRecord; created: boolean }> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw DomainError.notFound('Session');
    if (session.status !== SessionStatus.ACTIVE) {
      throw DomainError.conflict(
        ErrorCode.SESSION_NOT_ACTIVE,
        'Only active sessions can be disconnected',
      );
    }
    const pending = await this.prisma.pendingDisconnect.findFirst({
      where: { sessionId, deliveredAt: null, expiresAt: { gt: now } },
      include: { requestedBy: { select: { username: true } } },
      orderBy: { requestedAt: 'desc' },
    });
    if (pending) return { record: this.toRecord(pending, now), created: false };

    const created = await this.prisma.pendingDisconnect.create({
      data: {
        sessionId,
        deviceUuid: session.deviceUuid,
        connId: session.connId,
        requestedById: actorId,
        requestedAt: now,
        expiresAt: addSeconds(now, this.config.get('DISCONNECT_TTL_SECONDS')),
      },
      include: { requestedBy: { select: { username: true } } },
    });
    this.logger.log(
      { actorId, sessionId, deviceUuid: session.deviceUuid, connId: session.connId },
      'Disconnect requested',
    );
    return { record: this.toRecord(created, now), created: true };
  }

  /** The most recent request for a session. */
  async latest(sessionId: string, now = new Date()): Promise<DisconnectRecord> {
    const record = await this.prisma.pendingDisconnect.findFirst({
      where: { sessionId },
      include: { requestedBy: { select: { username: true } } },
      orderBy: { requestedAt: 'desc' },
    });
    if (!record) throw DomainError.notFound('Disconnect request');
    return this.toRecord(record, now);
  }

  /** Every request for a session, newest first, capped at MAX_HISTORY; 404 for an unknown session. */
  async history(sessionId: string, now = new Date()): Promise<DisconnectRecord[]> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) throw DomainError.notFound('Session');
    const rows = await this.prisma.pendingDisconnect.findMany({
      where: { sessionId },
      include: { requestedBy: { select: { username: true } } },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: MAX_HISTORY,
    });
    return rows.map((r) => this.toRecord(r, now));
  }

  /** Marks undelivered, unexpired requests of a device as delivered and returns their conn IDs. */
  async deliver(deviceUuid: string, now: Date): Promise<number[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; sessionId: string; connId: number }>
    >`
      UPDATE pending_disconnects SET delivered_at = ${now}
      WHERE device_uuid = ${deviceUuid} AND delivered_at IS NULL AND expires_at > ${now}
      RETURNING id, session_id AS "sessionId", conn_id AS "connId"`;
    for (const r of rows) {
      this.logger.log(
        { disconnectId: r.id, sessionId: r.sessionId, deviceUuid, connId: r.connId },
        'Disconnect delivered',
      );
    }
    return [...new Set(rows.map((r) => r.connId))];
  }

  private toRecord(
    row: PendingDisconnect & { requestedBy: { username: string } | null },
    now: Date,
  ): DisconnectRecord {
    const { requestedBy, ...rest } = row;
    return {
      ...rest,
      state: disconnectState(rest, now),
      requestedByUsername: requestedBy?.username ?? null,
    };
  }
}
