import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/use-theme';
import { PreferencesProvider } from './preferences-provider';

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  // sonner renders its list inside an aria-live region, so toasts are announced.
  return <Toaster theme={resolvedTheme} richColors closeButton position="top-right" />;
}

export function Providers({
  queryClient,
  children,
}: {
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <TooltipProvider delayDuration={200}>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
