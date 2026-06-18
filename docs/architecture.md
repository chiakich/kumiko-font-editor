# Architecture

This document gives a high-level map of how Kumiko is built: the technology
choices, the state-management strategy, and where code lives. For the "why"
behind specific design decisions, follow the links to the deeper notes at the
end.

## Technology choices

Kumiko is a **pure frontend application** — there is no long-running backend.
The only server-side code is a thin set of Cloudflare Pages Functions that
proxy GitHub (OAuth and archive downloads), so the editor itself runs entirely
in the browser.

| Concern              | Choice                                                                 |
| -------------------- | ---------------------------------------------------------------------- |
| UI framework         | **React 19** + **TypeScript**                                          |
| Build tooling        | **Vite** (with `vite-plugin-svgr` for icon components)                 |
| Component library    | **Chakra UI** + Emotion, **Framer Motion** for animation               |
| Global state         | **Zustand** (with **zundo** for temporal undo/redo)                    |
| Server state / cache | **TanStack Query** (GitHub API reads)                                  |
| Geometry / curves    | **paper.js**, **bezier-js**, and ported algorithms in `fontra-ported/` |
| Font I/O             | **opentype.js**, **fonteditor-core**, **harfbuzzjs** (shaping)         |
| Font compilation     | **Pyodide** running fontTools for export                               |
| Persistence          | Browser **IndexedDB** (drafts)                                         |
| i18n                 | **i18next** / react-i18next                                            |
| Long lists           | **react-virtuoso** virtualization                                      |

Server-side code lives in `functions/api/github/` and runs as Cloudflare Pages
Functions: GitHub OAuth, viewer/repo metadata, the archive proxy, and
fork/commit/merge endpoints.

## State-management strategy

Global, editable state lives in a single Zustand store under `src/store/`. The
key ideas:

- **One store, composed actions.** `src/store/index.ts` creates the store,
  composes the mutation actions, and wires the temporal (undo/redo) entry point
  via zundo. Types for glyph, font, selection, viewport, and global state live
  in `src/store/types.ts`.
- **Domain logic is split by concern**, not dumped into one file:
  - `glyphGeometry.ts` — path/node geometry helpers (endpoint checks, node
    lookup, sidebearing recomputation).
  - `glyphLayer.ts` — active/archive glyph layer reads and top-level glyph sync.
  - `glyphSearch.ts` — glyph overview/search filtering and IDS dictionary
    support.
  - `editorLine.ts` — editor glyph line, cursor, and active glyph index sync.
  - `dirtyState.ts` — dirty / local-dirty flag updates.
- **Server state stays out of the store.** GitHub reads go through TanStack
  Query so caching and revalidation aren't reinvented in Zustand.
- **Feature-local state is preferred when possible.** If a feature only needs to
  shape data for its own UI, it uses a feature-local hook rather than adding to
  the global store.

The low-level canvas (controller, scene view, rendering layers) lives in
`src/canvas/` and is deliberately decoupled from React — it does not own React
UI. Editor interaction tools (pointer, pen, brush, etc.) live separately under
`src/features/editor/tools/`.

## Project structure

### Frontend `src/`

- `src/features/home/`: home screen, project import entry points, recent project list, and local UFO / GitHub import flows.
- `src/features/editor/`: overall editor layout composition and feature entry points, such as the three-column editor layout.
- `src/features/editor/canvas/`: main glyph editing canvas, canvas lifecycle, tool shortcuts, clipboard, and text input integration.
- `src/features/editor/leftPanel/`: glyph / component search, preview, and editor-line insertion UI for the left editor panel.
- `src/features/editor/tools/`: editor interaction tools such as pointer, pen, brush, hand, text, and scene controller tools.
- `src/features/fontOverview/`: full font overview, grouping, search, new glyph creation, and overview grid.
- `src/features/common/`: feature-level UI and hooks shared across major features.
- `src/features/common/glyphInspector/`: glyph inspector shared by the editor and overview, including glyph summary, node inspector, metrics, save, and GitHub commit flow.
- `src/sceneView/`: low-level canvas controller, scene view, and rendering layers. It should not directly own React UI.
- `src/store/`: Zustand global state, glyph editing data model, and mutation actions (see the breakdown above).
- `src/lib/`: data processing and integration logic shared by multiple features, such as UFO/Glyphs formats, GitHub API, IndexedDB persistence, and export worker clients.
- `src/workers/`: Web Worker entry points for heavier background work such as search and large exports.
- `src/hooks/`: React hooks shared across features.
- `src/icons/`: shared project icon components.
- `src/font/`: glyph path data structures and font-specific helpers.
  - `src/font/fontra-ported/`: pure algorithm modules ported file-by-file from Fontra, such as curve fitting and variable font interpolation. See that folder's README and [fontra-parity.md](fontra-parity.md).
- `src/assets/`: frontend static assets.

### Backend and public assets

- `functions/api/github/`: Cloudflare Pages Functions for GitHub OAuth, viewer, repository metadata, archive proxy, fork/commit/merge, and related APIs.
- `public/`: public static files served without bundler processing, such as the manifest, favicon, and Hanseeker data.

### Placement guidelines

- Add new pages or user flows under the relevant `src/features/<feature>/` folder first.
- Put logic in `src/lib/` only when it is shared across multiple features and owns data processing, external integration, or domain rules.
- Keep feature-internal helpers inside the feature folder. For example, canvas clipboard formats belong in `src/features/editor/canvas/`.
- Put canvas rendering in `src/sceneView/`; put editor interaction tools in `src/features/editor/tools/`; React components should not be placed directly in `src/sceneView/`.
- Keep global state in `src/store/`. If a feature only needs to shape data for UI, prefer a feature-local hook.

## Deeper notes

This document is the overview. The following notes in [docs/](README.md) cover
specific decisions and the "why" that code and git history don't show:

- [Product direction & roadmap](product-direction.md) — Kumiko as a collaborative glyph-completion platform, and the agreed sync / kerning / IDS routes.
- [CJK component strategy & data pipeline](cjk-component-strategy.md) — why outlines are copied rather than referenced as components; the BabelStone / GlyphWiki pipeline and coordinate conventions.
- [Quality-check architecture](quality-check-architecture.md) — qualityCheck layering, ResolvedGlyph decoupling, the worker boundary, and editor-page insights.
- [Glyph naming & name mapping](glyph-naming.md) — Glyphs nice name vs production name, the GlyphData.xml pipeline, and why AGL isn't enough.
- [Fontra parity & tracking strategy](fontra-parity.md) — UFO interop, the ported algorithm layer, baseline SHA, and re-sync process.
- [Variable font support](variable-fonts.md) — interpolation data flow, current status, phased plan, and corresponding Fontra files.
- [Multi-master](multi-master.md) — multi-master design notes.
- [Kumiko project persistence](kumiko-project-persistence.md) — format-independent project/glyph IndexedDB records and the no-duplicated-vectors storage rule.
