import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { RustdeskId } from '@/components/copy-button';
import { DateTimeText } from '@/components/date-time-text';
import { ErrorState } from '@/components/error-state';
import { JsonView } from '@/components/json-view';
import { PageHeader } from '@/components/page-header';
import { OnlineBadge } from '@/components/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDevice } from '../api';
import { DeviceRecentSessions } from '../components/device-recent-sessions';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2 text-sm sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function DevicePage() {
  const { uuid = '' } = useParams();
  const device = useDevice(uuid);

  if (device.error) {
    return <ErrorState error={device.error} what="device" onRetry={() => void device.refetch()} />;
  }
  if (!device.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const d = device.data;
  return (
    <>
      <PageHeader
        title={d.hostname ?? d.rustdeskId}
        description={<span className="font-mono">{d.rustdeskId}</span>}
        actions={<OnlineBadge online={d.online} />}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Device</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label="RustDesk ID">
                <RustdeskId id={d.rustdeskId} />
              </Row>
              <Row label="Machine UUID">
                <span className="font-mono text-xs">{d.uuid}</span>
              </Row>
              <Row label="Hostname">{d.hostname ?? '—'}</Row>
              <Row label="User">{d.username ?? '—'}</Row>
              <Row label="OS">{d.os ?? '—'}</Row>
              <Row label="Client version">{d.version ?? '—'}</Row>
              <Row label="Heartbeat version">{d.heartbeatVersion ?? '—'}</Row>
              <Row label="Last heartbeat">
                <DateTimeText value={d.lastHeartbeatAt} fallback="Never" />
              </Row>
              <Row label="Last IP">
                <span className="font-mono text-xs">{d.lastIp ?? '—'}</span>
              </Row>
              <Row label="System info updated">
                <DateTimeText value={d.sysinfoUpdatedAt} fallback="Never" />
              </Row>
              <Row label="First seen">
                <DateTimeText value={d.createdAt} />
              </Row>
            </dl>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System info</CardTitle>
              <CardDescription>
                As reported by the client; credential-like fields are redacted by the API.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {d.sysinfo ? (
                <JsonView value={d.sysinfo} label="System info" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  The device has not sent system info yet.
                </p>
              )}
            </CardContent>
          </Card>
          {d.idChanges.length ? (
            <Card>
              <CardHeader>
                <CardTitle>RustDesk ID changes</CardTitle>
                <CardDescription>Newest first.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {d.idChanges.map((c) => (
                    <li
                      key={`${c.changedAt}-${c.newRustdeskId}`}
                      className="flex flex-wrap gap-x-3 py-2"
                    >
                      <DateTimeText value={c.changedAt} />
                      <span className="font-mono">
                        {c.oldRustdeskId} → {c.newRustdeskId}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
      <DeviceRecentSessions rustdeskId={d.rustdeskId} />
    </>
  );
}
