import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

// Layering rules that still have known violations. They run as warnings under
// a budget (`--max-warnings` in the lint:boundaries script) so the count can
// only go down; lower the budget as violations are removed, and move a rule
// into eslint.config.js as an error once it reaches zero.
const warnImports = (files, patterns) => ({
  files,
  rules: { 'no-restricted-imports': ['warn', { patterns }] },
})

const FEATURES = ['editor', 'fontOverview', 'home', 'featureWorkspace']

export default defineConfig([
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    // Registered so inline eslint-disable comments for these rules resolve.
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  warnImports(
    ['src/lib/**', 'src/font/**'],
    [
      {
        regex: '^@/store(/|$)',
        message:
          'lib and font must not depend on the store; keep the shared model store-free.',
      },
    ]
  ),
  warnImports(
    ['src/workers/**'],
    [
      {
        regex: '^@/features(/|$)',
        message: 'Workers must not depend on src/features.',
      },
    ]
  ),
  warnImports(
    ['src/features/common/**'],
    [
      {
        regex: `^@/features/(${FEATURES.join('|')})(/|$)`,
        message: 'features/common must not depend on a specific feature.',
      },
    ]
  ),
  ...FEATURES.map((name) =>
    warnImports(
      [`src/features/${name}/**`],
      [
        {
          regex: `^@/features/(?!(${name}|common)(/|$))`,
          message: `features/${name} may only import from itself and features/common.`,
        },
      ]
    )
  ),
])
