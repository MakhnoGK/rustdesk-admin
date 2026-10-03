import type { SessionStatus } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STYLES: Record<SessionStatus, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Active',
    className: 'border-status-active/30 bg-status-active/12 text-status-active',
  },
  CLOSED: {
    label: 'Closed',
    className: 'border-status-closed/30 bg-status-closed/12 text-status-closed',
  },
  TIMEOUT: {
    label: 'Timeout',
    className: 'border-status-timeout/30 bg-status-timeout/12 text-status-timeout',
  },
  UNKNOWN: {
    label: 'Unknown',
    className: 'border-status-unknown/30 bg-status-unknown/12 text-status-unknown',
  },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const style = STYLES[status];
  return (
    <Badge variant="outline" className={cn(style.className)}>
      {style.label}
    </Badge>
  );
}

export function OnlineBadge({ online }: { online: boolean }) {
  return online ? (
    <Badge
      variant="outline"
      className="border-status-active/30 bg-status-active/12 text-status-active"
    >
      Online
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Offline
    </Badge>
  );
}
