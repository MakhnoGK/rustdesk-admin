import type { ColumnDef } from '@tanstack/react-table';
import { BookUserIcon, PlusIcon, SearchXIcon } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AddressBook } from '@/api/types';
import { DataTable } from '@/components/data-table';
import { DateTimeText } from '@/components/date-time-text';
import { DebouncedInput } from '@/components/debounced-input';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StaleDataAlert } from '@/components/stale-data-alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPicker } from '@/features/users/components/user-picker';
import { useUrlState } from '@/hooks/use-url-state';
import { formatCount } from '@/lib/format';
import { useAddressBooks } from '../api';
import { BookActions } from '../components/book-actions';
import { BookFormDialog } from '../components/book-form-dialog';
import { BookKindBadge } from '../components/book-kind-badge';
import { bookSearchSchema, toBookListQuery } from '../schemas';

const ANY = 'any';

export function AddressBooksPage() {
  const id = useId();
  const navigate = useNavigate();
  const { state, update, reset } = useUrlState(bookSearchSchema);
  const books = useAddressBooks(toBookListQuery(state));
  const [creating, setCreating] = useState(false);
  const filtered = state.q !== undefined || state.kind !== undefined || state.ownerId !== undefined;

  const columns = useMemo<ColumnDef<AddressBook>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        meta: { sortField: 'name' },
        cell: ({ row }) => (
          <Link
            to={`/address-books/${row.original.guid}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      { id: 'kind', header: 'Kind', cell: ({ row }) => <BookKindBadge kind={row.original.kind} /> },
      {
        id: 'owner',
        header: 'Owner',
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row }) =>
          row.original.ownerUsername ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'peerCount',
        header: 'Peers',
        cell: ({ row }) => (
          <span className="tabular-nums">{formatCount(row.original.peerCount)}</span>
        ),
      },
      {
        id: 'shareCount',
        header: 'Shared with',
        meta: { className: 'hidden sm:table-cell' },
        cell: ({ row }) =>
          row.original.kind === 'SHARED' ? (
            <span className="tabular-nums">
              {formatCount(row.original.shareCount)}{' '}
              {row.original.shareCount === 1 ? 'user' : 'users'}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'updatedAt',
        header: 'Updated',
        meta: { sortField: 'updatedAt', className: 'hidden lg:table-cell' },
        cell: ({ row }) => <DateTimeText value={row.original.updatedAt} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <BookActions book={row.original} />,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Address books"
        description="Personal books (one per user) and shared books with per-user access."
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon aria-hidden /> Create shared book
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1.5 sm:w-64">
          <Label htmlFor={`${id}-q`}>Search</Label>
          <DebouncedInput
            id={`${id}-q`}
            search
            value={state.q}
            onCommit={(q) => update({ q })}
            placeholder="Book name"
          />
        </div>
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
              <SelectItem value={ANY}>All books</SelectItem>
              <SelectItem value="PERSONAL">Personal</SelectItem>
              <SelectItem value="SHARED">Shared</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-56 space-y-1.5">
          <Label htmlFor={`${id}-owner`}>Owner</Label>
          <UserPicker
            id={`${id}-owner`}
            value={
              state.ownerId
                ? { id: state.ownerId, username: state.owner ?? 'Selected user' }
                : undefined
            }
            onChange={(user) => update({ ownerId: user?.id, owner: user?.username })}
            placeholder="Any owner"
            allowClear
            clearLabel="Any owner"
          />
        </div>
      </div>
      {books.data ? <StaleDataAlert error={books.error} /> : null}
      <DataTable
        caption="Address books"
        columns={columns}
        data={books.data?.data}
        getRowId={(b) => b.guid}
        isLoading={books.isPending}
        error={books.data ? undefined : books.error}
        onRetry={() => void books.refetch()}
        sort={state.sort}
        onSortChange={(sort) => update({ sort })}
        onRowClick={(b) => void navigate(`/address-books/${b.guid}`)}
        pagination={
          books.data
            ? {
                page: state.page,
                pageSize: state.pageSize,
                total: books.data.total,
                onPageChange: (page) => update({ page }),
              }
            : undefined
        }
        empty={
          filtered ? (
            <EmptyState
              icon={SearchXIcon}
              title="No address books match these filters"
              action={
                <Button variant="outline" onClick={() => reset(['sort'])}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={BookUserIcon}
              title="No address books yet"
              description="A personal book is created when a user first syncs from a RustDesk client."
            />
          )
        }
      />
      <BookFormDialog open={creating} book={null} onClose={() => setCreating(false)} />
    </>
  );
}
