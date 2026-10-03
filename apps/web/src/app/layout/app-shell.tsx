import { Outlet, useNavigation } from 'react-router';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AuthProvider } from '@/features/auth/auth-provider';
import { AppSidebar } from './app-sidebar';
import { Breadcrumbs } from './breadcrumbs';
import { ThemeToggle, UserMenu, UtcToggle } from './header-controls';

function NavigationProgress() {
  const navigation = useNavigation();
  if (navigation.state === 'idle') return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary"
    />
  );
}

export function AppShell() {
  return (
    <AuthProvider>
      <SidebarProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-4">
            <NavigationProgress />
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
            <Breadcrumbs />
            <div className="ml-auto flex items-center gap-1 sm:gap-3">
              <UtcToggle />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main id="main" className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AuthProvider>
  );
}
