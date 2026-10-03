import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { TimeseriesPoint } from '@/api/types';
import { ErrorState } from '@/components/error-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useDisplayZone } from '@/hooks/use-display-zone';
import { formatCount } from '@/lib/format';
import { formatBucket, formatDuration } from '@/lib/time';
import { durationTickFormatter } from '../chart-format';
import type { Bucket } from '../schemas';

const sessionsConfig = {
  sessions: { label: 'Sessions', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const durationConfig = {
  durationSeconds: { label: 'Connected time', color: 'var(--chart-2)' },
} satisfies ChartConfig;

interface Row {
  label: string;
  sessions: number;
  durationSeconds: number;
}

/**
 * Session count and connected time per bucket, as two single-series charts sharing the x axis
 * (two measures of different scale never share one y axis). A table view is available below.
 */
export function TimeseriesCharts({
  points,
  bucket,
  isLoading,
  error,
  onRetry,
}: {
  points: TimeseriesPoint[] | undefined;
  bucket: Bucket;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const { zone } = useDisplayZone();
  // Day buckets are UTC days in the API, so they are labelled in UTC to avoid an off-by-one.
  const labelZone = bucket === 'day' ? 'UTC' : zone;
  const rows: Row[] = (points ?? []).map((p) => ({
    label: formatBucket(p.bucketStart, bucket, labelZone),
    sessions: p.sessions,
    durationSeconds: p.durationSeconds,
  }));
  const bucketText = bucket === 'hour' ? 'Per hour' : 'Per day (UTC)';
  const durationTick = durationTickFormatter(Math.max(0, ...rows.map((r) => r.durationSeconds)));

  const body = (chart: ReactNode) => {
    if (error && !points) return <ErrorState error={error} onRetry={onRetry} />;
    if (isLoading && !points) return <Skeleton className="aspect-[3/1] w-full" />;
    if (!rows.length) {
      return (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No sessions in this period.
        </p>
      );
    }
    return chart;
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>{bucketText}, by start time</CardDescription>
        </CardHeader>
        <CardContent>
          {body(
            <ChartContainer config={sessionsConfig} className="aspect-[3/1] min-h-48 w-full">
              <BarChart data={rows} margin={{ left: 0, right: 8 }} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(v: number) => formatCount(v)}
                />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar
                  dataKey="sessions"
                  fill="var(--color-sessions)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ChartContainer>,
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connected time</CardTitle>
          <CardDescription>{bucketText}: sum of known durations, by start time</CardDescription>
        </CardHeader>
        <CardContent>
          {body(
            <ChartContainer config={durationConfig} className="aspect-[3/1] min-h-48 w-full">
              <BarChart data={rows} margin={{ left: 0, right: 8 }} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={durationTick} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span className="flex w-full justify-between gap-4">
                          <span className="text-muted-foreground">Connected time</span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatDuration(Number(value))}
                          </span>
                        </span>
                      )}
                    />
                  }
                />
                <Bar
                  dataKey="durationSeconds"
                  fill="var(--color-durationSeconds)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ChartContainer>,
          )}
        </CardContent>
      </Card>
      {rows.length ? (
        <details className="xl:col-span-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Show the chart data as a table
          </summary>
          <div className="mt-2 max-h-72 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">Sessions and connected time per bucket</caption>
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-medium">Bucket</th>
                  <th className="px-3 py-2 text-right font-medium">Sessions</th>
                  <th className="px-3 py-2 text-right font-medium">Connected time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b last:border-0">
                    <td className="px-3 py-1.5">{r.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatCount(r.sessions)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatDuration(r.durationSeconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
