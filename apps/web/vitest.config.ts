import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // Deterministic time zone with DST; tests that need another zone pass it explicitly.
      env: { TZ: 'Europe/Berlin' },
      restoreMocks: true,
      // The first test of a file transforms the lazily loaded route modules: slow on a busy machine.
      testTimeout: 20_000,
    },
  }),
);
