import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { AuditEvent, SessionDetail } from '@/api/types';
import { DateTimeText } from '@/components/date-time-text';
import { DisconnectState } from '@/components/disconnect-state';
import { DurationText } from '@/components/duration-text';
import { ErrorState } from '@/components/error-state';
import { JsonView } from '@/components/json-view';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { closeReasonText, connTypeLabel, disconnectPhase } from '@/lib/format';
import { useDisconnectHistory, useSession } from '../api';
import { AuthenticatedBadge, InitiatorCell, TargetCell } from './session-cells';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function DisconnectHistory({ sessionId, closed }: { sessionId: string; closed: boolean }) {
  const history = useDisconnectHistory(sessionId);
  if (history.isPending) return <Skeleton className="h-6 w-48" />;
  if (history.error)
    return <p className="text-sm text-muted-foreground">Could not load the disconnect requests.</p>;
  if (!history.data.length)
    return <p className="text-sm text-muted-foreground">No remote disconnect was requested.</p>;
  return (
    <ol className="space-y-3" aria-label="Disconnect requests, newest first">
      {history.data.map((d, i) => (
        <li key={d.id} className={i > 0 ? 'border-t pt-3' : undefined}>
          <dl>
            <Field label="State">
              {/* Only the newest request can have closed the session. */}
              <DisconnectState
                phase={disconnectPhase(d.state, i === 0 && closed && d.state === 'DELIVERED')}
              />
            </Field>
            <Field label="Requested">
              <DateTimeText value={d.requestedAt} />
              {d.requestedBy ? (
                <span className="text-muted-foreground"> by {d.requestedBy.username}</span>
              ) : null}
            </Field>
            <Field label="Delivered">
              <DateTimeText value={d.deliveredAt} fallback="Not yet" />
            </Field>
            <Field label="Expires">
              <DateTimeText value={d.expiresAt} />
            </Field>
          </dl>
        </li>
      ))}
    </ol>
  );
}

function EventTimeline({ events }: { events: AuditEvent[] }) {
  if (!events.length) {
    return (
      <p className="text-sm text-muted-foreground">No audit events are linked to this session.</p>
    );
  }
  return (
    <ol className="space-y-3 border-l pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative space-y-1.5">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary"
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{e.kind}</Badge>
            <span className="font-medium">{e.action ?? 'no action'}</span>
            {e.malformed ? <Badge variant="destructive">Malformed</Badge> : null}
            <DateTimeText value={e.receivedAt} />
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Raw payload</summary>
            <JsonView value={e.payload} label={`Payload of the ${e.action ?? e.kind} event`} />
          </details>
        </li>
      ))}
    </ol>
  );
}

function Details({ session }: { session: SessionDetail }) {
  const closed = session.status !== 'ACTIVE';
  return (
    <div className="space-y-6">
      <dl>
        <Field label="Status">
          <StatusBadge status={session.status} />
        </Field>
        <Field label="Target device">
          <TargetCell session={session} />
        </Field>
        <Field label="Initiator">
          <InitiatorCell session={session} />
        </Field>
        <Field label="Initiator IP">
          <span className="font-mono text-xs">{session.initiatorIp ?? '—'}</span>
        </Field>
        <Field label="Authenticated">
          <AuthenticatedBadge authenticated={session.authenticated} />
          {session.authenticatedAt ? (
            <span className="ml-2">
              <DateTimeText value={session.authenticatedAt} />
            </span>
          ) : null}
        </Field>
        <Field label="Connection type">{connTypeLabel(session)}</Field>
        <Field label="Started">
          <DateTimeText value={session.startedAt} />
        </Field>
        <Field label="Closed">
          <DateTimeText value={session.closedAt} fallback={closed ? 'Unknown' : 'Still active'} />
        </Field>
        <Field label="Last seen">
          <DateTimeText value={session.lastSeenAt} fallback="Never" />
        </Field>
        <Field label="Duration">
          <DurationText
            seconds={session.durationSeconds}
            estimated={session.durationEstimated}
            closeReason={session.closeReason}
          />
        </Field>
        <Field label="Close reason">
          {session.closeReason ? closeReasonText(session.closeReason) : '—'}
        </Field>
        <Field label="Conn ID">
          <span className="font-mono">{session.connId}</span>
        </Field>
        <Field label="RustDesk session">
          <span className="font-mono text-xs">{session.rustdeskSessionId ?? '—'}</span>
        </Field>
      </dl>
      <Separator />
      <Section title="Remote disconnect">
        <DisconnectHistory sessionId={session.id} closed={closed} />
      </Section>
      <Separator />
      <Section title="Audit events">
        <EventTimeline events={session.events} />
        <Link
          to={`/audit?sessionId=${session.id}`}
          className="text-sm underline underline-offset-4"
        >
          Open in the audit log
        </Link>
      </Section>
    </div>
  );
}

/** Session detail from `GET /sessions/:id`, opened from the history (`?session=<id>`). */
export function SessionDetailSheet({
  sessionId,
  onClose,
}: {
  sessionId: string | undefined;
  onClose: () => void;
}) {
  const session = useSession(sessionId);
  return (
    <Sheet open={!!sessionId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Session</SheetTitle>
          <SheetDescription className="font-mono text-xs">{sessionId}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {session.error ? (
            <ErrorState
              error={session.error}
              what="session"
              onRetry={() => void session.refetch()}
            />
          ) : !session.data ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : (
            <Details session={session.data} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
