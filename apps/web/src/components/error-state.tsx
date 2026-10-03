import { FileQuestionIcon, RefreshCwIcon, ShieldOffIcon, TriangleAlertIcon } from 'lucide-react';
import { Link } from 'react-router';
import { errorMessage, isApiError } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { EmptyState } from './empty-state';

export function NoAccessState() {
  return (
    <EmptyState
      icon={ShieldOffIcon}
      title="No access"
      description="Your account is not allowed to see this. Administrator rights are required."
    />
  );
}

export function NotFoundState({ what = 'page' }: { what?: string }) {
  return (
    <EmptyState
      icon={FileQuestionIcon}
      title={`This ${what} does not exist`}
      description="It may have been deleted, or the link is wrong."
      action={
        <Button asChild variant="outline">
          <Link to="/">Go to the dashboard</Link>
        </Button>
      }
    />
  );
}

/**
 * Inline state for a failed query: 403 → no access, 404 → not found, anything else → a safe
 * message with a retry button. Never shows raw response bodies or stack traces.
 */
export function ErrorState({
  error,
  onRetry,
  what,
}: {
  error: unknown;
  onRetry?: () => void;
  what?: string;
}) {
  if (isApiError(error) && error.status === 403) return <NoAccessState />;
  if (isApiError(error) && error.status === 404) return <NotFoundState what={what} />;
  return (
    <EmptyState
      icon={TriangleAlertIcon}
      title="Could not load data"
      description={errorMessage(error)}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCwIcon aria-hidden />
            Retry
          </Button>
        ) : undefined
      }
    />
  );
}
