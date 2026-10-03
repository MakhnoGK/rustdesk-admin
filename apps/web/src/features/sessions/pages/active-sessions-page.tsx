import type { ColumnDef } from '@tanstack/react-table';
import { ActivityIcon, PowerIcon, RefreshCwIcon, XIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Session } from '@/api/types';
import { DataTable } from '@/components/data-table';
import { DateTimeText } from '@/components/date-time-text';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StaleDataAlert } from '@/components/stale-data-alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSystemInfo } from '@/features/system/api';
import { useNow } from '@/hooks/use-now';
import { useUrlState } from '@/hooks/use-url-state';
import { config } from '@/lib/config';
import { connTypeLabel } from '@/lib/format';
import { formatDuration } from '@/lib/time';
import { useActiveSessions } from '../api';
import { DisconnectDialog } from '../components/disconnect-dialog';
import { DisconnectProgress } from '../components/disconnect-progress';
import {
  AuthenticatedBadge,
  HeartbeatFlag,
  InitiatorCell,
  LiveElapsed,
  TargetCell,
} from '../components/session-cells';
import { activeSearchSchema } from '../schemas';

const PAGE_SIZE = 50;

function refreshOptions(configured: number): number[] {
  return [...new Set([configured, 5000, 10_000, 30_000, 60_000])].sort((a, b) => a - b);
}

function LastUpdated({ at }: { at: number }) {
  const now = useNow();
  if (!at) return null;
  const ago = Math.max(0, Math.round((now - at) / 1000));
  return (
    <span className="text-sm text-muted-foreground tabular-nums" aria-live="off">
      Updated {ago < 2 ? 'just now' : `${formatDuration(ago)} ago`}
    </span>
  );
}

export function ActiveSessionsPage() {
  const { state, update } = useUrlState(activeSearchSchema);
  const [intervalMs, setIntervalMs] = useState(config.activeSessionsRefreshMs);
  const sessions = useActiveSessions({ page: state.page, pageSize: PAGE_SIZE }, intervalMs || 0);
  const system = useSystemInfo();
  const [confirming, setConfirming] = useState<Session | null>(null);
  // Disconnects requested from this page, followed until closed or expired.
  const [tracked, setTracked] = useState<Session[]>([]);

  const trackedIds = useMemo(() => new Set(tracked.map((s) => s.id)), [tracked]);
  const graceSeconds = system.data?.heartbeatGraceSeconds;

  const columns = useMemo<ColumnDef<Session>[]>(
    () => [
      {
        id: 'target',
        header: 'Target device',
        cell: ({ row }) => <TargetCell session={row.original} />,
      },
      {
        id: 'initiator',
        header: 'Initiator',
        cell: ({ row }) => <InitiatorCell session={row.original} />,
      },
      {
        id: 'authenticated',
        header: 'Authenticated',
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row }) => <AuthenticatedBadge authenticated={row.original.authenticated} />,
      },
      {
        id: 'startedAt',
        header: 'Started',
        meta: { className: 'hidden sm:table-cell' },
        cell: ({ row }) => <DateTimeText value={row.original.startedAt} />,
      },
      {
        id: 'elapsed',
        header: 'Elapsed',
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <LiveElapsed startedAt={row.original.startedAt} />
            <HeartbeatFlag session={row.original} graceSeconds={graceSeconds} />
          </div>
        ),
      },
      {
        id: 'connType',
        header: 'Type',
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row }) => connTypeLabel(row.original),
      },
      {
        id: 'initiatorIp',
        header: 'Initiator IP',
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.initiatorIp ?? '—'}</span>
        ),
      },
      {
        id: 'lastSeenAt',
        header: 'Last seen',
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row }) => <DateTimeText value={row.original.lastSeenAt} fallback="Never" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) =>
          trackedIds.has(row.original.id) ? (
            <DisconnectProgress sessionId={row.original.id} />
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirming(row.original)}
              aria-label={`Disconnect session on ${row.original.deviceId}`}
            >
              <PowerIcon aria-hidden />
              Disconnect
            </Button>
          ),
      },
    ],
    [graceSeconds, trackedIds],
  );

  return (
    <>
      <PageHeader
        title="Active sessions"
        description="Connections the devices currently report as open."
        actions={
          <>
            <LastUpdated at={sessions.dataUpdatedAt} />
            <Select value={String(intervalMs)} onValueChange={(v) => setIntervalMs(Number(v))}>
              <SelectTrigger size="sm" aria-label="Auto-refresh interval" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {refreshOptions(config.activeSessionsRefreshMs).map((ms) => (
                  <SelectItem key={ms} value={String(ms)}>
                    Every {formatDuration(ms / 1000)}
                  </SelectItem>
                ))}
                <SelectItem value="0">Auto-refresh off</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void sessions.refetch()}
              disabled={sessions.isFetching}
            >
              <RefreshCwIcon
                aria-hidden
                className={sessions.isFetching ? 'animate-spin' : undefined}
              />
              Refresh
            </Button>
          </>
        }
      />

      {sessions.data ? <StaleDataAlert error={sessions.error} /> : null}

      {tracked.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Disconnect requests</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {tracked.map((s) => (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="space-y-1">
                    <p className="text-sm">
                      Device <span className="font-mono">{s.deviceId}</span>
                      {s.initiatorId ? (
                        <>
                          {' '}
                          ← <span className="font-mono">{s.initiatorId}</span>
                        </>
                      ) : null}
                    </p>
                    <DisconnectProgress sessionId={s.id} showDescription />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Dismiss disconnect request for ${s.deviceId}`}
                    onClick={() => setTracked((list) => list.filter((t) => t.id !== s.id))}
                  >
                    <XIcon aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        caption="Active sessions"
        columns={columns}
        data={sessions.data?.data}
        getRowId={(s) => s.id}
        isLoading={sessions.isPending}
        error={sessions.data ? undefined : sessions.error}
        onRetry={() => void sessions.refetch()}
        pagination={
          sessions.data
            ? {
                page: state.page,
                pageSize: PAGE_SIZE,
                total: sessions.data.total,
                onPageChange: (page) => update({ page }),
              }
            : undefined
        }
        empty={
          <EmptyState
            icon={ActivityIcon}
            title="No active sessions"
            description="Sessions appear here as soon as a device reports a new connection."
          />
        }
      />

      <DisconnectDialog
        session={confirming}
        ttlSeconds={system.data?.disconnectTtlSeconds}
        onOpenChange={(open) => !open && setConfirming(null)}
        onRequested={(s) =>
          setTracked((list) => (list.some((t) => t.id === s.id) ? list : [s, ...list]))
        }
      />
    </>
  );
}
