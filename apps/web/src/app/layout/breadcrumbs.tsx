import { Fragment } from 'react';
import { Link, useMatches, type UIMatch } from 'react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export interface RouteHandle {
  /** Breadcrumb label; a function receives the route params. */
  crumb?: string | ((params: Record<string, string | undefined>) => string);
}

function crumbOf(match: UIMatch): string | null {
  const handle = match.handle as RouteHandle | undefined;
  if (!handle?.crumb) return null;
  return typeof handle.crumb === 'function' ? handle.crumb(match.params) : handle.crumb;
}

export function Breadcrumbs() {
  const crumbs = useMatches()
    .map((match) => ({ match, label: crumbOf(match) }))
    .filter((c): c is { match: UIMatch; label: string } => c.label !== null);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map(({ match, label }, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={match.id}>
              {i > 0 ? <BreadcrumbSeparator className="hidden sm:block" /> : null}
              <BreadcrumbItem className={last ? 'min-w-0' : 'hidden sm:inline-flex'}>
                {last ? (
                  <BreadcrumbPage className="truncate">{label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={match.pathname}>{label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
