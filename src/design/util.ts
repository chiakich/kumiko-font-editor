// Shared token helpers for the design system.

export type TokenLeaf = string | { value: string }

export interface TokenTree {
  [key: string]: TokenLeaf | TokenTree
}

export interface TokenOutputTree {
  [key: string]: { value: string } | TokenOutputTree
}

const isTokenLeaf = (value: unknown): value is { value: string } =>
  value != null &&
  typeof value === 'object' &&
  'value' in value &&
  typeof (value as { value?: unknown }).value === 'string'

export const toTokenTree = (tokens: TokenTree): TokenOutputTree =>
  Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [
      key,
      typeof value === 'string'
        ? { value }
        : isTokenLeaf(value)
          ? value
          : toTokenTree(value),
    ])
  ) as TokenOutputTree

// A mode-aware color leaf: literal CSS colors per color mode. `_dark` is
// applied under the `.dark` class; `base` everywhere else (i.e. light).
export interface ModeColor {
  base: string
  _dark: string
}

const isModeColor = (value: unknown): value is ModeColor =>
  value != null &&
  typeof value === 'object' &&
  'base' in value &&
  '_dark' in value

export const mode = (base: string, _dark: string): ModeColor => ({
  base,
  _dark,
})

// String values are treated as token references (`{colors.<path>}`); use `mode()`
// for literal per-mode colors. Nested objects recurse (e.g. Chakra `bg`/`fg`).
export const toColorSemanticTokenTree = (
  tokens: Record<string, unknown>
): TokenOutputTree =>
  Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [
      key,
      typeof value === 'string'
        ? { value: `{colors.${value}}` }
        : isModeColor(value)
          ? { value: { base: value.base, _dark: value._dark } }
          : isTokenLeaf(value)
            ? { value: `{colors.${value.value}}` }
            : toColorSemanticTokenTree(value as Record<string, unknown>),
    ])
  ) as TokenOutputTree
