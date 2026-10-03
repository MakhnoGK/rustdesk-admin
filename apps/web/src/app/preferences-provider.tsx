import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DisplayZoneContext, type DisplayZoneState } from '@/hooks/use-display-zone';
import { ThemeContext, type Theme, type ThemeState } from '@/hooks/use-theme';
import { PREFERENCE_KEYS, readPreference, writePreference } from '@/lib/storage';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readTheme(): Theme {
  const stored = readPreference(PREFERENCE_KEYS.theme);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

/** Theme (light / dark / system) and the "Show times in UTC" toggle, both persisted locally. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const [utc, setUtcState] = useState(() => readPreference(PREFERENCE_KEYS.utc) === 'true');

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    writePreference(PREFERENCE_KEYS.theme, next);
    setThemeState(next);
  }, []);

  const setUtc = useCallback((next: boolean) => {
    writePreference(PREFERENCE_KEYS.utc, String(next));
    setUtcState(next);
  }, []);

  const themeValue = useMemo<ThemeState>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );
  const zoneValue = useMemo<DisplayZoneState>(
    () => ({ zone: utc ? 'UTC' : undefined, utc, setUtc }),
    [utc, setUtc],
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      <DisplayZoneContext.Provider value={zoneValue}>{children}</DisplayZoneContext.Provider>
    </ThemeContext.Provider>
  );
}
