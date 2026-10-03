import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/error-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { config } from '@/lib/config';
import { formatDuration } from '@/lib/time';
import { useSystemInfo } from '../api';

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium">{label}</dt>
      <dd className="text-sm">
        <span className="tabular-nums">{value}</span>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </dd>
    </div>
  );
}

export function AboutPage() {
  const info = useSystemInfo();
  return (
    <>
      <PageHeader
        title="About"
        description="Versions and the server settings that shape what you see."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>API server</CardTitle>
            <CardDescription>Reported by GET /api/admin/system/info.</CardDescription>
          </CardHeader>
          <CardContent>
            {info.error ? (
              <ErrorState error={info.error} onRetry={() => void info.refetch()} />
            ) : !info.data ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              <dl className="divide-y">
                <Row label="Version" value={info.data.version} />
                <Row
                  label="Session timeout"
                  value={formatDuration(info.data.sessionTimeoutMinutes * 60)}
                  hint="An active session with no liveness evidence for this long becomes Timeout."
                />
                <Row
                  label="Heartbeat grace"
                  value={formatDuration(info.data.heartbeatGraceSeconds)}
                  hint="Active sessions not seen for longer are flagged “no heartbeat”."
                />
                <Row
                  label="Device online threshold"
                  value={formatDuration(info.data.deviceOnlineThresholdSeconds)}
                  hint="A device is online when its last heartbeat is newer than this."
                />
                <Row
                  label="Disconnect request lifetime"
                  value={formatDuration(info.data.disconnectTtlSeconds)}
                  hint="A remote disconnect not picked up by the device within this time expires."
                />
              </dl>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Admin panel</CardTitle>
            <CardDescription>This web application.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label="Name" value={config.appName} />
              <Row label="Version" value={__APP_VERSION__} />
              <Row
                label="Active sessions refresh"
                value={formatDuration(Math.round(config.activeSessionsRefreshMs / 1000))}
              />
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
