import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { AuditEvent } from '@/api/types';
import { DateTimeText } from '@/components/date-time-text';
import { JsonView } from '@/components/json-view';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { AUDIT_KIND_LABELS } from '@/lib/format';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** One audit event with its raw payload as escaped, read-only JSON. */
export function AuditEventSheet({
  event,
  onClose,
}: {
  event: AuditEvent | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!event} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Audit event</SheetTitle>
          <SheetDescription className="font-mono text-xs">{event?.id}</SheetDescription>
        </SheetHeader>
        {event ? (
          <div className="space-y-6 px-4 pb-6">
            <dl>
              <Row label="Kind">{AUDIT_KIND_LABELS[event.kind]}</Row>
              <Row label="Action">{event.action ?? '—'}</Row>
              <Row label="Received">
                <DateTimeText value={event.receivedAt} />
              </Row>
              <Row label="Device">
                <span className="font-mono">{event.deviceId ?? '—'}</span>
              </Row>
              <Row label="Conn ID">
                <span className="font-mono">{event.connId ?? '—'}</span>
              </Row>
              <Row label="RustDesk session">
                <span className="font-mono text-xs">{event.rustdeskSessionId ?? '—'}</span>
              </Row>
              <Row label="Source IP">
                <span className="font-mono text-xs">{event.sourceIp ?? '—'}</span>
              </Row>
              <Row label="Session">
                {event.sessionId ? (
                  <Link
                    to={`/sessions?session=${event.sessionId}`}
                    className="underline underline-offset-4"
                  >
                    Open session
                  </Link>
                ) : (
                  '—'
                )}
              </Row>
              {event.malformed ? (
                <Row label="Validity">
                  <Badge variant="destructive">Malformed record</Badge>
                </Row>
              ) : null}
            </dl>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Payload as received</h3>
              <JsonView value={event.payload} label="Raw payload" />
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
