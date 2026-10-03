import { CircleAlertIcon } from 'lucide-react';
import { errorMessage } from '@/api/errors';
import type { Session } from '@/api/types';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatDuration } from '@/lib/time';
import { useRequestDisconnect } from '../api';

/** Confirms a remote disconnect and explains that it is asynchronous. */
export function DisconnectDialog({
  session,
  ttlSeconds,
  onOpenChange,
  onRequested,
}: {
  session: Session | null;
  ttlSeconds: number | undefined;
  onOpenChange: (open: boolean) => void;
  onRequested: (session: Session) => void;
}) {
  const request = useRequestDisconnect();

  const confirm = () => {
    if (!session) return;
    request.mutate(session.id, {
      onSuccess: () => {
        onRequested(session);
        onOpenChange(false);
      },
    });
  };

  return (
    <ConfirmDialog
      open={!!session}
      onOpenChange={(open) => {
        if (!open) request.reset();
        onOpenChange(open);
      }}
      title="Disconnect this session?"
      confirmLabel="Request disconnect"
      destructive
      pending={request.isPending}
      onConfirm={confirm}
      description={
        <>
          <p>
            The request is queued for device{' '}
            <strong className="font-mono">{session?.deviceId}</strong> and delivered with its next
            heartbeat (every few seconds while it has connections). The session closes when the
            device reports the close.
          </p>
          <p>
            If the device sends no heartbeat
            {ttlSeconds !== undefined ? ` within ${formatDuration(ttlSeconds)}` : ' in time'}, the
            request expires and nothing happens.
          </p>
        </>
      }
    >
      {request.error ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden />
          <AlertDescription>{errorMessage(request.error)}</AlertDescription>
        </Alert>
      ) : null}
    </ConfirmDialog>
  );
}
