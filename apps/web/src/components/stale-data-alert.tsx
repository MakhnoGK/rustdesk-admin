import { TriangleAlertIcon } from 'lucide-react';
import { errorMessage } from '@/api/errors';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** A background refresh failed while older data is still on screen. */
export function StaleDataAlert({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden />
      <AlertDescription>
        Could not refresh: {errorMessage(error)} Showing the last data received.
      </AlertDescription>
    </Alert>
  );
}
