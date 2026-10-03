// Display preferences only (theme, UTC toggle). Never credentials or server data.

export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage disabled: the preference lasts for this page load only.
  }
}

export const PREFERENCE_KEYS = {
  theme: 'rustdesk-admin-theme',
  utc: 'rustdesk-admin-utc',
} as const;
