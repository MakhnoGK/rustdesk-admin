import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
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
import { parseSort } from '@/lib/url-state';
import { cn } from '@/lib/utils';
import { ErrorState } from './error-state';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Classes for header and cells, e.g. `hidden md:table-cell` for secondary columns. */
    className?: string;
    /** Server-side sort field; makes the header a sort toggle. */
    sortField?: string;
  }
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<T> {
  /** Accessible name of the table. */
  caption: string;
  columns: ColumnDef<T>[];
  data: T[] | undefined;
  getRowId: (row: T) => string;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Rendered instead of the table when there are no rows. */
  empty: ReactNode;
  pagination?: PaginationState;
  sort?: string;
  onSortChange?: (sort: string) => void;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  skeletonRows?: number;
}

/**
 * The shadcn Data Table pattern on TanStack Table, fully server-driven: pagination, sorting and
 * filtering happen in the API; the table only renders one page.
 */
export function DataTable<T>({
  caption,
  columns,
  data,
  getRowId,
  isLoading,
  error,
  onRetry,
  empty,
  pagination,
  sort,
  onSortChange,
  onRowClick,
  rowClassName,
  skeletonRows = 8,
}: DataTableProps<T>) {
  const table = useReactTable({
    data: data ?? [],
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  // Past the last page (e.g. after deletions) the table stays, so the pager can go back.
  const pastLastPage = (pagination?.page ?? 1) > 1;
  if (!isLoading && data && data.length === 0 && !pastLastPage) return <>{empty}</>;

  const current = parseSort(sort);

  const toggleSort = (field: string) => {
    if (!onSortChange) return;
    const direction = current?.field === field && current.direction === 'desc' ? 'asc' : 'desc';
    onSortChange(`${field}:${direction}`);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <Table aria-busy={isLoading}>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const sortField = meta?.sortField;
                  const sorted =
                    sortField && current?.field === sortField ? current.direction : null;
                  const label = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <TableHead
                      key={header.id}
                      className={cn('whitespace-nowrap', meta?.className)}
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : undefined
                      }
                    >
                      {sortField && onSortChange ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-2.5"
                          onClick={() => toggleSort(sortField)}
                        >
                          {label}
                          {sorted === 'asc' ? (
                            <ArrowUpIcon aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDownIcon aria-hidden />
                          ) : (
                            <ArrowUpDownIcon aria-hidden className="opacity-50" />
                          )}
                        </Button>
                      ) : (
                        label
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading && !data ? (
              Array.from({ length: skeletonRows }, (_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((column, j) => (
                    <TableCell key={j} className={column.meta?.className}>
                      <Skeleton className="h-5 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No rows on this page.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                  onClick={
                    onRowClick
                      ? (event) => {
                          // Buttons and links inside the row keep their own behavior.
                          if ((event.target as HTMLElement).closest('button, a, [role="menuitem"]'))
                            return;
                          onRowClick(row.original);
                        }
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {pagination ? <Pagination {...pagination} /> : null}
    </div>
  );
}

function Pagination({ page, pageSize, total, onPageChange }: PaginationState) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-2 text-sm"
    >
      <p className="text-muted-foreground" aria-live="polite">
        {formatCount(first)}–{formatCount(last)} of {formatCount(total)}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">
          Page {formatCount(page)} of {formatCount(pages)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
        >
          <ChevronRightIcon aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
