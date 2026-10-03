import type { ColumnDef } from '@tanstack/react-table';
import { FilterXIcon, ScrollTextIcon, SearchXIcon, XIcon } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { AuditEvent } from '@/api/types';
import { DataTable } from '@/components/data-table';
import { DateRangePicker } from '@/components/date-range-picker';
import { DateTimeText } from '@/components/date-time-text';
import { DebouncedInput } from '@/components/debounced-input';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StaleDataAlert } from '@/components/stale-data-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDisplayZone } from '@/hooks/use-display-zone';
import { useUrlState } from '@/hooks/use-url-state';
import { AUDIT_KIND_LABELS } from '@/lib/format';
import { boundToDay } from '@/lib/range';
import { useAuditEvents } from '../api';
import { AuditEventSheet } from '../components/audit-event-sheet';
import { AUDIT_KINDS, auditSearchSchema, hasAuditFilters, toAuditQuery } from '../schemas';

const ANY = 'any';

export function AuditPage() {
  const id = useId();
  const { zone } = useDisplayZone();
  const { state, update, reset } = useUrlState(auditSearchSchema);
  const query = useMemo(() => toAuditQuery(state, zone), [state, zone]);
  const events = useAuditEvents(query);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const filtered = hasAuditFilters(state);

  const columns = useMemo<ColumnDef<AuditEvent>[]>(
    () => [
      {
        id: 'kind',
        header: 'Kind',
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            <Badge variant="secondary">{AUDIT_KIND_LABELS[row.original.kind]}</Badge>
            {row.original.malformed ? <Badge variant="destructive">Malformed</Badge> : null}
          </span>
        ),
      },
      {
        id: 'device',
        header: 'Device',
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{row.original.deviceId ?? '—'}</span>
        ),
      },
      {
        id: 'connId',
        header: 'Conn ID',
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row }) => <span className="font-mono">{row.original.connId ?? '—'}</span>,
      },
      {
        id: 'receivedAt',
        header: 'Received',
        meta: { sortField: 'receivedAt' },
        cell: ({ row }) => <DateTimeText value={row.original.receivedAt} />,
      },
      {
        id: 'action',
        header: 'Action',
        meta: { className: 'hidden sm:table-cell' },
        cell: ({ row }) => row.original.action ?? '—',
      },
      {
        id: 'session',
        header: 'Session',
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row }) =>
          row.original.sessionId ? (
            <Link
              to={`/sessions?session=${row.original.sessionId}`}
              className="underline underline-offset-4"
            >
              Open
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'details',
        header: () => <span className="sr-only">Details</span>,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" onClick={() => setSelected(row.original)}>
            Payload
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Raw records posted by the devices, newest first."
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40 space-y-1.5">
          <Label htmlFor={`${id}-kind`}>Kind</Label>
          <Select
            value={state.kind ?? ANY}
            onValueChange={(v) => update({ kind: v === ANY ? undefined : v })}
          >
            <SelectTrigger id={`${id}-kind`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All kinds</SelectItem>
              {AUDIT_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {AUDIT_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48 space-y-1.5">
          <Label htmlFor={`${id}-device`}>Device ID</Label>
          <DebouncedInput
            id={`${id}-device`}
            value={state.deviceId}
            onCommit={(deviceId) => update({ deviceId })}
            placeholder="e.g. 123456789"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-range`}>Received</Label>
          <DateRangePicker
            id={`${id}-range`}
            value={{ from: boundToDay(state.from), to: boundToDay(state.to) }}
            onChange={(range) => update({ from: range?.from, to: range?.to })}
          />
        </div>
        {state.sessionId ? (
          <Badge variant="outline" className="h-9 gap-1 px-3">
            Session {state.sessionId.slice(0, 8)}…
            <button
              type="button"
              onClick={() => update({ sessionId: undefined })}
              aria-label="Remove the session filter"
              className="rounded-full"
            >
              <XIcon className="size-3" aria-hidden />
            </button>
          </Badge>
        ) : null}
        <Button variant="ghost" onClick={() => reset(['sort'])} disabled={!filtered}>
          <FilterXIcon aria-hidden /> Clear filters
        </Button>
      </div>
      {events.data ? <StaleDataAlert error={events.error} /> : null}
      <DataTable
        caption="Audit events"
        columns={columns}
        data={events.data?.data}
        getRowId={(e) => e.id}
        isLoading={events.isPending}
        error={events.data ? undefined : events.error}
        onRetry={() => void events.refetch()}
        sort={state.sort}
        onSortChange={(sort) => update({ sort })}
        onRowClick={setSelected}
        pagination={
          events.data
            ? {
                page: state.page,
                pageSize: state.pageSize,
                total: events.data.total,
                onPageChange: (page) => update({ page }),
              }
            : undefined
        }
        empty={
          filtered ? (
            <EmptyState
              icon={SearchXIcon}
              title="No events match these filters"
              action={
                <Button variant="outline" onClick={() => reset(['sort'])}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={ScrollTextIcon}
              title="No audit events yet"
              description="Devices post connection, file-transfer and alarm records here."
            />
          )
        }
      />
      <AuditEventSheet event={selected} onClose={() => setSelected(null)} />
    </>
  );
}
