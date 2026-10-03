import { CircleAlertIcon } from 'lucide-react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** The form-level error set by `handleFormError` (400, 403, unmapped conflicts). */
export function FormAlert<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  const message = form.formState.errors.root?.server?.message;
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
