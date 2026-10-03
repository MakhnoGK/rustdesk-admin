import type {
  AuditKind,
  DisconnectState,
  SessionCloseReason,
  ShareRule,
  TokenKind,
} from '@/api/types';

const CLOSE_REASONS: Record<SessionCloseReason, string> = {
  CLIENT_CLOSE: 'The device reported that the connection closed.',
  HEARTBEAT_RECONCILED:
    'Closed by heartbeat reconciliation: the device stopped listing the connection in its heartbeats.',
  SUPERSEDED: 'Replaced by a newer session for the same connection on the device.',
  TIMEOUT: 'Timed out: no liveness evidence from the device for too long.',
  ADMIN_DISCONNECT: 'Disconnected remotely by an administrator.',
};

const CLOSE_REASON_SHORT: Record<SessionCloseReason, string> = {
  CLIENT_CLOSE: 'Closed by client',
  HEARTBEAT_RECONCILED: 'Heartbeat reconciliation',
  SUPERSEDED: 'Superseded',
  TIMEOUT: 'Timeout',
  ADMIN_DISCONNECT: 'Admin disconnect',
};

export function closeReasonText(reason: SessionCloseReason): string {
  return CLOSE_REASONS[reason];
}

export function closeReasonLabel(reason: SessionCloseReason | null): string {
  return reason ? CLOSE_REASON_SHORT[reason] : '—';
}

/**
 * The API exposes the RustDesk connection type only as the client's raw integer and no label, so
 * the raw value is shown. No mapping is invented here.
 */
export function connTypeLabel(connType: number | null): string {
  return connType === null ? '—' : String(connType);
}

export const SHARE_RULES: { value: ShareRule; label: string; description: string }[] = [
  { value: 1, label: 'Read-only', description: 'Can see the peers' },
  { value: 2, label: 'Read/write', description: 'Can add, edit and remove peers' },
  { value: 3, label: 'Full control', description: 'Read/write and can manage the book' },
];

export function shareRuleLabel(rule: ShareRule): string {
  return SHARE_RULES.find((r) => r.value === rule)?.label ?? String(rule);
}

export function tokenKindLabel(kind: TokenKind): string {
  return kind === 'RUSTDESK_CLIENT' ? 'RustDesk client' : 'Admin panel';
}

export const AUDIT_KIND_LABELS: Record<AuditKind, string> = {
  conn: 'Connection',
  file: 'File transfer',
  alarm: 'Alarm',
};

/** The phases of a remote disconnect as the panel shows them. */
export type DisconnectPhase = 'requested' | 'delivered' | 'closed' | 'expired';

export function disconnectPhase(
  state: DisconnectState | undefined,
  sessionClosed: boolean,
): DisconnectPhase {
  if (sessionClosed) return 'closed';
  if (state === 'EXPIRED') return 'expired';
  if (state === 'DELIVERED') return 'delivered';
  return 'requested';
}

export const DISCONNECT_PHASE_TEXT: Record<
  DisconnectPhase,
  { label: string; description: string }
> = {
  requested: {
    label: 'Disconnect requested',
    description: "Waiting for the device's next heartbeat.",
  },
  delivered: {
    label: 'Delivered to the device',
    description: 'Waiting for the device to close the connection.',
  },
  closed: { label: 'Session closed', description: 'The device closed the connection.' },
  expired: {
    label: 'Request expired',
    description: 'The device sent no heartbeat in time; the session was not disconnected.',
  },
};

const numberFormat = new Intl.NumberFormat('en-US');

export function formatCount(n: number): string {
  return numberFormat.format(n);
}

/** A shortened opaque id for breadcrumbs and captions. */
export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
