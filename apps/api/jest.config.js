// Two projects: fast unit tests next to the code, and integration tests against a real
// PostgreSQL started by Testcontainers (Docker required).
/** @type {import('jest').Config} */
const common = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  modulePathIgnorePatterns: ['<rootDir>/dist'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  // The generated Prisma client imports './x.js' for './x.ts'.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
};

module.exports = {
  projects: [
    {
      ...common,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
    },
    {
      ...common,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/setup/global-setup.ts',
      globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
      setupFiles: ['<rootDir>/test/setup/env.ts'],
      testTimeout: 60_000,
    },
  ],
};
