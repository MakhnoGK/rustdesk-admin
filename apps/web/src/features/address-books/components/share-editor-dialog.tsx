import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2Icon, UserPlusIcon } from 'lucide-react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { AddressBook, Share } from '@/api/types';
import { ErrorState } from '@/components/error-state';
import { FormAlert } from '@/components/form-alert';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPicker } from '@/features/users/components/user-picker';
import { handleFormError } from '@/lib/form-errors';
import { SHARE_RULES } from '@/lib/format';
import { useReplaceShares, useShares } from '../api';
import { shareFormSchema, type ShareFormValues } from '../schemas';
import { FormActions } from './form-actions';

/** Who a shared book is shared with, and with which rule. Saved as a whole (PUT). */
export function ShareEditorDialog({
  book,
  onClose,
}: {
  book: AddressBook | null;
  onClose: () => void;
}) {
  if (!book) return null;
  return <ShareEditor key={book.guid} book={book} onClose={onClose} />;
}

function ShareEditor({ book, onClose }: { book: AddressBook; onClose: () => void }) {
  const shares = useShares(book.guid);
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Share “${book.name}”`}
      description="Read-only users see the peers; read/write users edit them; full control also manages the book."
    >
      {shares.error ? (
        <ErrorState error={shares.error} onRetry={() => void shares.refetch()} />
      ) : !shares.data ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <ShareForm book={book} initial={shares.data} onClose={onClose} />
      )}
    </ResponsiveDialog>
  );
}

function ShareForm({
  book,
  initial,
  onClose,
}: {
  book: AddressBook;
  initial: Share[];
  onClose: () => void;
}) {
  const replace = useReplaceShares(book.guid);
  const form = useForm<ShareFormValues>({
    resolver: zodResolver(shareFormSchema),
    defaultValues: {
      shares: initial.map((s) => ({ userId: s.userId, username: s.username, rule: s.rule })),
    },
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'shares',
    keyName: 'key',
  });
  const taken = fields.map((f) => f.userId);
  const exclude = book.ownerId ? [...taken, book.ownerId] : taken;

  const onSubmit = form.handleSubmit((v) => {
    replace.mutate(
      v.shares.map(({ userId, rule }) => ({ userId, rule })),
      {
        onSuccess: () => {
          toast.success('Sharing updated');
          onClose();
        },
        onError: (error) => handleFormError(error, form, { fields: ['shares'] }),
      },
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup className="gap-4">
        <FormAlert form={form} />
        {fields.length ? (
          <ul className="divide-y rounded-md border" aria-label="Shared with">
            {fields.map((field, index) => (
              <li key={field.key} className="flex flex-wrap items-center gap-2 p-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {field.username}
                </span>
                <Controller
                  control={form.control}
                  name={`shares.${index}.rule`}
                  render={({ field: rule }) => (
                    <Select
                      value={String(rule.value)}
                      onValueChange={(v) => rule.onChange(Number(v))}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-36"
                        aria-label={`Access of ${field.username}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHARE_RULES.map((r) => (
                          <SelectItem key={r.value} value={String(r.value)}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(index)}
                  aria-label={`Stop sharing with ${field.username}`}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Not shared with anyone yet.</p>
        )}
        <div className="flex items-center gap-2">
          <UserPlusIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <UserPicker
            value={undefined}
            placeholder="Add a user…"
            aria-label="Add a user"
            exclude={exclude}
            onChange={(user) =>
              user && append({ userId: user.id, username: user.username, rule: 1 })
            }
          />
        </div>
        <FormActions pending={replace.isPending} label="Save sharing" onCancel={onClose} />
      </FieldGroup>
    </form>
  );
}
