import { loadConfig } from './config';

describe('loadConfig', () => {
  it('uses defaults when nothing is set', () => {
    expect(loadConfig({}, undefined)).toEqual({
      ok: true,
      config: { apiBaseUrl: '', activeSessionsRefreshMs: 5000, appName: 'RustDesk Admin' },
    });
  });

  it('lets runtime values from /config.js override build-time ones', () => {
    const result = loadConfig(
      { VITE_APP_NAME: 'Build name', VITE_ACTIVE_SESSIONS_REFRESH_MS: '5000' },
      { APP_NAME: 'Runtime name', ACTIVE_SESSIONS_REFRESH_MS: '10000' },
    );
    expect(result).toEqual({
      ok: true,
      config: { apiBaseUrl: '', activeSessionsRefreshMs: 10_000, appName: 'Runtime name' },
    });
  });

  it('ignores empty runtime values', () => {
    const result = loadConfig({ VITE_APP_NAME: 'Build name' }, { APP_NAME: '' });
    expect(result.ok && result.config.appName).toBe('Build name');
  });

  it('strips a trailing slash from the API base URL', () => {
    const result = loadConfig({ VITE_API_BASE_URL: 'https://admin.example.com/' }, undefined);
    expect(result.ok && result.config.apiBaseUrl).toBe('https://admin.example.com');
  });

  it('reports invalid values instead of starting', () => {
    const result = loadConfig(
      { VITE_API_BASE_URL: 'ftp://x' },
      { ACTIVE_SESSIONS_REFRESH_MS: 'often' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(2);
      expect(result.issues.join(' ')).toMatch(/apiBaseUrl/);
    }
  });
});
