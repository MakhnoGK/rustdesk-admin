import { RefreshCwIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { historyHref } from '@/features/sessions/schemas';
import { useDisplayZone } from '@/hooks/use-display-zone';
import { useUrlState } from '@/hooks/use-url-state';
import { formatDateTime } from '@/lib/time';
import { useStatsSummary, useStatsTimeseries, useStatsTop } from '../api';
import { KpiCards } from '../components/kpi-cards';
import { PeriodSelect } from '../components/period-select';
import { TimeseriesCharts } from '../components/timeseries-charts';
import { TopList } from '../components/top-list';
import { dashboardSearchSchema, PERIOD_LABELS, resolvePeriod } from '../schemas';

const TOP_LIMIT = 10;

export function DashboardPage() {
  const { zone } = useDisplayZone();
  const { state, update } = useUrlState(dashboardSearchSchema);
  // The "now" the period is anchored to; Refresh moves it forward.
  const [anchor, setAnchor] = useState(() => Date.now());
  const range = useMemo(() => resolvePeriod(state, zone, new Date(anchor)), [state, zone, anchor]);
  const { from, to, bucket } = range;

  const summary = useStatsSummary({ from, to });
  const series = useStatsTimeseries({ from, to, bucket });
  const topInitiators = useStatsTop({ from, to, by: 'initiator', limit: TOP_LIMIT });
  const topTargets = useStatsTop({ from, to, by: 'target', limit: TOP_LIMIT });

  // Every KPI and top-list row opens the session history with the same range and a matching filter.
  const links = {
    total: historyHref({ from, to }),
    duration: historyHref({ from, to, sort: 'durationSeconds:desc' }),
    timedOut: historyHref({ from, to, status: 'TIMEOUT' }),
    unauthenticated: historyHref({ from, to, authenticated: false }),
    active: historyHref({ from, to, status: 'ACTIVE' }),
  };

  const fetching =
    summary.isFetching || series.isFetching || topInitiators.isFetching || topTargets.isFetching;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <>
            {state.period === 'custom' ? 'Custom range' : PERIOD_LABELS[state.period]}:{' '}
            <span className="tabular-nums">
              {formatDateTime(from, zone)} – {formatDateTime(to, zone)}
            </span>
          </>
        }
        actions={
          <>
            <PeriodSelect state={state} onChange={(patch) => update(patch)} />
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh"
              onClick={() => setAnchor(Date.now())}
              disabled={fetching}
            >
              <RefreshCwIcon aria-hidden className={fetching ? 'animate-spin' : undefined} />
            </Button>
          </>
        }
      />
      <KpiCards
        summary={summary.data}
        error={summary.error}
        onRetry={() => void summary.refetch()}
        links={links}
      />
      <TimeseriesCharts
        points={series.data}
        bucket={bucket}
        isLoading={series.isPending}
        error={series.error}
        onRetry={() => void series.refetch()}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <TopList
          title="Top initiators"
          description="Who connected the most, by number of sessions"
          idLabel="Initiator"
          entries={topInitiators.data}
          error={topInitiators.error}
          onRetry={() => void topInitiators.refetch()}
          hrefFor={(e) => historyHref({ from, to, initiatorId: e.id })}
        />
        <TopList
          title="Top targets"
          description="Devices connected to the most, by number of sessions"
          idLabel="Target device"
          entries={topTargets.data}
          error={topTargets.error}
          onRetry={() => void topTargets.refetch()}
          hrefFor={(e) => historyHref({ from, to, deviceId: e.id })}
        />
      </div>
    </>
  );
}
