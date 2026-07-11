<img width="1088" height="362" alt="image" src="https://github.com/user-attachments/assets/725fa628-7af8-4aaf-aae8-0950599abad8" />
<img width="1778" height="1014" alt="image" src="https://github.com/user-attachments/assets/5f75232b-dc20-41e2-b8d2-ce1dc9333f0a" />

# Kumiko Font Editor

English | [繁體中文](README.zh-TW.md)

**A brand-new, web-based font editor — currently focused on being a GitHub-centric tool for completing CJK character sets (補字).**

**Try it live → [kumiko.chiaki.ch](https://kumiko.chiaki.ch)**

Kumiko is a from-scratch, zero-install font editor that runs entirely in the browser. Today it focuses on one job: filling in missing CJK glyphs directly against a GitHub repository. Contributors load a UFO project from a repo, edit glyphs in the browser, and push changes back as pull requests — no local toolchain, no backend to run, no setup.

## Why Kumiko?

While excellent tools like [Fontra](https://github.com/googlefonts/fontra) exist, Kumiko focuses on the unique friction points of open-source CJK font development. We achieve this through four core principles:

1. **True Zero-Install Experience**: Unlike existing web-based font tools that still require setting up a local backend server, Kumiko is a pure frontend application. Contributors can open the browser, authenticate with GitHub, and start designing immediately. Zero friction means more community contributions.
2. **Modern & Sustainable Architecture**: Built entirely with React, TypeScript, and Vite. Kumiko's component-driven architecture makes it deeply customizable and highly welcoming for frontend developers to contribute.
3. **IDS-Driven Component Workflow**: CJK fonts require tens of thousands of glyphs. Kumiko features a built-in Ideographic Description Characters (IDS) decomposition engine, allowing designers to rapidly construct and supplement missing characters through reusable components.
4. **Quantified Quality Suggestions**: To maintain professional standards in a decentralized open-source environment, Kumiko acts as a "Linter for typography," integrating live grayscale testing and statistical design suggestions right into the editing canvas. (The suggestion engine ships in an early form today and is actively evolving.)

## Features

- **Open from anywhere**: import local `.ufo`, `.designspace`, `.glyphs`, `.glyphspackage`, or binary font files, or load a UFO project straight from a GitHub repository (via a Cloudflare Pages Functions archive proxy).
- **GitHub-native workflow**: sign in with GitHub OAuth, check your fork, list branches, push commits, and open a compare page to raise a pull request.
- **Component-aware glyph editing**: edit paths, nodes, and metrics on the canvas, with an IDS engine for assembling CJK glyphs from reusable components.
- **Built-in quality checks**: live grayscale preview and statistical design insights surfaced directly in the editor.
- **Offline-friendly drafts**: work is stored in browser IndexedDB so projects can be reopened later.

## Roadmap

Kumiko's near-term focus is the **collaborative glyph-completion workflow** — contributor experience first, editor completeness second. Highlights:

- Robust GitHub sync (per-glyph conflict resolution; server-side session storage replacing signed cookies).
- Kerning anchored to the UFO model (`groups.plist` / `kerning.plist`), exported as FEA. See [docs/kerning.md](docs/kerning.md) for the current plan.
- Expanded GitHub write-back for more UFO metadata and non-glyph files.
- Exploring OpenType features support.

See [docs/product-direction.md](docs/product-direction.md) for the full direction and agreed routes.

## Documentation

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — set up the project, run it locally, configure environment variables, and submit changes.
- **[docs/architecture.md](docs/architecture.md)** — tech stack, state-management strategy, and project structure.
- **[docs/](docs/README.md)** — developer notes on design decisions (CJK component strategy, quality checks, glyph naming, variable fonts, and more).

### Relationship to Fontra

Kumiko draws on many ideas from [Fontra](https://github.com/googlefonts/fontra), and ports select pure-algorithm modules file-by-file into `src/font/fontra-ported/`. But the stacks differ enough that Kumiko cannot be a direct fork: Fontra pairs a web UI with a Python WebSocket backend, while Kumiko stays as close as practical to a pure frontend. See [docs/fontra-parity.md](docs/fontra-parity.md) for the tracking strategy, the current Fontra baseline SHA, and the re-sync process.

## License

[MIT](LICENSE) © Chiaki Chen. Third-party data and font licenses are listed in [CREDITS.md](CREDITS.md).
