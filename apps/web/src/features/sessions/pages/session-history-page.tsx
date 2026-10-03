import type { ColumnDef } from '@tanstack/react-table';
import { HistoryIcon, SearchXIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { Session } from '@/api/types';
import { DataTable } from '@/components/data-table';
import { DateTimeText } from '@/components/date-time-text';
import { DurationText } from '@/components/duration-text';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StaleDataAlert } from '@/components/stale-data-alert';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { useDisplayZone } from '@/hooks/use-display-zone';
import { useUrlState } from '@/hooks/use-url-state';
import { closeReasonLabel, connTypeLabel } from '@/lib/format';
import { useSessionHistory } from '../api';
import { InitiatorCell, TargetCell } from '../components/session-cells';
import { SessionDetailSheet } from '../components/session-detail-sheet';
import { SessionHistoryFilters } from '../components/session-history-filters';
import { hasHistoryFilters, historySearchSchema, toSessionListQuery } from '../schemas';

export function SessionHistoryPage() {
  const { zone } = useDisplayZone();
  const { state, update, reset } = useUrlState(historySearchSchema);
  // The open detail sheet is not a filter: it is left out of the API query.
  const query = useMemo(() => toSessionListQuery(state, zone), [state, zone]);
  const sessions = useSessionHistory(query);
  const filtered = hasHistoryFilters(state);

  const columns = useMemo<ColumnDef<Session>[]>(
    () => [
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'target',
        header: 'Target',
        cell: ({ row }) => <TargetCell session={row.original} />,
      },
      {
        id: 'initiator',
        header: 'Initiator',
        cell: ({ row }) => <InitiatorCell session={row.original} />,
      },
      {
        id: 'startedAt',
        header: 'Started',
        meta: { sortField: 'startedAt', className: 'hidden sm:table-cell' },
        cell: ({ row }) => <DateTimeText value={row.original.startedAt} />,
      },
      {
        id: 'closedAt',
        header: 'Closed',
        meta: { sortField: 'closedAt', className: 'hidden lg:table-cell' },
        cell: ({ row }) => <DateTimeText value={row.original.closedAt} />,
      },
      {
        id: 'duration',
        header: 'Duration',
        meta: { sortField: 'durationSeconds' },
        cell: ({ row }) => (
          <DurationText
            seconds={row.original.durationSeconds}
            estimated={row.original.durationEstimated}
            closeReason={row.original.closeReason}
          />
        ),
      },
      {
        id: 'closeReason',
        header: 'Close reason',
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row }) => closeReasonLabel(row.original.closeReason),
      },
      {
        id: 'connType',
        header: 'Type',
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row }) => (
          <span className="tabular-nums">{connTypeLabel(row.original.connType)}</span>
        ),
      },
      {
        id: 'open',
        header: () => <span className="sr-only">Details</span>,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ session: row.original.id }, { replace: false })}
            aria-label={`Details of session on ${row.original.deviceId} started ${row.original.startedAt}`}
          >
            Details
          </Button>
        ),
      },
    ],
    [update],
  );

  // Opening/closing the sheet must not reset the page.
  const setSheet = (session: string | undefined) => update({ session, page: state.page });

  return (
    <>
      <PageHeader
        title="Session history"
        description="Every session reported by the devices. Durations marked ≈ are estimated."
      />
      <SessionHistoryFilters
        state={state}
        update={update}
        onClear={() => reset(['sort', 'pageSize'])}
      />
      {sessions.data ? <StaleDataAlert error={sessions.error} /> : null}
      <DataTable
        caption="Session history"
        columns={columns}
        data={sessions.data?.data}
        getRowId={(s) => s.id}
        isLoading={sessions.isPending}
        error={sessions.data ? undefined : sessions.error}
        onRetry={() => void sessions.refetch()}
        sort={state.sort}
        onSortChange={(sort) => update({ sort })}
        onRowClick={(s) => setSheet(s.id)}
        pagination={
          sessions.data
            ? {
                page: state.page,
                pageSize: state.pageSize,
                total: sessions.data.total,
                onPageChange: (page) => update({ page }),
              }
            : undefined
        }
        empty={
          filtered ? (
            <EmptyState
              icon={SearchXIcon}
              title="No sessions match these filters"
              description="Change or clear the filters to see more."
              action={
                <Button variant="outline" onClick={() => reset(['sort', 'pageSize'])}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={HistoryIcon}
              title="No sessions yet"
              description="Sessions appear once RustDesk clients with this API server report connections."
            />
          )
        }
      />
      <SessionDetailSheet sessionId={state.session} onClose={() => setSheet(undefined)} />
    </>
  );
}
