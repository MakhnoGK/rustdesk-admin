import { CheckCircle2Icon, CircleSlashIcon, SendIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { DISCONNECT_PHASE_TEXT, type DisconnectPhase } from '@/lib/format';
import { cn } from '@/lib/utils';

const STYLES: Record<DisconnectPhase, string> = {
  requested: 'border-status-timeout/30 bg-status-timeout/12 text-status-timeout',
  delivered: 'border-status-unknown/30 bg-status-unknown/12 text-status-unknown',
  closed: 'border-status-active/30 bg-status-active/12 text-status-active',
  expired: 'border-destructive/30 bg-destructive/10 text-destructive',
};

/**
 * Where a remote disconnect stands. It is asynchronous: requested → delivered (with the device's next
 * heartbeat) → closed (the device reported the close), or expired if the device never picked it up.
 */
export function DisconnectState({
  phase,
  showDescription = false,
}: {
  phase: DisconnectPhase;
  showDescription?: boolean;
}) {
  const text = DISCONNECT_PHASE_TEXT[phase];
  const icon =
    phase === 'requested' ? (
      <SendIcon aria-hidden />
    ) : phase === 'delivered' ? (
      <Spinner aria-hidden role={undefined} aria-label={undefined} />
    ) : phase === 'closed' ? (
      <CheckCircle2Icon aria-hidden />
    ) : (
      <CircleSlashIcon aria-hidden />
    );
  return (
    <span className="inline-flex flex-col gap-1" role="status">
      <Badge variant="outline" className={cn(STYLES[phase])} title={text.description}>
        {icon}
        {text.label}
      </Badge>
      {showDescription ? (
        <span className="text-xs text-muted-foreground">{text.description}</span>
      ) : (
        <span className="sr-only">{text.description}</span>
      )}
    </span>
  );
}
