import { Spinner } from '@/components/ui/spinner';

/** Shown while the first route's loader (auth/me) runs. */
export function HydrateFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}
