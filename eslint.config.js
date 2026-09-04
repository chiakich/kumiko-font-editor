import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Hard layering rules with zero violations today. Rules that still have
// violations live in eslint.boundaries.config.js behind a warning budget.
const forbidImports = (files, patterns) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { patterns }] },
})

const featuresImport = {
  regex: '^@/features(/|$)',
  message: 'Shared layers must not depend on src/features.',
}

export default defineConfig([
  globalIgnores(['dist', '.claude', 'vendor']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Tests reach sibling helpers and functions/ through ../, so the
    // parent-relative ban is limited to src/.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^src/',
              message: 'Use the @/ alias instead of src/.',
            },
            {
              regex: '^\\.\\./',
              message: 'Use the @/ alias instead of parent-relative paths.',
            },
          ],
        },
      ],
    },
  },
  forbidImports(
    [
      'src/lib/**',
      'src/font/**',
      'src/store/**',
      'src/hooks/**',
      'src/design/**',
      'src/components/**',
    ],
    [featuresImport]
  ),
  forbidImports(
    ['src/sceneView/**'],
    [
      featuresImport,
      {
        regex: '^@/store(/|$)',
        message: 'sceneView must not read the store; pass data in.',
      },
      {
        regex: '^(react|react-dom|@chakra-ui/|@emotion/)',
        message: 'sceneView must stay free of React UI.',
      },
    ]
  ),
  {
    // Code ported verbatim from fontra keeps its original dynamic typing;
    // see src/font/fontra-ported/README.md and docs/fontra-parity.md
    files: ['src/font/fontra-ported/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'prefer-const': 'off',
    },
  },
])
