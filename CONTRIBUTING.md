# Contributing to Kumiko

Thanks for your interest in contributing! This guide covers how to set up the project, run it locally, and submit changes. For an overview of the codebase, see [docs/architecture.md](docs/architecture.md).

## Prerequisites

This project uses **pnpm 10**. The `packageManager` field in `package.json` provides the default Corepack version. `.npmrc` requires pnpm while allowing pnpm 10.x, which avoids large `pnpm-lock.yaml` rewrites from different major versions.

Before your first development session:

```bash
corepack enable
corepack prepare pnpm@10.33.3 --activate
```

If your system has an older pnpm installed through Homebrew or another package manager, it may override the Corepack shim. In that case, prefer `corepack pnpm ...`, or remove/upgrade the old global pnpm installation.

If `pnpm-lock.yaml` receives large formatting changes after running install, check your active version:

```bash
corepack pnpm --version
```

The version should be `10.x`. Do not update dependencies with pnpm 8/9 or other older pnpm versions.

## Running locally

For frontend-only UI development:

```bash
pnpm install
pnpm dev
```

To test GitHub sign-in, GitHub loading, or any `/functions` route, use
Cloudflare Pages Functions local mode:

```bash
cp .dev.vars.example .dev.vars
# Edit .dev.vars and fill in values from your GitHub OAuth App
pnpm cf:preview
```

### Environment variables (optional)

`.dev.vars` requires at least these values:

```bash
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_SESSION_SECRET=...
GITHUB_OAUTH_SCOPE=public_repo read:user user:email
```

`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` come from your own
[GitHub OAuth App](https://github.com/settings/developers).
`GITHUB_SESSION_SECRET` should be a sufficiently long random string — Functions uses it to sign the GitHub session cookie.

## Quality checks

Run these before submitting changes:

```bash
pnpm lint    # prettier --check . && eslint .
pnpm build   # pnpm lint && tsc -b && vite build
pnpm test    # vitest run
```

Git hooks run `lint-staged` before `git commit` to format staged files and
apply ESLint fixes where possible. They also run `pnpm lint` before `git push`
as a full quality gate. Hooks are installed by `pnpm install` through the
`prepare` script. To install them manually, run:

```bash
pnpm prepare
```

### Code style

Formatting is enforced by Prettier (see `.prettierrc`): no semicolons, single
quotes, ES5 trailing commas, 80-column print width. Run `pnpm format` to apply
it automatically, or `pnpm lint` to check. Linting is enforced by ESLint
(see `eslint.config.js`).

When adding or moving code, follow the placement guidelines in
[docs/architecture.md](docs/architecture.md#placement-guidelines).

## Data pipeline scripts

Scripts under `scripts/` convert external data sources into TSV files under
`public/` for runtime fetches. These sources are updated periodically and must
be synchronized manually:

| Command                      | Source                                                                                               | Output                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm data:glyphdata`        | Glyphs [GlyphData.xml](https://github.com/schriftgestalt/GlyphsInfo) (auto-downloaded, BSD 3-Clause) | `public/glyphsdata/glyphdata.txt`: glyph name / altName -> unicode and production name |
| `pnpm data:ids`              | BabelStone [IDS.TXT](https://www.babelstone.co.uk/CJK/IDS.TXT) (auto-downloaded)                     | `public/ids/ids_babelstone.txt`                                                        |
| `pnpm data:glyphwiki <dump>` | GlyphWiki dump (download `dump_newest_only.txt` manually first)                                      | `public/glyphwiki/composition.txt` and `variants.txt`                                  |

`glyphdata.txt` maps nice names from Glyphs character set lists, such as
`leftArrow`, to Unicode and export production names, such as `arrowleft`. CJK
ideographs are not covered by that table and are parsed with the `uniXXXX`
naming convention. See [docs/glyph-naming.md](docs/glyph-naming.md) for details.

## Submitting changes

Kumiko follows a standard GitHub fork-and-pull-request flow:

1. **Fork** the repository and clone your fork.
2. **Create a branch** off `main` with a descriptive name, e.g.
   `feat/ids-component-insert` or `fix/canvas-clipboard-paste`.
3. **Make your change**, keeping commits focused. Commit messages follow a
   [Conventional Commits](https://www.conventionalcommits.org/)-style prefix
   (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), matching the
   existing git history.
4. **Run the quality checks** (`pnpm lint`, `pnpm build`, `pnpm test`) and make
   sure they pass.
5. **Open a pull request** against `main`. Describe what changed and why; link
   any related issue. For changes that affect the GitHub workflow or Functions,
   note how you tested them with `pnpm cf:preview`.

Smaller, well-scoped pull requests are easier to review and land faster. If
you're planning a large change, consider opening an issue first to discuss the
approach.
