import type { LucideIcon } from 'lucide-react';
import {
  ActivityIcon,
  ClockIcon,
  HourglassIcon,
  ShieldQuestionIcon,
  SigmaIcon,
  TimerOffIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import type { StatsSummary } from '@/api/types';
import { ErrorState } from '@/components/error-state';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCount } from '@/lib/format';
import { formatDuration } from '@/lib/time';

export interface KpiLinks {
  total: string;
  duration: string;
  timedOut: string;
  unauthenticated: string;
  active: string;
}

function Kpi({
  label,
  value,
  icon: Icon,
  to,
  hint,
}: {
  label: string;
  value: string | undefined;
  icon: LucideIcon;
  to: string;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      aria-label={value === undefined ? label : `${label}: ${value}. Open in session history`}
    >
      <Card className="h-full transition-colors group-hover:bg-muted/40">
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <Icon aria-hidden className="size-4" />
            {label}
          </CardDescription>
          <CardTitle className="text-2xl tabular-nums">
            {value === undefined ? <Skeleton className="h-8 w-24" /> : value}
          </CardTitle>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </CardHeader>
      </Card>
    </Link>
  );
}

export function KpiCards({
  summary,
  error,
  onRetry,
  links,
}: {
  summary: StatsSummary | undefined;
  error: unknown;
  onRetry: () => void;
  links: KpiLinks;
}) {
  if (error && !summary) return <ErrorState error={error} onRetry={onRetry} />;
  const s = summary;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <Kpi
        label="Sessions"
        icon={SigmaIcon}
        to={links.total}
        value={s && formatCount(s.totalSessions)}
      />
      <Kpi
        label="Total duration"
        icon={ClockIcon}
        to={links.duration}
        value={s && formatDuration(s.totalDurationSeconds)}
        hint="Known durations only"
      />
      <Kpi
        label="Average duration"
        icon={HourglassIcon}
        to={links.duration}
        value={s && formatDuration(s.avgDurationSeconds)}
      />
      <Kpi
        label="Timed out"
        icon={TimerOffIcon}
        to={links.timedOut}
        value={s && formatCount(s.timedOutSessions)}
      />
      <Kpi
        label="Not authenticated"
        icon={ShieldQuestionIcon}
        to={links.unauthenticated}
        value={s && formatCount(s.unauthenticatedSessions)}
      />
      <Kpi
        label="Still active"
        icon={ActivityIcon}
        to={links.active}
        value={s && formatCount(s.activeSessions)}
        hint="Started in this period"
      />
    </div>
  );
}
