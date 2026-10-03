import type { ColumnDef } from '@tanstack/react-table';
import { HistoryIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import type { Session } from '@/api/types';
import { DataTable } from '@/components/data-table';
import { DateTimeText } from '@/components/date-time-text';
import { DurationText } from '@/components/duration-text';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useSessionHistory } from '@/features/sessions/api';
import { InitiatorCell } from '@/features/sessions/components/session-cells';
import { historyHref } from '@/features/sessions/schemas';

const RECENT = 10;

/** The device's latest sessions as a target: the session history filtered by its RustDesk ID. */
export function DeviceRecentSessions({ rustdeskId }: { rustdeskId: string }) {
  const sessions = useSessionHistory({
    deviceId: rustdeskId,
    page: 1,
    pageSize: RECENT,
    sort: 'startedAt:desc',
  });

  const columns = useMemo<ColumnDef<Session>[]>(
    () => [
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'initiator',
        header: 'Initiator',
        cell: ({ row }) => <InitiatorCell session={row.original} />,
      },
      {
        id: 'startedAt',
        header: 'Started',
        meta: { className: 'hidden sm:table-cell' },
        cell: ({ row }) => <DateTimeText value={row.original.startedAt} />,
      },
      {
        id: 'duration',
        header: 'Duration',
        cell: ({ row }) => (
          <DurationText
            seconds={row.original.durationSeconds}
            estimated={row.original.durationEstimated}
            closeReason={row.original.closeReason}
          />
        ),
      },
    ],
    [],
  );

  const allHref = historyHref({ deviceId: rustdeskId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sessions</CardTitle>
        <CardDescription>Connections to this device (as the target).</CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link to={allHref}>View all</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DataTable
          caption={`Recent sessions of ${rustdeskId}`}
          columns={columns}
          data={sessions.data?.data}
          getRowId={(s) => s.id}
          isLoading={sessions.isPending}
          error={sessions.error}
          onRetry={() => void sessions.refetch()}
          skeletonRows={4}
          empty={<EmptyState icon={HistoryIcon} title="No sessions for this device yet" />}
        />
      </CardContent>
    </Card>
  );
}
