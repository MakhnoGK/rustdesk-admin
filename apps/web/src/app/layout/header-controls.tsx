import { useQueryClient } from '@tanstack/react-query';
import { LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UserIcon } from 'lucide-react';
import { useId } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLogout } from '@/features/auth/api';
import { useCurrentUser } from '@/features/auth/use-current-user';
import { useDisplayZone } from '@/hooks/use-display-zone';
import { useTheme, type Theme } from '@/hooks/use-theme';

export function UtcToggle() {
  const { utc, setUtc } = useDisplayZone();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={utc} onCheckedChange={setUtc} />
      <Label htmlFor={id} className="text-xs whitespace-nowrap">
        <span className="hidden sm:inline">Show times in </span>UTC
      </Label>
    </div>
  );
}

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Theme">
          {resolvedTheme === 'dark' ? <MoonIcon aria-hidden /> : <SunIcon aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light">
            <SunIcon aria-hidden /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon aria-hidden /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon aria-hidden /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu() {
  const { user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signOut = () => {
    logout.mutate(undefined, {
      // Whatever the API answered, nothing of this session stays in memory.
      onSettled: () => {
        void Promise.resolve(navigate('/login', { replace: true })).then(() => queryClient.clear());
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="max-w-40">
          <UserIcon aria-hidden />
          <span className="truncate">{user.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate font-medium">{user.displayName ?? user.username}</div>
          <div className="truncate text-xs text-muted-foreground">{user.username}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} disabled={logout.isPending}>
          <LogOutIcon aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
