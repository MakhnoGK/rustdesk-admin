import { CircleHelpIcon, HeartOffIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { Session } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNow } from '@/hooks/use-now';
import { elapsedSeconds, formatDuration, secondsSince } from '@/lib/time';

/** The controlled device: the one that reported the session. */
export function TargetCell({ session }: { session: Pick<Session, 'deviceId' | 'deviceUuid'> }) {
  return (
    <Link
      to={`/devices/${encodeURIComponent(session.deviceUuid)}`}
      className="font-mono tabular-nums underline-offset-4 hover:underline"
    >
      {session.deviceId}
    </Link>
  );
}

/**
 * The initiator is known only after authentication; before that (or when it failed) there is
 * none, which is shown explicitly rather than as a blank cell.
 */
export function InitiatorCell({
  session,
}: {
  session: Pick<Session, 'initiatorId' | 'initiatorName' | 'authenticated'>;
}) {
  if (!session.initiatorId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex cursor-help items-center gap-1 rounded-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <CircleHelpIcon aria-hidden className="size-3.5" />
            Unknown initiator
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {session.authenticated
            ? 'The device has not reported who connected.'
            : 'Not authenticated: the initiator becomes known after a successful login.'}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span className="flex flex-col">
      <span className="font-mono tabular-nums">{session.initiatorId}</span>
      {session.initiatorName ? (
        <span className="max-w-48 truncate text-xs text-muted-foreground">
          {session.initiatorName}
        </span>
      ) : null}
    </span>
  );
}

export function AuthenticatedBadge({ authenticated }: { authenticated: boolean }) {
  return authenticated ? (
    <Badge variant="secondary">Yes</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Not authenticated
    </Badge>
  );
}

/** Ticks every second from `startedAt` on the client; never triggers a fetch. */
export function LiveElapsed({ startedAt }: { startedAt: string }) {
  const now = useNow();
  return (
    <span className="tabular-nums" aria-live="off">
      {formatDuration(elapsedSeconds(startedAt, new Date(now)))}
    </span>
  );
}

/**
 * Flags an active session whose last liveness evidence is older than the heartbeat grace: it will
 * be reconciled or time out.
 */
export function HeartbeatFlag({
  session,
  graceSeconds,
}: {
  session: Pick<Session, 'lastSeenAt' | 'startedAt'>;
  graceSeconds: number | undefined;
}) {
  const now = useNow();
  if (graceSeconds === undefined) return null;
  const since = secondsSince(session.lastSeenAt ?? session.startedAt, new Date(now));
  if (since <= graceSeconds) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          className="border-status-timeout/30 bg-status-timeout/12 text-status-timeout"
        >
          <HeartOffIcon aria-hidden />
          No heartbeat
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        Not seen for {formatDuration(since)} (grace {formatDuration(graceSeconds)}). The session
        will be closed by reconciliation or time out.
      </TooltipContent>
    </Tooltip>
  );
}
