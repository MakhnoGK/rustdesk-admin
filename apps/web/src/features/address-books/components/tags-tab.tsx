import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, TagsIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { AddressBook, Tag } from '@/api/types';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { TagChip } from '@/components/tag-chip';
import { Button } from '@/components/ui/button';
import { argbToHex } from '@/lib/color';
import { formatCount } from '@/lib/format';
import { useDeleteTag } from '../api';
import { TagFormDialog } from './tag-form-dialog';

export function TagsTab({
  book,
  tags,
  isLoading,
  error,
  onRetry,
}: {
  book: AddressBook;
  tags: Tag[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const [editing, setEditing] = useState<Tag | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const remove = useDeleteTag(book.guid);

  const columns = useMemo<ColumnDef<Tag>[]>(
    () => [
      {
        id: 'tag',
        header: 'Tag',
        cell: ({ row }) => <TagChip name={row.original.name} color={row.original.color} />,
      },
      {
        id: 'color',
        header: 'Color',
        meta: { className: 'hidden sm:table-cell' },
        cell: ({ row }) => (
          <span className="font-mono text-xs">{argbToHex(row.original.color)}</span>
        ),
      },
      {
        id: 'peerCount',
        header: 'Peers',
        cell: ({ row }) => (
          <span className="tabular-nums">{formatCount(row.original.peerCount)}</span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <span className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setEditing(row.original)}
              aria-label={`Edit tag ${row.original.name}`}
            >
              <PencilIcon aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setDeleting(row.original)}
              aria-label={`Delete tag ${row.original.name}`}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <PlusIcon aria-hidden /> Create tag
        </Button>
      </div>
      <DataTable
        caption={`Tags of ${book.name}`}
        columns={columns}
        data={tags}
        getRowId={(t) => t.name}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        skeletonRows={4}
        empty={
          <EmptyState
            icon={TagsIcon}
            title="No tags yet"
            description="Tags group peers in RustDesk clients."
            action={
              <Button onClick={() => setAdding(true)}>
                <PlusIcon aria-hidden /> Create tag
              </Button>
            }
          />
        }
      />
      <TagFormDialog
        open={adding || !!editing}
        guid={book.guid}
        tag={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete tag “${deleting?.name ?? ''}”?`}
        description={
          deleting?.peerCount ? (
            <p>
              It is removed from <strong>{formatCount(deleting.peerCount)}</strong>{' '}
              {deleting.peerCount === 1 ? 'peer' : 'peers'}. The peers themselves stay.
            </p>
          ) : (
            <p>No peer carries this tag.</p>
          )
        }
        confirmLabel="Delete tag"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.name, {
            onSuccess: () => {
              toast.success(`Tag “${deleting.name}” deleted`);
              setDeleting(null);
            },
            onError: () => setDeleting(null),
          })
        }
      />
    </div>
  );
}
