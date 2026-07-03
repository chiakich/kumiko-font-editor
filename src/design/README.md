# Design System

Single source of truth for colors, radii, typography, motion, and component
styling. Mounted once in [`src/main.tsx`](../main.tsx) via
`<ChakraProvider value={system}>`.

## Layers

Tokens flow in three layers — always reference the highest layer that fits.

```
palette.ts     primitives   raw hex ramps: gray, yellow, cyan, red, green,
                            orange, blue, teal, purple, pink (50–950) + alpha
      │
      ▼
semantic.ts    roles        shadcn-style names: background, foreground, card,
                            muted, mutedForeground, border, primary,
                            destructive, success, warning, ring, …
      │
      ▼
recipes.ts     components    Button / Input / Select / Tag / Menu / Tabs /
                            Tooltip / Textarea styles built from the roles
```

| File                                     | Holds                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `palette.ts`                             | Primitive color ramps. These **replace** Chakra's same-named default palettes, so `colorPalette="red"` and `red.500` resolve to our values. |
| `semantic.ts`                            | Role tokens (mode-aware) + overrides for Chakra's own `bg`/`fg`.                                                                            |
| `radii.ts`                               | Corner radius ladder (astryx `inner 4 / element 8 / container 12`).                                                                         |
| `shadows.ts` `motion.ts` `typography.ts` | Elevation, durations/easings, fonts + text styles.                                                                                          |
| `recipes.ts`                             | Component recipes and slot recipes.                                                                                                         |
| `globalCss.ts`                           | Reset, blueprint grid, `::selection`, reduced-motion.                                                                                       |
| `index.ts`                               | Assembles `defineConfig` and exports the `system`.                                                                                          |

## Using colors

**Prefer semantic role tokens** — they carry the right light/dark value:

```tsx
<Box bg="card" color="foreground" borderColor="border" />
<Text color="mutedForeground">secondary copy</Text>
<Button>uses the primary (brand yellow) recipe</Button>
```

Role vocabulary (shadcn convention): `background` (page), `card`/`popover`
(raised surface), `muted` (quiet fill) vs `mutedForeground` (secondary **text**),
`foreground` (primary text), `haze` (faint/placeholder), `border`,
`primary`/`primaryForeground`, `accent`/`accentForeground` (inverted hover chip),
`destructive`/`success`/`warning`, `ring` (focus).

**Status colors** use Chakra's `colorPalette` — it reads our ramps:

```tsx
<Badge colorPalette="green">clean</Badge>
<Badge colorPalette="red">error</Badge>
```

Reach for a raw primitive (`gray.400`, `yellow.200`) only for a one-off shade
with no semantic meaning. Never introduce a new `field.*` token — that namespace
was removed; everything is semantic now.

## Color mode

Custom and dependency-free — **not** Chakra's `next-themes` snippet (this is a
Vite SPA). [`src/lib/preferences/colorMode.ts`](../lib/preferences/colorMode.ts)
toggles a `.dark` / `.light` class on `<html>`; the theme responds through the
`_dark` condition on mode-aware tokens (see `mode()` in `util.ts`). To read the
preference in a component use `useColorModePreference()`; to change it use
`saveColorMode()`. Do **not** import Chakra's `useColorMode` / `ColorModeProvider`.

## Snippets (`src/components/ui/`)

Chakra v3 snippets are components you **own and copy in as needed** — do not bulk
import the whole set. Present: `tooltip`, `toaster`/`toast`, `switch`,
`dialog-close-button`, plus the custom `sliding-tabs`. Add a new one with
`npx @chakra-ui/cli snippet add <name>` only when a compound component's
boilerplate starts repeating, then adapt it to our tokens.
