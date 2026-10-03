// Shared flat config for Node/TypeScript packages (type-aware).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 */
export function nodeConfig({ tsconfigRootDir, ignores = [] }) {
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**', 'node_modules/**', ...ignores] },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    prettier,
    {
      languageOptions: {
        globals: { ...globals.node, ...globals.jest },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-extraneous-class': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
    {
      // expect.any()/expect.objectContaining() are typed `any` by Jest.
      files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
      },
    },
    {
      files: ['**/*.js', '**/*.mjs'],
      ...tseslint.configs.disableTypeChecked,
    },
  );
}
