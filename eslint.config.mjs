import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.expo/**',
      '**/.next/**',
      '**/coverage/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      '_private/**',
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['tooling/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  {
    // Metro bundles static assets through require(); only asset files may be required this way.
    files: ['apps/mobile/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': ['error', { allow: ['\\.(ttf|otf|png|jpg|webp|wav|mp3)$'] }],
    },
  },
  {
    // Expo config plugins and the Metro config are CommonJS modules loaded by the Expo CLI.
    files: ['**/plugin/*.js', '**/plugins/*.js', '**/*.cjs', 'apps/mobile/metro.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
