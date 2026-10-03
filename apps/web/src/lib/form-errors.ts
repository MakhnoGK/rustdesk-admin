import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { errorMessage, fieldErrorsOf, hasStatus, isApiError } from '@/api/errors';

/**
 * Routes a mutation error to exactly one place:
 * - 422 details and 409 conflicts → field errors (when the field is on the form);
 * - 429, 5xx and network failures → a toast;
 * - anything else (400, 403, an unmapped 409/422) → the form-level alert (`root.server`).
 * 401 is handled globally (back to the login page).
 */
export function handleFormError<T extends FieldValues>(
  error: unknown,
  form: UseFormReturn<T>,
  options: { fields: readonly Path<T>[]; conflictField?: Path<T> },
): void {
  if (hasStatus(error, 401)) return;
  if (isApiError(error) && (error.status === 422 || error.status === 409)) {
    let mapped = false;
    for (const [name, message] of Object.entries(fieldErrorsOf(error))) {
      const field = options.fields.find((f) => f === name);
      if (field) {
        form.setError(field, { type: 'server', message });
        mapped = true;
      }
    }
    if (!mapped && error.status === 409 && options.conflictField) {
      form.setError(options.conflictField, { type: 'server', message: error.message });
      mapped = true;
    }
    if (mapped) return;
  }
  if (isApiError(error) && (error.status === 429 || error.isRetryable)) {
    toast.error(errorMessage(error));
    return;
  }
  form.setError('root.server', { type: 'server', message: errorMessage(error) });
}
