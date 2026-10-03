import type { ColumnDef } from '@tanstack/react-table';
import { PlusIcon, SearchXIcon, UsersIcon } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { User } from '@/api/types';
import { DataTable } from '@/components/data-table';
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
import { useCurrentUser } from '@/features/auth/use-current-user';
import { useUrlState } from '@/hooks/use-url-state';
import { useUsers } from '../api';
import { RoleBadge, UserStatusBadge } from '../components/user-badges';
import { UserActions } from '../components/user-actions';
import { CreateUserDialog } from '../components/user-form-dialogs';
import { toUserListQuery, userSearchSchema } from '../schemas';

const ANY = 'any';

export function UsersPage() {
  const id = useId();
  const { user: me } = useCurrentUser();
  const { state, update, reset } = useUrlState(userSearchSchema);
  const users = useUsers(toUserListQuery(state));
  const [creating, setCreating] = useState(false);
  const filtered = state.q !== undefined || state.role !== undefined || state.status !== undefined;

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        id: 'username',
        header: 'Username',
        meta: { sortField: 'username' },
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <Link
              to={`/users/${row.original.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.original.username}
            </Link>
            {row.original.id === me.id ? <Badge variant="outline">You</Badge> : null}
          </span>
        ),
      },
      {
        id: 'displayName',
        header: 'Display name',
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row }) => row.original.displayName ?? '—',
      },
      {
        id: 'email',
        header: 'Email',
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row }) => row.original.email ?? '—',
      },
      {
        id: 'role',
        header: 'Role',
        meta: { sortField: 'role' },
        cell: ({ row }) => <RoleBadge role={row.original.role} />,
      },
      {
        id: 'status',
        header: 'Status',
        meta: { sortField: 'status', className: 'hidden sm:table-cell' },
        cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
      },
      {
        id: 'createdAt',
        header: 'Created',
        meta: { sortField: 'createdAt', className: 'hidden xl:table-cell' },
        cell: ({ row }) => <DateTimeText value={row.original.createdAt} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <UserActions user={row.original} />,
      },
    ],
    [me.id],
  );

  return (
    <>
      <PageHeader
        title="Users"
        description="Accounts for RustDesk clients and administrators of this panel."
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon aria-hidden /> Create user
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1.5 sm:w-72">
          <Label htmlFor={`${id}-q`}>Search</Label>
          <DebouncedInput
            id={`${id}-q`}
            search
            value={state.q}
            onCommit={(q) => update({ q })}
            placeholder="Username, name or email"
          />
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor={`${id}-role`}>Role</Label>
          <Select
            value={state.role ?? ANY}
            onValueChange={(v) => update({ role: v === ANY ? undefined : v })}
          >
            <SelectTrigger id={`${id}-role`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any role</SelectItem>
              <SelectItem value="ADMIN">Administrator</SelectItem>
              <SelectItem value="USER">User</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-40 space-y-1.5">
          <Label htmlFor={`${id}-status`}>Status</Label>
          <Select
            value={state.status ?? ANY}
            onValueChange={(v) => update({ status: v === ANY ? undefined : v })}
          >
            <SelectTrigger id={`${id}-status`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="DISABLED">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {users.data ? <StaleDataAlert error={users.error} /> : null}
      <DataTable
        caption="Users"
        columns={columns}
        data={users.data?.data}
        getRowId={(u) => u.id}
        isLoading={users.isPending}
        error={users.data ? undefined : users.error}
        onRetry={() => void users.refetch()}
        sort={state.sort}
        onSortChange={(sort) => update({ sort })}
        pagination={
          users.data
            ? {
                page: state.page,
                pageSize: state.pageSize,
                total: users.data.total,
                onPageChange: (page) => update({ page }),
              }
            : undefined
        }
        empty={
          filtered ? (
            <EmptyState
              icon={SearchXIcon}
              title="No users match these filters"
              action={
                <Button variant="outline" onClick={() => reset(['sort'])}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={UsersIcon} title="No users yet" />
          )
        }
      />
      <CreateUserDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
