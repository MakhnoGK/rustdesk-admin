import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { User } from '@/api/types';
import { FormAlert } from '@/components/form-alert';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/features/auth/use-current-user';
import { handleFormError } from '@/lib/form-errors';
import { useCreateUser, useResetPassword, useUpdateUser } from '../api';
import {
  createUserSchema,
  editUserSchema,
  nullIfEmpty,
  resetPasswordSchema,
  type CreateUserValues,
  type EditUserValues,
  type ResetPasswordValues,
} from '../schemas';

function DialogActions({
  pending,
  label,
  onCancel,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner /> : null}
        {label}
      </Button>
    </div>
  );
}

export function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateUser();
  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { username: '', password: '', role: 'USER', displayName: '', email: '' },
  });
  const { errors } = form.formState;

  const close = () => {
    form.reset();
    onOpenChange(false);
  };

  const onSubmit = form.handleSubmit((v) => {
    create.mutate(
      {
        username: v.username,
        password: v.password,
        role: v.role,
        status: 'ACTIVE',
        displayName: nullIfEmpty(v.displayName),
        email: nullIfEmpty(v.email),
      },
      {
        onSettled: () => create.reset(),
        onSuccess: (user) => {
          toast.success(`User ${user.username} created`);
          close();
        },
        onError: (error) => {
          form.resetField('password');
          handleFormError(error, form, {
            fields: ['username', 'password', 'role', 'displayName', 'email'],
            conflictField: 'username',
          });
        },
      },
    );
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Create user"
      description="The user signs in to RustDesk clients with these credentials. Only administrators can use this panel."
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-5">
          <FormAlert form={form} />
          <Field data-invalid={!!errors.username}>
            <FieldLabel htmlFor="new-username">Username</FieldLabel>
            <Input
              id="new-username"
              autoComplete="off"
              aria-invalid={!!errors.username}
              {...form.register('username')}
            />
            <FieldDescription>
              2–64 characters: letters, digits, “.”, “_”, “-”. Stored lower-cased.
            </FieldDescription>
            <FieldError errors={[errors.username]} />
          </Field>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="new-password">Password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...form.register('password')}
            />
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.role}>
            <FieldLabel htmlFor="new-role">Role</FieldLabel>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="new-role" className="w-full" aria-invalid={!!errors.role}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">User</SelectItem>
                    <SelectItem value="ADMIN">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[errors.role]} />
          </Field>
          <Field data-invalid={!!errors.displayName}>
            <FieldLabel htmlFor="new-display">Display name (optional)</FieldLabel>
            <Input
              id="new-display"
              aria-invalid={!!errors.displayName}
              {...form.register('displayName')}
            />
            <FieldError errors={[errors.displayName]} />
          </Field>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="new-email">Email (optional)</FieldLabel>
            <Input
              id="new-email"
              type="email"
              aria-invalid={!!errors.email}
              {...form.register('email')}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <DialogActions pending={create.isPending} label="Create user" onCancel={close} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}

export function EditUserDialog({
  user,
  onOpenChange,
}: {
  user: User | null;
  onOpenChange: (open: boolean) => void;
}) {
  return user ? (
    <EditUserForm key={user.id} user={user} onClose={() => onOpenChange(false)} />
  ) : null;
}

function EditUserForm({ user, onClose }: { user: User; onClose: () => void }) {
  const { user: me } = useCurrentUser();
  const self = me.id === user.id;
  const update = useUpdateUser();
  const form = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      note: user.note ?? '',
      role: user.role,
      status: user.status,
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((v) => {
    update.mutate(
      {
        id: user.id,
        body: {
          displayName: nullIfEmpty(v.displayName),
          email: nullIfEmpty(v.email),
          note: nullIfEmpty(v.note),
          // Your own role and status are not editable here (no self-demotion or lock-out).
          ...(self ? {} : { role: v.role, status: v.status }),
        },
      },
      {
        onSuccess: () => {
          toast.success(`User ${user.username} updated`);
          onClose();
        },
        onError: (error) =>
          handleFormError(error, form, {
            fields: ['displayName', 'email', 'note', 'role', 'status'],
          }),
      },
    );
  });

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${user.username}`}
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-5">
          <FormAlert form={form} />
          <Field data-invalid={!!errors.displayName}>
            <FieldLabel htmlFor="edit-display">Display name</FieldLabel>
            <Input
              id="edit-display"
              aria-invalid={!!errors.displayName}
              {...form.register('displayName')}
            />
            <FieldError errors={[errors.displayName]} />
          </Field>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="edit-email">Email</FieldLabel>
            <Input
              id="edit-email"
              type="email"
              aria-invalid={!!errors.email}
              {...form.register('email')}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={!!errors.note}>
            <FieldLabel htmlFor="edit-note">Note</FieldLabel>
            <Textarea
              id="edit-note"
              rows={3}
              aria-invalid={!!errors.note}
              {...form.register('note')}
            />
            <FieldError errors={[errors.note]} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={!!errors.role} data-disabled={self}>
              <FieldLabel htmlFor="edit-role">Role</FieldLabel>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={self}>
                    <SelectTrigger id="edit-role" className="w-full" aria-invalid={!!errors.role}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER">User</SelectItem>
                      <SelectItem value="ADMIN">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.role]} />
            </Field>
            <Field data-invalid={!!errors.status} data-disabled={self}>
              <FieldLabel htmlFor="edit-status">Status</FieldLabel>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={self}>
                    <SelectTrigger
                      id="edit-status"
                      className="w-full"
                      aria-invalid={!!errors.status}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="DISABLED">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.status]} />
            </Field>
          </div>
          {self ? (
            <FieldDescription>You cannot change your own role or status.</FieldDescription>
          ) : null}
          <DialogActions pending={update.isPending} label="Save" onCancel={onClose} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}

export function ResetPasswordDialog({
  user,
  onOpenChange,
}: {
  user: User | null;
  onOpenChange: (open: boolean) => void;
}) {
  return user ? (
    <ResetPasswordForm key={user.id} user={user} onClose={() => onOpenChange(false)} />
  ) : null;
}

function ResetPasswordForm({ user, onClose }: { user: User; onClose: () => void }) {
  const reset = useResetPassword();
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors } = form.formState;

  const close = () => {
    form.reset();
    onClose();
  };

  const onSubmit = form.handleSubmit((v) => {
    reset.mutate(
      { id: user.id, password: v.password },
      {
        onSettled: () => reset.reset(),
        onSuccess: () => {
          toast.success(`Password of ${user.username} changed`);
          close();
        },
        onError: (error) => {
          form.reset();
          handleFormError(error, form, { fields: ['password'] });
        },
      },
    );
  });

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && close()}
      title={`Reset the password of ${user.username}`}
      description="The user signs in with the new password from now on."
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-5">
          <FormAlert form={form} />
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="reset-password">New password</FieldLabel>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...form.register('password')}
            />
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.confirm}>
            <FieldLabel htmlFor="reset-confirm">Repeat the password</FieldLabel>
            <Input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              {...form.register('confirm')}
            />
            <FieldError errors={[errors.confirm]} />
          </Field>
          <DialogActions pending={reset.isPending} label="Change password" onCancel={close} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
