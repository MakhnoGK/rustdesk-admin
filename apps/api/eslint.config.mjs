import { nodeConfig } from '@rustdesk-admin/eslint-config/node';

export default nodeConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: ['src/generated/**', 'eslint.config.mjs'],
});
