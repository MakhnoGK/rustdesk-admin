import { KeyRoundIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { User } from '@/api/types';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/features/auth/use-current-user';
import { useDeleteUser } from '../api';
import { EditUserDialog, ResetPasswordDialog } from './user-form-dialogs';

type Dialog = 'edit' | 'password' | 'delete' | null;

/** Edit, reset password and delete for one user. You cannot delete yourself. */
export function UserActions({ user, onDeleted }: { user: User; onDeleted?: () => void }) {
  const { user: me } = useCurrentUser();
  const self = me.id === user.id;
  const [dialog, setDialog] = useState<Dialog>(null);
  const remove = useDeleteUser();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.username}`}>
            <MoreHorizontalIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog('edit')}>
            <PencilIcon aria-hidden /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog('password')}>
            <KeyRoundIcon aria-hidden /> Reset password
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={self}
            onSelect={() => setDialog('delete')}
            title={self ? 'You cannot delete your own account' : undefined}
          >
            <Trash2Icon aria-hidden /> {self ? 'Delete (not yourself)' : 'Delete'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <EditUserDialog user={dialog === 'edit' ? user : null} onOpenChange={() => setDialog(null)} />
      <ResetPasswordDialog
        user={dialog === 'password' ? user : null}
        onOpenChange={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Delete ${user.username}?`}
        description={
          <p>
            The user, their personal address book and their tokens are deleted. RustDesk clients
            signed in as this user are signed out. This cannot be undone.
          </p>
        }
        confirmLabel="Delete user"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(user.id, {
            onSuccess: () => {
              toast.success(`User ${user.username} deleted`);
              setDialog(null);
              onDeleted?.();
            },
            // Errors (e.g. 409 LAST_ADMIN: the last administrator) are shown as a toast with the
            // API's message by the mutation cache.
            onError: () => setDialog(null),
          })
        }
      />
    </>
  );
}
