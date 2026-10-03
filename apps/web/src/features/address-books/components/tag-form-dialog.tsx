import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { Tag } from '@/api/types';
import { FormAlert } from '@/components/form-alert';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { TagChip } from '@/components/tag-chip';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { argbToHex, hexToArgb, TAG_COLOR_PRESETS } from '@/lib/color';
import { handleFormError } from '@/lib/form-errors';
import { cn } from '@/lib/utils';
import { useCreateTag, useUpdateTag } from '../api';
import { tagFormSchema, type TagFormValues } from '../schemas';
import { FormActions } from './form-actions';

/** Create a tag (`tag` null) or rename / recolor one. */
export function TagFormDialog({
  open,
  guid,
  tag,
  onClose,
}: {
  open: boolean;
  guid: string;
  tag: Tag | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return <TagForm key={tag?.name ?? 'new'} guid={guid} tag={tag} onClose={onClose} />;
}

function TagForm({ guid, tag, onClose }: { guid: string; tag: Tag | null; onClose: () => void }) {
  const create = useCreateTag(guid);
  const update = useUpdateTag(guid);
  const pending = create.isPending || update.isPending;
  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: {
      name: tag?.name ?? '',
      color: tag ? argbToHex(tag.color) : TAG_COLOR_PRESETS[5],
    },
  });
  const { errors } = form.formState;
  const name = useWatch({ control: form.control, name: 'name' });
  const color = useWatch({ control: form.control, name: 'color' });
  const onError = (error: unknown) =>
    handleFormError(error, form, { fields: ['name', 'color'], conflictField: 'name' });

  const onSubmit = form.handleSubmit((v) => {
    const argb = hexToArgb(v.color);
    if (tag) {
      const body = {
        ...(v.name !== tag.name ? { name: v.name } : {}),
        ...(argb !== tag.color ? { color: argb } : {}),
      };
      if (!Object.keys(body).length) {
        onClose();
        return;
      }
      update.mutate(
        { name: tag.name, body },
        {
          onSuccess: () => {
            toast.success(`Tag “${v.name}” updated`);
            onClose();
          },
          onError,
        },
      );
    } else {
      create.mutate(
        { name: v.name, color: argb },
        {
          onSuccess: () => {
            toast.success(`Tag “${v.name}” created`);
            onClose();
          },
          onError,
        },
      );
    }
  });

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={tag ? `Edit tag “${tag.name}”` : 'Create tag'}
      description={
        tag && tag.peerCount
          ? `Renaming updates the ${tag.peerCount} peer(s) carrying it.`
          : undefined
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup className="gap-5">
          <FormAlert form={form} />
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="tag-name">Name</FieldLabel>
            <Input id="tag-name" aria-invalid={!!errors.name} {...form.register('name')} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={!!errors.color}>
            <FieldLabel htmlFor="tag-color">Color</FieldLabel>
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="radiogroup"
                    aria-label="Preset colors"
                    className="flex flex-wrap gap-1.5"
                  >
                    {TAG_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        role="radio"
                        aria-checked={field.value.toLowerCase() === preset}
                        aria-label={preset}
                        onClick={() => field.onChange(preset)}
                        className={cn(
                          'size-7 rounded-full border-2 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                          field.value.toLowerCase() === preset
                            ? 'border-foreground'
                            : 'border-transparent',
                        )}
                        style={{ backgroundColor: preset }}
                      />
                    ))}
                  </div>
                  <input
                    id="tag-color"
                    type="color"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded-md border bg-transparent"
                    aria-label="Custom color"
                  />
                </div>
              )}
            />
            <FieldDescription className="flex items-center gap-2">
              Preview: <TagChip name={name || 'tag'} color={hexToArgbSafe(color)} />
            </FieldDescription>
            <FieldError errors={[errors.color]} />
          </Field>
          <FormActions pending={pending} label={tag ? 'Save' : 'Create tag'} onCancel={onClose} />
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}

function hexToArgbSafe(hex: string): number | undefined {
  try {
    return hexToArgb(hex);
  } catch {
    return undefined;
  }
}
