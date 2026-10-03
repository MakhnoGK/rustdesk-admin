// Pure decision logic of the session projection: given the incoming conn record and the
// sessions currently known for its (uuid, conn_id), decide what to do. The database side
// (SessionProjectionService) only executes the returned plan.
//
//   new ──► ACTIVE ──peer──► ACTIVE (authenticated) ──close──► CLOSED (CLIENT_CLOSE | ADMIN_DISCONNECT)
//                  │                               ├─heartbeat w/o conn──► CLOSED (HEARTBEAT_RECONCILED)
//                  │                               └─no liveness > timeout──► TIMEOUT
//                  └─new with same (uuid, conn_id)──► UNKNOWN (SUPERSEDED)
//   close without session ──► UNKNOWN

import { SessionCloseReason, SessionStatus } from '../generated/prisma/enums';

export type ConnAction = 'new' | 'peer' | 'close';

/** How long after a session started a late `peer`/`close` record is still attached to it. */
export const LATE_RECORD_WINDOW_SECONDS = 24 * 60 * 60;

export interface SessionSnapshot {
  id: string;
  status: SessionStatus;
  closeReason: SessionCloseReason | null;
  authenticated: boolean;
}

export type SessionOp =
  /** Close the active session because its conn ID was reused by a restarted client process. */
  | { op: 'supersede'; sessionId: string }
  /** Open a new ACTIVE session; `authenticated` when the creating record is a `peer`. */
  | { op: 'create'; authenticated: boolean }
  /** Set initiator / type / authenticated on an existing session (status unchanged). */
  | { op: 'authenticate'; sessionId: string }
  /** Close an active session with an exact time. */
  | { op: 'close'; sessionId: string; reason: SessionCloseReason }
  /** Only link the event to an already-final session (duplicate or late close). */
  | { op: 'attach'; sessionId: string }
  /** A close with no session at all: record an UNKNOWN session with no duration. */
  | { op: 'createUnknown' };

export interface DecisionInput {
  action: ConnAction;
  /** The ACTIVE session for (uuid, conn_id), if any. */
  active: SessionSnapshot | null;
  /** The most recent non-active session for (uuid, conn_id) inside the late-record window. */
  recent: SessionSnapshot | null;
  /** A disconnect requested by an administrator for the active session was delivered. */
  disconnectDelivered: boolean;
}

export function decideConnRecord(input: DecisionInput): SessionOp[] {
  const { action, active, recent } = input;
  switch (action) {
    case 'new':
      // Retries reuse the nonce and are dropped before this point, so a second `new` for an
      // active (uuid, conn_id) means the client process restarted and reused the conn ID.
      return active
        ? [
            { op: 'supersede', sessionId: active.id },
            { op: 'create', authenticated: false },
          ]
        : [{ op: 'create', authenticated: false }];

    case 'peer':
      if (active) return [{ op: 'authenticate', sessionId: active.id }];
      // The connection was already closed (e.g. by reconciliation) before its delayed `peer`
      // record arrived: enrich that session instead of opening a phantom one.
      if (recent && !recent.authenticated) return [{ op: 'authenticate', sessionId: recent.id }];
      // The `new` record was lost.
      return [{ op: 'create', authenticated: true }];

    case 'close':
      if (active) {
        return [
          {
            op: 'close',
            sessionId: active.id,
            reason: input.disconnectDelivered
              ? SessionCloseReason.ADMIN_DISCONNECT
              : SessionCloseReason.CLIENT_CLOSE,
          },
        ];
      }
      // Duplicate close, or a close after reconciliation/timeout already ended the session:
      // the event is logged against it, the session is left as is.
      if (recent) return [{ op: 'attach', sessionId: recent.id }];
      return [{ op: 'createUnknown' }];
  }
}

/** Statuses after which a session never changes state again. */
export function isFinal(status: SessionStatus): boolean {
  return status !== SessionStatus.ACTIVE;
}
