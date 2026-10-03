import type { ColumnDef } from '@tanstack/react-table';
import { MonitorIcon, SearchXIcon } from 'lucide-react';
import { useId, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Device } from '@/api/types';
import { RustdeskId } from '@/components/copy-button';
import { DataTable } from '@/components/data-table';
import { DateTimeText } from '@/components/date-time-text';
import { DebouncedInput } from '@/components/debounced-input';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StaleDataAlert } from '@/components/stale-data-alert';
import { OnlineBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUrlState } from '@/hooks/use-url-state';
import { useDevices } from '../api';
import { deviceHref, deviceSearchSchema, toDeviceListQuery } from '../schemas';

const ANY = 'any';

export function DevicesPage() {
  const id = useId();
  const navigate = useNavigate();
  const { state, update, reset } = useUrlState(deviceSearchSchema);
  const devices = useDevices(toDeviceListQuery(state));
  const filtered = state.q !== undefined || state.online !== undefined;

  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        id: 'rustdeskId',
        header: 'RustDesk ID',
        meta: { sortField: 'rustdeskId' },
        cell: ({ row }) => <RustdeskId id={row.original.rustdeskId} />,
      },
      {
        id: 'hostname',
        header: 'Hostname',
        meta: { sortField: 'hostname' },
        cell: ({ row }) => (
          <Link
            to={deviceHref(row.original.uuid)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.original.hostname ?? <span className="text-muted-foreground">Unknown</span>}
          </Link>
        ),
      },
      {
        id: 'os',
        header: 'OS',
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row }) => (
          <span className="block max-w-56 truncate">{row.original.os ?? '—'}</span>
        ),
      },
      {
        id: 'version',
        header: 'Client',
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row }) => row.original.version ?? '—',
      },
      {
        id: 'username',
        header: 'User',
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row }) => row.original.username ?? '—',
      },
      {
        id: 'online',
        header: 'Status',
        cell: ({ row }) => <OnlineBadge online={row.original.online} />,
      },
      {
        id: 'lastHeartbeatAt',
        header: 'Last heartbeat',
        meta: { sortField: 'lastHeartbeatAt', className: 'hidden sm:table-cell' },
        cell: ({ row }) => <DateTimeText value={row.original.lastHeartbeatAt} fallback="Never" />,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Devices"
        description="Devices known from their heartbeats and system info."
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1.5 sm:w-72">
          <Label htmlFor={`${id}-q`}>Search</Label>
          <DebouncedInput
            id={`${id}-q`}
            search
            value={state.q}
            onCommit={(q) => update({ q })}
            placeholder="RustDesk ID, hostname or user"
          />
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor={`${id}-online`}>Status</Label>
          <Select
            value={state.online === undefined ? ANY : String(state.online)}
            onValueChange={(v) => update({ online: v === ANY ? undefined : v === 'true' })}
          >
            <SelectTrigger id={`${id}-online`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All devices</SelectItem>
              <SelectItem value="true">Online</SelectItem>
              <SelectItem value="false">Offline</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {devices.data ? <StaleDataAlert error={devices.error} /> : null}
      <DataTable
        caption="Devices"
        columns={columns}
        data={devices.data?.data}
        getRowId={(d) => d.uuid}
        isLoading={devices.isPending}
        error={devices.data ? undefined : devices.error}
        onRetry={() => void devices.refetch()}
        sort={state.sort}
        onSortChange={(sort) => update({ sort })}
        onRowClick={(d) => void navigate(deviceHref(d.uuid))}
        pagination={
          devices.data
            ? {
                page: state.page,
                pageSize: state.pageSize,
                total: devices.data.total,
                onPageChange: (page) => update({ page }),
              }
            : undefined
        }
        empty={
          filtered ? (
            <EmptyState
              icon={SearchXIcon}
              title="No devices match these filters"
              action={
                <Button variant="outline" onClick={() => reset(['sort'])}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={MonitorIcon}
              title="No devices yet"
              description="A device appears after its first heartbeat to this API server."
            />
          )
        }
      />
    </>
  );
}
