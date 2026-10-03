import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { AddressBook, CreatePeerBody, Peer, Tag } from '@/api/types';
import { FormAlert } from '@/components/form-alert';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { TagMultiSelect } from '@/components/tag-multi-select';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { handleFormError } from '@/lib/form-errors';
import { useCreatePeer, useUpdatePeer } from '../api';
import { peerFormSchema, type PeerFormValues } from '../schemas';
import { FormActions } from './form-actions';

const FIELDS = [
  'peerId',
  'alias',
  'hostname',
  'username',
  'platform',
  'note',
  'tags',
  'password',
] as const;

/** Add a peer (`peer` null) or edit one. The password is write-only and only for shared books. */
export function PeerFormDialog({
  open,
  book,
  peer,
  tags,
  onClose,
}: {
  open: boolean;
  book: AddressBook;
  peer: Peer | null;
  tags: Tag[];
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <PeerForm key={peer?.peerId ?? 'new'} book={book} peer={peer} tags={tags} onClose={onClose} />
  );
}

function PeerForm({
  book,
  peer,
  tags,
  onClose,
}: {
  book: AddressBook;
  peer: Peer | null;
  tags: Tag[];
  onClose: () => void;
}) {
  const create = useCreatePeer(book.guid);
  const update = useUpdatePeer(book.guid);
  const pending = create.isPending || update.isPending;
  const shared = book.kind === 'SHARED';
  const form = useForm<PeerFormValues>({
    resolver: zodResolver(peerFormSchema),
    defaultValues: {
      peerId: peer?.peerId ?? '',
      alias: peer?.alias ?? '',
      hostname: peer?.hostname ?? '',
      username: peer?.username ?? '',
      platform: peer?.platform ?? '',
      note: peer?.note ?? '',
      tags: peer?.tags ?? [],
      password: '',
      clearPassword: false,
    },
  });
  const { errors } = form.formState;
  const clearPassword = useWatch({ control: form.control, name: 'clearPassword' });

  const close = () => {
    form.reset();
    onClose();
  };
  const onError = (error: unknown) => {
    form.resetField('password');
    handleFormError(error, form, { fields: FIELDS, conflictField: 'peerId' });
  };

  const onSubmit = form.handleSubmit((v) => {
    const body: Omit<CreatePeerBody, 'peerId'> = {
      alias: v.alias,
      hostname: v.hostname,
      username: v.username,
      platform: v.platform,
      note: v.note,
      tags: v.tags,
    };
    // Write-only: omitted = unchanged, '' = remove the stored password.
    if (shared && v.clearPassword) body.password = '';
    else if (shared && v.password !== '') body.password = v.password;

    if (peer) {
      update.mutate(
        { peerId: peer.peerId, body },
        {
          onSettled: () => update.reset(),
          onSuccess: () => {
            toast.success(`Peer ${peer.peerId} updated`);
            close();
          },
          onError,
        },
      );
    } else {
      create.mutate(
        { ...body, peerId: v.peerId },
        {
          onSettled: () => create.reset(),
          onSuccess: (created) => {
            toast.success(`Peer ${created.peerId} added`);
            close();
          },
          onError,
        },
      );
    }
  });

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && close()}
      title={peer ? `Edit peer ${peer.peerId}` : 'Add peer'}
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-5">
          <FormAlert form={form} />
          <Field data-invalid={!!errors.peerId}>
            <FieldLabel htmlFor="peer-id">RustDesk ID</FieldLabel>
            <Input
              id="peer-id"
              autoComplete="off"
              readOnly={!!peer}
              aria-invalid={!!errors.peerId}
              className="font-mono"
              {...form.register('peerId')}
            />
            {peer ? (
              <FieldDescription>The ID of an existing peer cannot be changed.</FieldDescription>
            ) : null}
            <FieldError errors={[errors.peerId]} />
          </Field>
          <Field data-invalid={!!errors.alias}>
            <FieldLabel htmlFor="peer-alias">Alias</FieldLabel>
            <Input id="peer-alias" aria-invalid={!!errors.alias} {...form.register('alias')} />
            <FieldError errors={[errors.alias]} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={!!errors.hostname}>
              <FieldLabel htmlFor="peer-hostname">Hostname</FieldLabel>
              <Input
                id="peer-hostname"
                aria-invalid={!!errors.hostname}
                {...form.register('hostname')}
              />
              <FieldError errors={[errors.hostname]} />
            </Field>
            <Field data-invalid={!!errors.username}>
              <FieldLabel htmlFor="peer-username">Username</FieldLabel>
              <Input
                id="peer-username"
                aria-invalid={!!errors.username}
                {...form.register('username')}
              />
              <FieldError errors={[errors.username]} />
            </Field>
          </div>
          <Field data-invalid={!!errors.platform}>
            <FieldLabel htmlFor="peer-platform">Platform</FieldLabel>
            <Input
              id="peer-platform"
              placeholder="Windows, Linux, Mac OS, Android"
              aria-invalid={!!errors.platform}
              {...form.register('platform')}
            />
            <FieldError errors={[errors.platform]} />
          </Field>
          <Field data-invalid={!!errors.tags}>
            <FieldLabel htmlFor="peer-tags">Tags</FieldLabel>
            <Controller
              control={form.control}
              name="tags"
              render={({ field }) => (
                <TagMultiSelect
                  id="peer-tags"
                  tags={tags}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!errors.tags}
                />
              )}
            />
            <FieldError errors={[errors.tags]} />
          </Field>
          <Field data-invalid={!!errors.note}>
            <FieldLabel htmlFor="peer-note">Note</FieldLabel>
            <Textarea
              id="peer-note"
              rows={3}
              aria-invalid={!!errors.note}
              {...form.register('note')}
            />
            <FieldError errors={[errors.note]} />
          </Field>
          {shared ? (
            <Field data-invalid={!!errors.password} data-disabled={clearPassword}>
              <FieldLabel htmlFor="peer-password">
                {peer?.hasPassword ? 'Set a new password' : 'Set password'}
              </FieldLabel>
              <Input
                id="peer-password"
                type="password"
                autoComplete="new-password"
                disabled={clearPassword}
                aria-invalid={!!errors.password}
                {...form.register('password')}
              />
              <FieldDescription>
                Write-only: it is never shown again. Leave empty to keep the current one.
              </FieldDescription>
              <FieldError errors={[errors.password]} />
              {peer?.hasPassword ? (
                <Controller
                  control={form.control}
                  name="clearPassword"
                  render={({ field }) => (
                    <Field orientation="horizontal">
                      <Checkbox
                        id="peer-clear-password"
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                      <FieldLabel htmlFor="peer-clear-password" className="font-normal">
                        Remove the stored password
                      </FieldLabel>
                    </Field>
                  )}
                />
              ) : null}
            </Field>
          ) : null}
          <FormActions pending={pending} label={peer ? 'Save' : 'Add peer'} onCancel={close} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
