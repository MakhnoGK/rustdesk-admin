import { z } from 'zod';

declare global {
  interface Window {
    /** Written by public/config.js (Docker: the entrypoint). Public, never secret. */
    __APP_CONFIG__?: Record<string, unknown>;
  }
}

const configSchema = z.object({
  apiBaseUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/[^/]+(\/.*)?$/.test(v), {
      message: 'must be empty (same origin) or an http(s) URL',
    })
    .transform((v) => v.replace(/\/+$/, '')),
  activeSessionsRefreshMs: z.coerce
    .number()
    .int()
    .min(1000, 'must be at least 1000 ms')
    .max(300_000, 'must be at most 300000 ms'),
  appName: z.string().trim().min(1, 'must not be empty').max(100),
});

export type AppConfig = z.infer<typeof configSchema>;

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; issues: string[] };

const nonEmpty = (v: unknown): unknown => (v === '' || v === null ? undefined : v);

/** Build-time values (VITE_*) overridden by runtime values from /config.js, validated together. */
export function loadConfig(
  env: Record<string, string | undefined>,
  runtime: Record<string, unknown> | undefined,
): ConfigResult {
  const merged = {
    apiBaseUrl: env.VITE_API_BASE_URL ?? '',
    activeSessionsRefreshMs:
      nonEmpty(runtime?.ACTIVE_SESSIONS_REFRESH_MS) ??
      nonEmpty(env.VITE_ACTIVE_SESSIONS_REFRESH_MS) ??
      5000,
    appName: nonEmpty(runtime?.APP_NAME) ?? nonEmpty(env.VITE_APP_NAME) ?? 'RustDesk Admin',
  };
  const parsed = configSchema.safeParse(merged);
  if (parsed.success) return { ok: true, config: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`),
  };
}

export const configResult = loadConfig(
  import.meta.env,
  typeof window === 'undefined' ? undefined : window.__APP_CONFIG__,
);

const fallback: AppConfig = {
  apiBaseUrl: '',
  activeSessionsRefreshMs: 5000,
  appName: 'RustDesk Admin',
};

/** The validated configuration. main.tsx renders a configuration-error screen when it is invalid. */
export const config: AppConfig = configResult.ok ? configResult.config : fallback;
