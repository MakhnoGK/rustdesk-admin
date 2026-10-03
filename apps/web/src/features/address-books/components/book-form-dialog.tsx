import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { AddressBook } from '@/api/types';
import { FormAlert } from '@/components/form-alert';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { handleFormError } from '@/lib/form-errors';
import { useCreateBook, useUpdateBook } from '../api';
import { bookFormSchema, type BookFormValues } from '../schemas';
import { FormActions } from './form-actions';

/** Create a shared book (`book` null) or rename/edit the note of an existing one. */
export function BookFormDialog({
  open,
  book,
  onClose,
}: {
  open: boolean;
  book: AddressBook | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return <BookForm key={book?.guid ?? 'new'} book={book} onClose={onClose} />;
}

function BookForm({ book, onClose }: { book: AddressBook | null; onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateBook();
  const update = useUpdateBook();
  const pending = create.isPending || update.isPending;
  const form = useForm<BookFormValues>({
    resolver: zodResolver(bookFormSchema),
    defaultValues: { name: book?.name ?? '', note: book?.note ?? '' },
  });
  const { errors } = form.formState;
  const onError = (error: unknown) =>
    handleFormError(error, form, { fields: ['name', 'note'], conflictField: 'name' });

  const onSubmit = form.handleSubmit((v) => {
    const body = { name: v.name, note: v.note.trim() === '' ? null : v.note.trim() };
    if (book) {
      update.mutate(
        { guid: book.guid, body },
        {
          onSuccess: () => {
            toast.success('Address book updated');
            onClose();
          },
          onError,
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: (created) => {
          toast.success(`Address book “${created.name}” created`);
          onClose();
          void navigate(`/address-books/${created.guid}`);
        },
        onError,
      });
    }
  });

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={book ? `Edit “${book.name}”` : 'Create shared address book'}
      description={book ? undefined : 'You own the new book. Share it with users afterwards.'}
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-5">
          <FormAlert form={form} />
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="book-name">Name</FieldLabel>
            <Input id="book-name" aria-invalid={!!errors.name} {...form.register('name')} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={!!errors.note}>
            <FieldLabel htmlFor="book-note">Note (optional)</FieldLabel>
            <Textarea
              id="book-note"
              rows={3}
              aria-invalid={!!errors.note}
              {...form.register('note')}
            />
            <FieldError errors={[errors.note]} />
          </Field>
          <FormActions pending={pending} label={book ? 'Save' : 'Create'} onCancel={onClose} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
