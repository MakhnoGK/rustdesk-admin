import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { addSeconds } from '../common/time/time';
import { AuditKind, Prisma } from '../generated/prisma/client';
import { PrismaService, type PrismaTx } from '../prisma/prisma.service';
import { SessionProjectionService } from '../sessions/session-projection.service';
import type { ConnAction } from '../sessions/session-state';

/** Window in which identical nonce-less records are treated as retries (clients retry for ~2 min). */
export const DEDUP_WINDOW_SECONDS = 5 * 60;
/** File/alarm records are linked to the latest session of their (uuid, conn_id) started within this window. */
const LINK_WINDOW_SECONDS = 24 * 60 * 60;

/** One audit record, decoded from the wire by the RustDesk layer. */
export interface AuditRecordInput {
  kind: AuditKind;
  deviceId: string | null;
  deviceUuid: string | null;
  connId: number | null;
  rustdeskSessionId: string | null;
  nonce: string | null;
  /** Set when a required field is missing; the record is stored flagged and rejected with 400. */
  malformedReason: string | null;
  /** conn records only. */
  conn: {
    action: ConnAction | null;
    initiatorIp: string | null;
    initiatorId: string | null;
    initiatorName: string | null;
    connType: number | null;
  } | null;
  /** The record as received, unknown fields included. */
  payload: Prisma.InputJsonValue;
}

export type IngestOutcome =
  | { outcome: 'stored'; eventId: string; sessionId: string | null }
  | { outcome: 'duplicate' }
  | { outcome: 'malformed'; reason: string };

/**
 * Stores audit records in the append-only `audit_events` table. Conn records are applied to
 * the session projection in the same transaction. Retried posts (same nonce) are no-ops.
 */
@Injectable()
export class AuditIngestService {
  private readonly logger = new Logger(AuditIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projection: SessionProjectionService,
  ) {}

  async ingest(
    input: AuditRecordInput,
    ctx: { sourceIp: string | null; receivedAt: Date },
  ): Promise<IngestOutcome> {
    // Fast path for retries. Malformed records skip it so a repeat still answers 400.
    if (
      input.nonce &&
      input.malformedReason === null &&
      (await this.prisma.auditEvent.findUnique({
        where: { nonce: input.nonce },
        select: { id: true },
      }))
    ) {
      this.logger.debug({ nonce: input.nonce, kind: input.kind }, 'Duplicate audit record ignored');
      return { outcome: 'duplicate' };
    }
    const action = input.conn?.action ?? null;
    const dedupHash = input.nonce ? null : this.dedupHash(input, action);

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dedupHash && (await this.isRecentDuplicate(tx, dedupHash, ctx.receivedAt))) {
          return { outcome: 'duplicate' } as const;
        }

        // Insert first: a concurrent retry with the same nonce blocks on the unique index here
        // and fails once this transaction commits, before it can touch the projection.
        const event = await tx.auditEvent.create({
          data: {
            kind: input.kind,
            deviceId: input.deviceId,
            deviceUuid: input.deviceUuid,
            connId: input.connId,
            rustdeskSessionId: input.rustdeskSessionId,
            action,
            sourceIp: ctx.sourceIp,
            receivedAt: ctx.receivedAt,
            payload: input.payload,
            nonce: input.nonce,
            dedupHash,
            malformed: input.malformedReason !== null,
          },
          select: { id: true },
        });

        if (input.malformedReason !== null) {
          this.logger.warn(
            {
              eventId: event.id,
              kind: input.kind,
              reason: input.malformedReason,
              sourceIp: ctx.sourceIp,
            },
            'Malformed audit record stored',
          );
          return { outcome: 'malformed', reason: input.malformedReason } as const;
        }

        const sessionId = await this.sessionFor(tx, input, ctx.receivedAt);
        if (sessionId) await tx.auditEvent.update({ where: { id: event.id }, data: { sessionId } });
        return { outcome: 'stored', eventId: event.id, sessionId } as const;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && input.nonce) {
        this.logger.debug({ nonce: input.nonce }, 'Concurrent duplicate audit record ignored');
        return input.malformedReason
          ? { outcome: 'malformed', reason: input.malformedReason }
          : { outcome: 'duplicate' };
      }
      throw e;
    }
  }

  private async sessionFor(
    tx: PrismaTx,
    input: AuditRecordInput,
    receivedAt: Date,
  ): Promise<string | null> {
    // Guaranteed non-null for well-formed records.
    const deviceUuid = input.deviceUuid as string;
    const connId = input.connId as number;
    if (input.kind === AuditKind.CONN) {
      const conn = input.conn;
      if (!conn?.action) return null; // An unrecognised conn record is stored but not projected.
      return this.projection.apply(tx, {
        action: conn.action,
        deviceUuid,
        deviceId: input.deviceId ?? '',
        connId,
        rustdeskSessionId: input.rustdeskSessionId,
        initiatorIp: conn.initiatorIp,
        initiatorId: conn.initiatorId,
        initiatorName: conn.initiatorName,
        connType: conn.connType,
        receivedAt,
      });
    }
    // File transfer and alarm records: link to the connection's session when one is known.
    const session = await tx.session.findFirst({
      where: {
        deviceUuid,
        connId,
        startedAt: { gte: addSeconds(receivedAt, -LINK_WINDOW_SECONDS) },
      },
      // Enum order puts ACTIVE first: prefer the live session, then the most recent one.
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
      select: { id: true },
    });
    return session?.id ?? null;
  }

  /** Nonce-less records (older clients): identical (uuid, conn_id, action, payload) within the window. */
  private async isRecentDuplicate(tx: PrismaTx, hash: string, receivedAt: Date): Promise<boolean> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${hash}, 0))`;
    const existing = await tx.auditEvent.findFirst({
      where: {
        dedupHash: hash,
        receivedAt: { gte: addSeconds(receivedAt, -DEDUP_WINDOW_SECONDS) },
      },
      select: { id: true },
    });
    return existing !== null;
  }

  private dedupHash(input: AuditRecordInput, action: string | null): string {
    return createHash('sha256')
      .update(JSON.stringify([input.kind, input.deviceUuid, input.connId, action, input.payload]))
      .digest('hex');
  }
}
