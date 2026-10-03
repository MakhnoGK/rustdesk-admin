import type { ColumnDef } from '@tanstack/react-table';
import {
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchXIcon,
  Trash2Icon,
  UsersRoundIcon,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { AddressBook, Peer, Tag } from '@/api/types';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RustdeskId } from '@/components/copy-button';
import { DataTable } from '@/components/data-table';
import { DebouncedInput } from '@/components/debounced-input';
import { EmptyState } from '@/components/empty-state';
import { StaleDataAlert } from '@/components/stale-data-alert';
import { TagChip, TagColorDot } from '@/components/tag-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDeletePeer, usePeers } from '../api';
import { PEER_PAGE_SIZE, toPeerListQuery, type BookViewSearch } from '../schemas';
import { PeerFormDialog } from './peer-form-dialog';

const ANY = '__any__';

type Update = (patch: Record<string, string | number | undefined>) => void;

export function PeersTab({
  book,
  tags,
  state,
  update,
}: {
  book: AddressBook;
  tags: Tag[];
  state: BookViewSearch;
  update: Update;
}) {
  const id = useId();
  const peers = usePeers(book.guid, toPeerListQuery(state));
  const remove = useDeletePeer(book.guid);
  const [editing, setEditing] = useState<Peer | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Peer | null>(null);
  const filtered = state.q !== undefined || state.tag !== undefined;
  const colors = useMemo(() => new Map(tags.map((t) => [t.name, t.color])), [tags]);

  const columns = useMemo<ColumnDef<Peer>[]>(
    () => [
      {
        id: 'peerId',
        header: 'RustDesk ID',
        cell: ({ row }) => <RustdeskId id={row.original.peerId} />,
      },
      {
        id: 'alias',
        header: 'Alias',
        cell: ({ row }) => (
          <span className="block max-w-48 truncate">{row.original.alias || '—'}</span>
        ),
      },
      {
        id: 'hostname',
        header: 'Hostname',
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row }) => row.original.hostname || '—',
      },
      {
        id: 'username',
        header: 'Username',
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row }) => row.original.username || '—',
      },
      {
        id: 'platform',
        header: 'Platform',
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row }) => row.original.platform || '—',
      },
      {
        id: 'tags',
        header: 'Tags',
        meta: { className: 'hidden sm:table-cell' },
        cell: ({ row }) => (
          <span className="flex max-w-72 flex-wrap gap-1">
            {row.original.tags.map((t) => (
              <TagChip key={t} name={t} color={colors.get(t)} />
            ))}
          </span>
        ),
      },
      {
        id: 'credentials',
        header: 'Credentials',
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.hasPassword ? (
              <Badge variant="secondary" title="A shared password is stored (never shown)">
                <KeyRoundIcon aria-hidden /> Password
              </Badge>
            ) : null}
            {row.original.hasHash ? (
              <Badge variant="outline" title="The client saved a password hash (never shown)">
                Saved hash
              </Badge>
            ) : null}
            {!row.original.hasPassword && !row.original.hasHash ? (
              <span className="text-muted-foreground">—</span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for peer ${row.original.peerId}`}
              >
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(row.original)}>
                <PencilIcon aria-hidden /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2Icon aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [colors],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1.5 sm:w-72">
          <Label htmlFor={`${id}-q`}>Search</Label>
          <DebouncedInput
            id={`${id}-q`}
            search
            value={state.q}
            onCommit={(q) => update({ q })}
            placeholder="Peer ID, alias, hostname"
          />
        </div>
        <div className="w-48 space-y-1.5">
          <Label htmlFor={`${id}-tag`}>Tag</Label>
          <Select
            value={state.tag ?? ANY}
            onValueChange={(v) => update({ tag: v === ANY ? undefined : v })}
          >
            <SelectTrigger id={`${id}-tag`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any tag</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  <TagColorDot color={t.color} />
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="ml-auto" onClick={() => setAdding(true)}>
          <PlusIcon aria-hidden /> Add peer
        </Button>
      </div>
      {peers.data ? <StaleDataAlert error={peers.error} /> : null}
      <DataTable
        caption={`Peers of ${book.name}`}
        columns={columns}
        data={peers.data?.data}
        getRowId={(p) => p.peerId}
        isLoading={peers.isPending}
        error={peers.data ? undefined : peers.error}
        onRetry={() => void peers.refetch()}
        pagination={
          peers.data
            ? {
                page: state.page,
                pageSize: PEER_PAGE_SIZE,
                total: peers.data.total,
                onPageChange: (page) => update({ page }),
              }
            : undefined
        }
        empty={
          filtered ? (
            <EmptyState
              icon={SearchXIcon}
              title="No peers match these filters"
              action={
                <Button variant="outline" onClick={() => update({ q: undefined, tag: undefined })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={UsersRoundIcon}
              title="No peers in this address book"
              action={
                <Button onClick={() => setAdding(true)}>
                  <PlusIcon aria-hidden /> Add peer
                </Button>
              }
            />
          )
        }
      />
      <PeerFormDialog
        open={adding || !!editing}
        book={book}
        peer={editing}
        tags={tags}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete peer ${deleting?.peerId ?? ''}?`}
        description={
          <p>
            <strong className="font-mono">{deleting?.peerId}</strong>
            {deleting?.alias ? ` (${deleting.alias})` : ''} is removed from “{book.name}” for every
            user of this address book.
          </p>
        }
        confirmLabel="Delete peer"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.peerId, {
            onSuccess: () => {
              toast.success(`Peer ${deleting.peerId} deleted`);
              setDeleting(null);
            },
            onError: () => setDeleting(null),
          })
        }
      />
    </div>
  );
}
