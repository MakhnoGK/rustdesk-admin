import { Injectable, Logger } from '@nestjs/common';
import { addSeconds, durationSeconds } from '../common/time/time';
import { SessionCloseReason, SessionStatus } from '../generated/prisma/client';
import type { PrismaTx } from '../prisma/prisma.service';
import {
  type ConnAction,
  decideConnRecord,
  LATE_RECORD_WINDOW_SECONDS,
  type SessionOp,
  type SessionSnapshot,
} from './session-state';

/** A conn audit record, already parsed and validated by the ingestion layer. */
export interface ConnRecord {
  action: ConnAction;
  deviceUuid: string;
  deviceId: string;
  connId: number;
  /** Null or '0' when the client had not negotiated a session yet. */
  rustdeskSessionId: string | null;
  /** `new`: the initiator's IP as seen by the controlled device. */
  initiatorIp: string | null;
  /** `peer`: the initiator's RustDesk ID and name, and the connection type. */
  initiatorId: string | null;
  initiatorName: string | null;
  connType: number | null;
  receivedAt: Date;
}

const snapshotSelect = { id: true, status: true, closeReason: true, authenticated: true } as const;

/**
 * Applies conn audit records to the `sessions` projection. Must run inside the transaction
 * that stores the audit event, so both commit or neither does.
 */
@Injectable()
export class SessionProjectionService {
  private readonly logger = new Logger(SessionProjectionService.name);

  /** Returns the id of the session the record was applied to. */
  async apply(tx: PrismaTx, record: ConnRecord): Promise<string> {
    // Serialise all records of one (uuid, conn_id) across API instances.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${record.deviceUuid}:${record.connId}`}, 0))`;

    const key = { deviceUuid: record.deviceUuid, connId: record.connId };
    const active: SessionSnapshot | null = await tx.session.findFirst({
      where: { ...key, status: SessionStatus.ACTIVE },
      select: snapshotSelect,
    });
    const recent: SessionSnapshot | null =
      active || record.action === 'new'
        ? null
        : await tx.session.findFirst({
            where: {
              ...key,
              status: { not: SessionStatus.ACTIVE },
              startedAt: { gte: addSeconds(record.receivedAt, -LATE_RECORD_WINDOW_SECONDS) },
            },
            orderBy: { startedAt: 'desc' },
            select: snapshotSelect,
          });
    const disconnectDelivered =
      active !== null && record.action === 'close'
        ? (await tx.pendingDisconnect.count({
            where: { sessionId: active.id, deliveredAt: { not: null } },
          })) > 0
        : false;

    let sessionId: string | null = null;
    for (const op of decideConnRecord({
      action: record.action,
      active,
      recent,
      disconnectDelivered,
    })) {
      sessionId = await this.execute(tx, op, record);
    }
    if (!sessionId) throw new Error('Session projection produced no session');
    return sessionId;
  }

  private async execute(tx: PrismaTx, op: SessionOp, r: ConnRecord): Promise<string> {
    const now = r.receivedAt;
    const sessionIdFromClient =
      r.rustdeskSessionId && r.rustdeskSessionId !== '0' ? r.rustdeskSessionId : null;
    const log = (sessionId: string, transition: string, extra: Record<string, unknown> = {}) =>
      this.logger.log(
        {
          sessionId,
          deviceUuid: r.deviceUuid,
          deviceId: r.deviceId,
          connId: r.connId,
          transition,
          ...extra,
        },
        'Session transition',
      );

    switch (op.op) {
      case 'supersede': {
        const old = await tx.session.findUniqueOrThrow({ where: { id: op.sessionId } });
        const closedAt = old.lastSeenAt ?? now;
        await tx.session.updateMany({
          where: { id: op.sessionId, status: SessionStatus.ACTIVE },
          data: {
            status: SessionStatus.UNKNOWN,
            closeReason: SessionCloseReason.SUPERSEDED,
            closedAt,
            durationSeconds: durationSeconds(old.startedAt, closedAt),
            durationEstimated: true,
          },
        });
        log(op.sessionId, 'ACTIVE→UNKNOWN', { reason: SessionCloseReason.SUPERSEDED });
        return op.sessionId;
      }

      case 'create': {
        const session = await tx.session.create({
          data: {
            deviceUuid: r.deviceUuid,
            deviceId: r.deviceId,
            connId: r.connId,
            rustdeskSessionId: sessionIdFromClient,
            initiatorIp: r.initiatorIp,
            status: SessionStatus.ACTIVE,
            startedAt: now,
            ...(op.authenticated
              ? {
                  authenticated: true,
                  authenticatedAt: now,
                  initiatorId: r.initiatorId,
                  initiatorName: r.initiatorName,
                  connType: r.connType,
                }
              : {}),
          },
          select: { id: true },
        });
        log(session.id, op.authenticated ? '∅→ACTIVE (peer without new)' : '∅→ACTIVE', {
          initiatorIp: r.initiatorIp,
        });
        return session.id;
      }

      case 'authenticate': {
        await tx.session.update({
          where: { id: op.sessionId },
          data: {
            authenticated: true,
            authenticatedAt: now,
            initiatorId: r.initiatorId,
            initiatorName: r.initiatorName,
            connType: r.connType,
            ...(sessionIdFromClient ? { rustdeskSessionId: sessionIdFromClient } : {}),
          },
        });
        log(op.sessionId, 'authenticated', { initiatorId: r.initiatorId, connType: r.connType });
        return op.sessionId;
      }

      case 'close': {
        const session = await tx.session.findUniqueOrThrow({ where: { id: op.sessionId } });
        const { count } = await tx.session.updateMany({
          where: { id: op.sessionId, status: SessionStatus.ACTIVE },
          data: {
            status: SessionStatus.CLOSED,
            closeReason: op.reason,
            closedAt: now,
            lastSeenAt: now,
            durationSeconds: durationSeconds(session.startedAt, now),
            durationEstimated: false,
            ...(sessionIdFromClient && !session.rustdeskSessionId
              ? { rustdeskSessionId: sessionIdFromClient }
              : {}),
          },
        });
        // Reconciliation (which does not take the per-connection lock) may have closed it first.
        if (count === 1)
          log(op.sessionId, 'ACTIVE→CLOSED', {
            reason: op.reason,
            durationSeconds: durationSeconds(session.startedAt, now),
          });
        return op.sessionId;
      }

      case 'attach':
        this.logger.debug(
          { sessionId: op.sessionId, connId: r.connId, action: r.action },
          'Late or duplicate record attached to a final session',
        );
        return op.sessionId;

      case 'createUnknown': {
        const session = await tx.session.create({
          data: {
            deviceUuid: r.deviceUuid,
            deviceId: r.deviceId,
            connId: r.connId,
            rustdeskSessionId: sessionIdFromClient,
            status: SessionStatus.UNKNOWN,
            closeReason: SessionCloseReason.CLIENT_CLOSE,
            startedAt: now,
            closedAt: now,
            durationSeconds: null,
          },
          select: { id: true },
        });
        log(session.id, '∅→UNKNOWN (close without session)');
        return session.id;
      }
    }
  }
}
