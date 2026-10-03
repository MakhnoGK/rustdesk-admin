import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { isRouteErrorResponse, useRevalidator, useRouteError } from 'react-router';
import { errorMessage, isApiError } from '@/api/errors';
import { EmptyState } from '@/components/empty-state';
import { NoAccessState, NotFoundState } from '@/components/error-state';
import { Button } from '@/components/ui/button';

/** `errorElement` of every route: loader failures, render errors and failed lazy chunks. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const revalidator = useRevalidator();

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundState />;
  if (isApiError(error) && error.status === 403) return <NoAccessState />;
  if (isApiError(error) && error.status === 404) return <NotFoundState />;

  // API failures can be retried in place; anything else (a stale chunk after a deploy, a render
  // error) needs a fresh page load.
  const retry = () =>
    isApiError(error) ? void revalidator.revalidate() : window.location.reload();

  return (
    <div className="p-4 sm:p-6">
      <EmptyState
        icon={TriangleAlertIcon}
        title="Something went wrong"
        description={
          isApiError(error) ? errorMessage(error) : 'This page could not be displayed. Try again.'
        }
        action={
          <Button variant="outline" onClick={retry}>
            <RefreshCwIcon aria-hidden />
            Retry
          </Button>
        }
      />
    </div>
  );
}
