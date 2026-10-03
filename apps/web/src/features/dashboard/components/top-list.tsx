import { Link } from 'react-router';
import type { TopEntry } from '@/api/types';
import { ErrorState } from '@/components/error-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCount } from '@/lib/format';
import { formatDuration } from '@/lib/time';

export function TopList({
  title,
  description,
  entries,
  error,
  onRetry,
  hrefFor,
  idLabel,
}: {
  title: string;
  description: string;
  entries: TopEntry[] | undefined;
  error: unknown;
  onRetry: () => void;
  hrefFor: (entry: TopEntry) => string;
  idLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {error && !entries ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : !entries ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !entries.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No sessions in this period.
          </p>
        ) : (
          <Table>
            <TableCaption className="sr-only">{title}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{idLabel}</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link
                      to={hrefFor(e)}
                      className="flex flex-col underline-offset-4 hover:underline"
                    >
                      <span className="font-mono tabular-nums">{e.id}</span>
                      {e.name ? (
                        <span className="max-w-56 truncate text-xs text-muted-foreground">
                          {e.name}
                        </span>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(e.sessions)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatDuration(e.durationSeconds)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
