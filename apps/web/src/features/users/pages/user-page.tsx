import { useNavigate, useParams } from 'react-router';
import type { ReactNode } from 'react';
import { DateTimeText } from '@/components/date-time-text';
import { ErrorState } from '@/components/error-state';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '../api';
import { TokensTable } from '../components/tokens-table';
import { UserActions } from '../components/user-actions';
import { RoleBadge, UserStatusBadge } from '../components/user-badges';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2 text-sm sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function UserPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useUser(id);

  if (user.error)
    return <ErrorState error={user.error} what="user" onRetry={() => void user.refetch()} />;
  if (!user.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  const u = user.data;
  return (
    <>
      <PageHeader
        title={u.username}
        description={u.displayName ?? undefined}
        actions={
          <UserActions user={u} onDeleted={() => void navigate('/users', { replace: true })} />
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <Row label="Role">
              <RoleBadge role={u.role} />
            </Row>
            <Row label="Status">
              <UserStatusBadge status={u.status} />
            </Row>
            <Row label="Email">{u.email ?? '—'}</Row>
            <Row label="Note">
              <span className="whitespace-pre-wrap">{u.note ?? '—'}</span>
            </Row>
            <Row label="Created">
              <DateTimeText value={u.createdAt} />
            </Row>
            <Row label="Updated">
              <DateTimeText value={u.updatedAt} />
            </Row>
          </dl>
        </CardContent>
      </Card>
      <TokensTable userId={u.id} username={u.username} />
    </>
  );
}
