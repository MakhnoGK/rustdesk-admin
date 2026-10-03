import { MoreHorizontalIcon, PencilIcon, Share2Icon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AddressBook } from '@/api/types';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCount } from '@/lib/format';
import { useDeleteBook } from '../api';
import { BookFormDialog } from './book-form-dialog';
import { ShareEditorDialog } from './share-editor-dialog';

type Dialog = 'edit' | 'share' | 'delete' | null;

/** Rename for every book; share and delete only for shared books (personal ones go with their user). */
export function BookActions({ book, onDeleted }: { book: AddressBook; onDeleted?: () => void }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const remove = useDeleteBook();
  const shared = book.kind === 'SHARED';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${book.name}`}>
            <MoreHorizontalIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog('edit')}>
            <PencilIcon aria-hidden /> Rename
          </DropdownMenuItem>
          {shared ? (
            <>
              <DropdownMenuItem onSelect={() => setDialog('share')}>
                <Share2Icon aria-hidden /> Share
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
                <Trash2Icon aria-hidden /> Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <BookFormDialog open={dialog === 'edit'} book={book} onClose={() => setDialog(null)} />
      <ShareEditorDialog book={dialog === 'share' ? book : null} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Delete “${book.name}”?`}
        description={
          <p>
            The book and its {formatCount(book.peerCount)} {book.peerCount === 1 ? 'peer' : 'peers'}{' '}
            are deleted for everyone it is shared with ({formatCount(book.shareCount)}{' '}
            {book.shareCount === 1 ? 'user' : 'users'}). This cannot be undone.
          </p>
        }
        confirmLabel="Delete address book"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(book.guid, {
            onSuccess: () => {
              toast.success(`Address book “${book.name}” deleted`);
              setDialog(null);
              onDeleted?.();
            },
            onError: () => setDialog(null),
          })
        }
      />
    </>
  );
}
