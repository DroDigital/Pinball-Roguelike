import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const nodeSafe = ['src/core/**', 'src/sim/**', 'src/rules/**', 'src/content/**', 'src/bot/**'];

export default tseslint.config(
  {
    // The service worker runs in its own global scope.
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        location: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'screenshots',
      'tools/out',
      'tools/scratch',
      'test-results',
      'playwright-report',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    files: nodeSafe,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'Node-safe code must not import Three.js' },
            {
              group: ['**/present/**', '**/app/**'],
              message: 'Node-safe code must not import present/ or app/',
            },
            {
              group: ['tweakpane', '@tweakpane/*'],
              message: 'Node-safe code must not import UI libs',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'performance',
        'localStorage',
        'navigator',
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use Rng from core/rng.ts' },
        { object: 'Date', property: 'now', message: 'Sim/rules must be deterministic' },
      ],
    },
  },
);
