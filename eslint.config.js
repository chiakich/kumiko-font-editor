import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

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
    // Code ported verbatim from fontra keeps its original dynamic typing;
    // see src/font/fontra-ported/README.md and docs/fontra-parity.md
    files: ['src/font/fontra-ported/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'prefer-const': 'off',
    },
  },
])
