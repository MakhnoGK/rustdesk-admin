import type { ColumnDef } from '@tanstack/react-table';
import { KeyRoundIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Token } from '@/api/types';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { DateTimeText } from '@/components/date-time-text';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUrlState } from '@/hooks/use-url-state';
import { tokenKindLabel } from '@/lib/format';
import { useRevokeToken, useUserTokens } from '../api';
import { tokenSearchSchema } from '../schemas';

const PAGE_SIZE = 20;

function TokenStatus({ token }: { token: Token }) {
  if (token.active) {
    return (
      <Badge
        variant="outline"
        className="border-status-active/30 bg-status-active/12 text-status-active"
      >
        Active
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-muted-foreground"
      title={token.revokedReason ?? undefined}
    >
      {token.revokedAt ? 'Revoked' : 'Expired'}
    </Badge>
  );
}

function ClientDevice({ token }: { token: Token }) {
  if (token.kind === 'ADMIN_WEB') {
    return (
      <span className="block max-w-56 truncate text-muted-foreground">
        {token.userAgent ?? 'Browser'}
      </span>
    );
  }
  if (!token.clientId && !token.clientUuid)
    return <span className="text-muted-foreground">Unknown</span>;
  return (
    <span className="flex flex-col">
      <span className="font-mono tabular-nums">{token.clientId ?? '—'}</span>
      {token.clientUuid ? (
        <span className="max-w-48 truncate font-mono text-xs text-muted-foreground">
          {token.clientUuid}
        </span>
      ) : null}
    </span>
  );
}

export function TokensTable({ userId, username }: { userId: string; username: string }) {
  const { state, update } = useUrlState(tokenSearchSchema);
  const tokens = useUserTokens(userId, { page: state.page, pageSize: PAGE_SIZE });
  const revoke = useRevokeToken(userId);
  const [revoking, setRevoking] = useState<Token | null>(null);

  const columns = useMemo<ColumnDef<Token>[]>(
    () => [
      { id: 'kind', header: 'Kind', cell: ({ row }) => tokenKindLabel(row.original.kind) },
      {
        id: 'client',
        header: 'Client device',
        cell: ({ row }) => <ClientDevice token={row.original} />,
      },
      {
        id: 'ip',
        header: 'IP',
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.ip ?? '—'}</span>,
      },
      {
        id: 'issuedAt',
        header: 'Issued',
        meta: { className: 'hidden md:table-cell' },
        cell: ({ row }) => <DateTimeText value={row.original.issuedAt} />,
      },
      {
        id: 'lastUsedAt',
        header: 'Last used',
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row }) => <DateTimeText value={row.original.lastUsedAt} fallback="Never" />,
      },
      {
        id: 'expiresAt',
        header: 'Expires',
        meta: { className: 'hidden lg:table-cell' },
        cell: ({ row }) => <DateTimeText value={row.original.expiresAt} />,
      },
      { id: 'status', header: 'Status', cell: ({ row }) => <TokenStatus token={row.original} /> },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) =>
          row.original.active ? (
            <Button variant="outline" size="sm" onClick={() => setRevoking(row.original)}>
              Revoke
            </Button>
          ) : null,
      },
    ],
    [],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tokens</CardTitle>
        <CardDescription>
          Sign-ins of {username}: RustDesk clients and admin panel sessions. Revoking signs that
          client out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          caption={`Tokens of ${username}`}
          columns={columns}
          data={tokens.data?.data}
          getRowId={(t) => t.id}
          isLoading={tokens.isPending}
          error={tokens.data ? undefined : tokens.error}
          onRetry={() => void tokens.refetch()}
          skeletonRows={4}
          pagination={
            tokens.data
              ? {
                  page: state.page,
                  pageSize: PAGE_SIZE,
                  total: tokens.data.total,
                  onPageChange: (page) => update({ page }),
                }
              : undefined
          }
          empty={
            <EmptyState
              icon={KeyRoundIcon}
              title="No tokens"
              description="This user has never signed in."
            />
          }
        />
      </CardContent>
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revoke this token?"
        description={
          revoking?.kind === 'ADMIN_WEB' ? (
            <p>
              This admin panel session is signed out. If it is your current session, you are signed
              out too.
            </p>
          ) : (
            <p>
              The RustDesk client{revoking?.clientId ? ` ${revoking.clientId}` : ''} is signed out
              and must log in again.
            </p>
          )
        }
        confirmLabel="Revoke"
        destructive
        pending={revoke.isPending}
        onConfirm={() =>
          revoking &&
          revoke.mutate(revoking.id, {
            onSuccess: () => {
              toast.success('Token revoked');
              setRevoking(null);
            },
            onError: () => setRevoking(null),
          })
        }
      />
    </Card>
  );
}
