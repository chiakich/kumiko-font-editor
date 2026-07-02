import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

const monoStack =
  '"IBM Plex Mono", "SFMono-Regular", "Menlo", "Consolas", monospace'
const sansStack =
  '"SF Pro Display", "SF Pro Text","Noto Sans TC", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", "Noto Sans HK", "Segoe UI", system-ui, sans-serif'
const glyphStack =
  '"PingFang TC", "Noto Sans TC", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", "Noto Sans HK", "Noto Sans Symbols 2", "PUAExt", "Segoe UI Symbol", sans-serif'
const plusMarkerPattern =
  "url(\"data:image/svg+xml,%3Csvg width='26' height='26' viewBox='0 0 26 26' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13 8.5V17.5M8.5 13H17.5' stroke='%23080B0D' stroke-opacity='0.18' stroke-width='1'/%3E%3C/svg%3E\")"
// dark-mode variant of the blueprint grid — light strokes on the near-black bg
const plusMarkerPatternDark =
  "url(\"data:image/svg+xml,%3Csvg width='26' height='26' viewBox='0 0 26 26' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13 8.5V17.5M8.5 13H17.5' stroke='%23E7EAE4' stroke-opacity='0.10' stroke-width='1'/%3E%3C/svg%3E\")"

type TokenLeaf = string | { value: string }

interface TokenTree {
  [key: string]: TokenLeaf | TokenTree
}

interface TokenOutputTree {
  [key: string]: { value: string } | TokenOutputTree
}

const isTokenLeaf = (value: unknown): value is { value: string } =>
  value != null &&
  typeof value === 'object' &&
  'value' in value &&
  typeof (value as { value?: unknown }).value === 'string'

const toTokenTree = (tokens: TokenTree): TokenOutputTree =>
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
interface ModeColor {
  base: string
  _dark: string
}

const isModeColor = (value: unknown): value is ModeColor =>
  value != null &&
  typeof value === 'object' &&
  'base' in value &&
  '_dark' in value

const mode = (base: string, _dark: string): ModeColor => ({ base, _dark })

const toColorSemanticTokenTree = (
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

const colors = {
  field: {
    // fixed palette — never flips between modes (brand hues + neutral anchors)
    graphite: '#12171A',
    steel: '#252B2E',
    line: '#31383C',
    // fixed foregrounds for text that always sits on a colored chip:
    // dark ink on yellow/green, white on red — must not follow color mode
    onColor: '#080B0D',
    onDanger: '#FFFFFF',
    yellow: {
      200: {
        value: '#FFFD8F',
      },
      300: {
        value: '#FFFB42',
      },
      400: {
        value: '#F7EB40',
      },
      500: {
        value: '#E5E000',
      },
      600: {
        value: '#B3AF00',
      },
    },
    cyan: {
      300: {
        value: '#6FF4FF',
      },
      400: {
        value: '#25DAF2',
      },
      500: {
        value: '#00AFC9',
      },
    },
    red: {
      400: {
        value: '#FF604F',
      },
      500: {
        value: '#E83A2B',
      },
    },
    green: {
      400: {
        value: '#A8FF5C',
      },
      500: {
        value: '#6DD526',
      },
    },
    gray: {
      50: {
        value: '#F6F7F4',
      },
      100: {
        value: '#E5E7E2',
      },
      200: {
        value: '#CFD3CB',
      },
      300: {
        value: '#B8BDB3',
      },
      400: {
        value: '#939A90',
      },
      500: {
        value: '#5F675D',
      },
      600: {
        value: '#4A5148',
      },
      700: {
        value: '#353B33',
      },
      800: {
        value: '#232823',
      },
      900: {
        value: '#121611',
      },
    },
  },
}

// Mode-aware chrome tokens keep their original `field.*` names so the ~300
// existing direct usages (color="field.muted", bg="field.panel", …) light up
// dark mode with zero call-site changes. Dark values follow astryx's
// muted-neutral approach: soft near-black surfaces, low-contrast hairlines.
// The editing canvas is deliberately NOT driven by these (it uses a literal
// white bg + its own paper.js colors), so it stays black-on-white in any mode.
const fieldChrome = {
  field: {
    // Neither end is stark: light is a faintly warm off-white/grey, dark is a
    // soft charcoal (never pure black) — astryx's muted-neutral feel. Surfaces
    // step up in lightness (paper → panel) so cards read as gently raised.
    paper: mode('#F4F5F2', '#17191A'), // page background
    panel: mode('#FCFCFB', '#1F2223'), // cards / panels / popovers
    panelMuted: mode('#E7E9E3', '#292D2E'), // quiet fills
    ink: mode('#0B0F11', '#E9ECE6'), // primary text (flips)
    muted: mode('#5F675D', '#98A199'), // secondary text (flips)
    haze: mode('#B4B9AF', '#6E776E'), // faint text / placeholder
    // soft control edges — harmonize with the blueprint plus-pattern
    hairline: mode('rgba(11, 15, 17, 0.14)', 'rgba(233, 236, 230, 0.13)'),
    hairlineStrong: mode('rgba(11, 15, 17, 0.28)', 'rgba(233, 236, 230, 0.24)'),
  },
}

const semanticTokens = {
  colors: {
    ...fieldChrome,
    // surfaces
    background: 'field.paper',
    foreground: 'field.ink',
    card: 'field.panel',
    cardForeground: 'field.ink',
    popover: 'field.panel',
    popoverForeground: 'field.ink',
    // brand / interactive — yellow stays yellow in both modes
    primary: 'field.yellow.400',
    primaryForeground: 'field.onColor', // fixed dark ink on yellow
    primaryHover: 'field.yellow.300',
    primaryActive: 'field.yellow.500',
    secondary: 'field.panelMuted',
    secondaryForeground: 'field.ink',
    // quiet / supporting
    muted: 'field.panelMuted',
    mutedForeground: 'field.muted',
    haze: 'field.haze',
    // accent = the "inverted" hover chip — dark-on-light flips to light-on-dark
    accent: mode('#0B0F11', '#E9ECE6'),
    accentForeground: mode('#FFFB42', '#0B0F11'),
    // status
    destructive: 'field.red.500',
    destructiveHover: 'field.red.400',
    destructiveForeground: 'field.onDanger', // fixed white on red
    success: 'field.green.500',
    successForeground: 'field.onColor', // fixed dark ink on green
    warning: 'field.yellow.500',
    // lines & focus
    border: mode('#31383C', '#3A4042'),
    input: mode('#31383C', '#3A4042'),
    ring: 'field.cyan.400',
    // refined control edges — softer than the structural `border`
    controlBorder: 'field.hairline',
    controlBorderHover: 'field.hairlineStrong',
    placeholder: 'field.haze',
    // data visualization
    'chart.1': 'field.yellow.400',
    'chart.2': 'field.cyan.400',
    'chart.3': 'field.red.500',
    'chart.4': 'field.green.500',
    'chart.5': 'field.graphite',
  },
}

const shadows = {
  // layered elevation — hairline + ambient, each level lifts a bit further
  low: '0 1px 2px rgba(8, 11, 13, 0.06), 0 1px 1px rgba(8, 11, 13, 0.04)',
  med: '0 4px 12px rgba(8, 11, 13, 0.08), 0 2px 4px rgba(8, 11, 13, 0.05)',
  high: '0 14px 34px rgba(8, 11, 13, 0.12), 0 4px 12px rgba(8, 11, 13, 0.08)',
  // kept for backwards-compat with existing references
  floating:
    '0 14px 34px rgba(8, 11, 13, 0.12), 0 4px 12px rgba(8, 11, 13, 0.08)',
}

// motion — astryx's standard easing + fast/normal durations for controls
const durations = {
  fast: '150ms',
  normal: '220ms',
  slow: '400ms',
}

const easings = {
  standard: 'cubic-bezier(0.24, 1, 0.4, 1)',
  emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
}

// role-tuned line-heights (行距) — tight for headings, relaxed for small copy
const lineHeights = {
  none: '1',
  tight: '1.25',
  snug: '1.35',
  normal: '1.5',
  relaxed: '1.65',
}

const letterSpacings = {
  tight: '-0.01em',
  normal: '0',
  wide: '0.02em',
  // tiny all-caps labels breathe better with extra tracking
  caps: '0.06em',
}

// opt-in named type styles — bundle size + weight + 行距 + tracking so text
// picks up consistent leading without per-usage tuning (usage: textStyle="body")
const textStyles = {
  display: {
    value: {
      fontSize: '2xl',
      fontWeight: '700',
      lineHeight: 'tight',
      letterSpacing: 'tight',
    },
  },
  heading: {
    value: {
      fontSize: 'lg',
      fontWeight: '700',
      lineHeight: 'snug',
      letterSpacing: 'tight',
    },
  },
  body: {
    value: {
      fontSize: 'sm',
      fontWeight: '400',
      lineHeight: 'normal',
      letterSpacing: 'normal',
    },
  },
  label: {
    value: {
      fontSize: 'sm',
      fontWeight: '600',
      lineHeight: 'normal',
      letterSpacing: 'normal',
    },
  },
  supporting: {
    value: {
      fontSize: 'xs',
      fontWeight: '400',
      lineHeight: 'relaxed',
      letterSpacing: 'normal',
    },
  },
  caps: {
    value: {
      fontSize: '10px',
      fontWeight: '700',
      lineHeight: 'none',
      letterSpacing: 'caps',
      textTransform: 'uppercase',
    },
  },
  code: {
    value: {
      fontFamily: 'mono',
      fontSize: 'sm',
      fontWeight: '400',
      lineHeight: 'normal',
    },
  },
}

const components = {
  Button: {
    baseStyle: {
      borderRadius: '2px',
      fontFamily: sansStack,
      fontWeight: 700,
      lineHeight: '1',
      letterSpacing: '0.02em',
      transitionProperty: 'background-color, color, border-color, box-shadow',
      transitionDuration: 'fast',
      transitionTimingFunction: 'standard',
      _focusVisible: {
        outline: 'none',
        boxShadow:
          '0 0 0 2px var(--chakra-colors-background), 0 0 0 4px var(--chakra-colors-ring)',
      },
      _disabled: {
        opacity: 0.42,
        cursor: 'not-allowed',
        transform: 'none',
      },
    },
    variants: {
      solid: {
        bg: 'primary',
        color: 'primaryForeground',
        border: '1px solid transparent',
        boxShadow: 'none',
        _hover: {
          bg: 'accent',
          color: 'accentForeground',
          boxShadow: 'none',
          transform: 'none',
          _disabled: {
            bg: 'primary',
            color: 'primaryForeground',
            boxShadow: 'none',
          },
        },
        _active: {
          bg: 'primaryActive',
          color: 'primaryForeground',
          transform: 'none',
          boxShadow: 'none',
        },
      },
      outline: {
        bg: 'secondary',
        color: 'secondaryForeground',
        border: '1px solid transparent',
        _hover: {
          bg: 'primary',
          color: 'primaryForeground',
          borderColor: 'transparent',
        },
      },
      ghost: {
        color: 'foreground',
        _hover: {
          bg: 'secondary',
          color: 'secondaryForeground',
        },
        _disabled: {
          pointerEvents: 'none',
        },
      },
    },
    sizes: {
      xs: {
        h: 7,
        minW: 7,
        px: 2,
        fontSize: '10px',
      },
      sm: {
        h: 8,
        minW: 8,
        px: 3,
        fontSize: '12px',
      },
      md: {
        h: 9,
        minW: 9,
        px: 4,
        fontSize: 'sm',
      },
    },
    defaultProps: {
      variant: 'solid',
    },
  },
  Input: {
    variants: {
      outline: {
        field: {
          bg: 'card',
          borderRadius: 'control',
          borderWidth: '1px',
          borderColor: 'controlBorder',
          color: 'foreground',
          fontFamily: monoStack,
          lineHeight: 'normal',
          transitionProperty: 'border-color, box-shadow',
          transitionDuration: 'fast',
          transitionTimingFunction: 'standard',
          _placeholder: {
            color: 'placeholder',
          },
          _hover: {
            borderColor: 'controlBorderHover',
          },
          _focusVisible: {
            borderColor: 'ring',
            boxShadow: '0 0 0 1px var(--chakra-colors-ring)',
          },
          _disabled: {
            opacity: 0.5,
            cursor: 'not-allowed',
            bg: 'secondary',
          },
        },
      },
    },
    sizes: {
      sm: {
        field: { h: 8, px: 3, fontSize: 'xs', borderRadius: 'control' },
      },
      md: {
        field: { h: 9, px: 3, fontSize: 'sm', borderRadius: 'control' },
      },
    },
    defaultProps: {
      variant: 'outline',
      size: 'md',
    },
  },
  Select: {
    variants: {
      outline: {
        field: {
          bg: 'card',
          borderRadius: 'control',
          borderWidth: '1px',
          borderColor: 'controlBorder',
          color: 'foreground',
          fontFamily: monoStack,
          lineHeight: 'normal',
          transitionProperty: 'border-color, box-shadow',
          transitionDuration: 'fast',
          transitionTimingFunction: 'standard',
          _hover: {
            borderColor: 'controlBorderHover',
          },
          _focusVisible: {
            borderColor: 'ring',
            boxShadow: '0 0 0 1px var(--chakra-colors-ring)',
          },
        },
      },
    },
  },
  Tag: {
    baseStyle: {
      container: {
        borderRadius: '2px',
        border: '1px solid transparent',
        bg: 'secondary',
        color: 'secondaryForeground',
        fontFamily: monoStack,
        fontWeight: 700,
      },
    },
  },
  Menu: {
    baseStyle: {
      list: {
        borderRadius: '3px',
        bg: 'popover',
        p: 1,
        boxShadow: 'med',
      },
      item: {
        borderRadius: '2px',
        fontWeight: 700,
        transitionProperty: 'background-color, color',
        transitionDuration: 'fast',
        transitionTimingFunction: 'standard',
        _hover: {
          bg: 'accent',
          color: 'accentForeground',
        },
        _focus: {
          bg: 'accent',
          color: 'accentForeground',
        },
      },
    },
  },
  Tabs: {
    variants: {
      enclosed: {
        tab: {
          borderRadius: 'full',
          borderColor: 'transparent',
          fontWeight: 900,
          border: 'none',
          px: 4,
          _hover: {
            bg: 'card',
            color: 'foreground',
          },
          _selected: {
            color: 'accentForeground',
            bg: 'accent',
            borderColor: 'transparent',
          },
        },
        tablist: {
          alignItems: 'center',
          bg: 'secondary',
          borderBottom: 'none',
          borderRadius: 'full',
          gap: 1,
          p: 1,
        },
      },
    },
  },
  Tooltip: {
    baseStyle: {
      color: 'white',
      bg: 'foreground',
      fontSize: '10px',
      fontWeight: 700,
      lineHeight: 'snug',
      letterSpacing: 'wide',
      px: 2,
      py: 1,
      borderRadius: '2px',
      boxShadow: 'med',
      _disabled: {
        pointerEvents: 'none',
      },
    },
  },
}

const recipes = {
  button: {
    base: components.Button.baseStyle,
    variants: {
      variant: components.Button.variants,
      size: components.Button.sizes,
    },
    defaultVariants: components.Button.defaultProps,
  },
  input: {
    variants: {
      variant: {
        outline: components.Input.variants.outline.field,
      },
      size: {
        sm: components.Input.sizes.sm.field,
        md: components.Input.sizes.md.field,
      },
    },
    defaultVariants: components.Input.defaultProps,
  },
  textarea: {
    base: {
      borderRadius: 'control',
      lineHeight: 'normal',
      transitionProperty: 'border-color, box-shadow',
      transitionDuration: 'fast',
      transitionTimingFunction: 'standard',
      _placeholder: { color: 'placeholder' },
    },
    variants: {
      variant: {
        // mirror the input outline so textareas match rounded inputs in both modes
        outline: {
          bg: 'card',
          borderRadius: 'control',
          borderWidth: '1px',
          borderColor: 'controlBorder',
          color: 'foreground',
          _hover: { borderColor: 'controlBorderHover' },
          _focusVisible: {
            borderColor: 'ring',
            boxShadow: '0 0 0 1px var(--chakra-colors-ring)',
          },
          _disabled: { opacity: 0.5, cursor: 'not-allowed', bg: 'secondary' },
        },
      },
    },
    defaultVariants: { variant: 'outline' },
  },
  tooltip: {
    base: components.Tooltip.baseStyle,
  },
}

const slotRecipes = {
  menu: {
    slots: ['content', 'item'],
    base: {
      content: components.Menu.baseStyle.list,
      item: components.Menu.baseStyle.item,
    },
  },
  nativeSelect: {
    slots: ['root', 'field', 'indicator'],
    variants: {
      variant: {
        outline: {
          field: components.Select.variants.outline.field,
        },
      },
    },
  },
  tabs: {
    slots: ['root', 'list', 'trigger', 'content', 'contentGroup', 'indicator'],
    variants: {
      variant: {
        enclosed: {
          list: components.Tabs.variants.enclosed.tablist,
          trigger: components.Tabs.variants.enclosed.tab,
        },
      },
    },
  },
  tag: {
    slots: ['root', 'label', 'closeTrigger', 'startElement', 'endElement'],
    base: {
      root: components.Tag.baseStyle.container,
    },
  },
}

const customConfig = defineConfig({
  globalCss: {
    ':root': {
      '--field-plus-pattern': plusMarkerPattern,
      colorScheme: 'light',
    },
    '.dark': {
      '--field-plus-pattern': plusMarkerPatternDark,
      colorScheme: 'dark',
    },
    '*': {
      boxSizing: 'border-box',
    },
    'html, body, #root': {
      margin: 0,
      width: '100%',
      minHeight: '100%',
    },
    body: {
      minHeight: '100vh',
      bg: 'background',
      color: 'foreground',
      backgroundColor: 'background',
      backgroundImage: 'var(--field-plus-pattern)',
      backgroundSize: '26px 26px',
      backgroundRepeat: 'repeat',
      fontSynthesis: 'none',
      textRendering: 'optimizeLegibility',
      lineHeight: 'normal',
      letterSpacing: 'normal',
    },
    canvas: {
      touchAction: 'none',
    },
    '::selection': {
      bg: 'primary',
      color: 'primaryForeground',
    },
    // honor OS reduced-motion — collapse transitions to instant state changes
    '*, *::before, *::after': {
      '@media (prefers-reduced-motion: reduce)': {
        transitionDuration: '0.01ms !important',
        animationDuration: '0.01ms !important',
        animationIterationCount: '1 !important',
        scrollBehavior: 'auto !important',
      },
    },
  },

  theme: {
    tokens: {
      colors: toTokenTree(colors),
      shadows: toTokenTree(shadows),
      durations: toTokenTree(durations),
      easings: toTokenTree(easings),
      lineHeights: toTokenTree(lineHeights),
      letterSpacings: toTokenTree(letterSpacings),

      fonts: {
        heading: {
          value: sansStack,
        },
        body: {
          value: sansStack,
        },
        mono: {
          value: monoStack,
        },
        glyph: {
          value: glyphStack,
        },
      },

      radii: {
        none: {
          value: '0',
        },
        sm: {
          value: '2px',
        },
        md: {
          value: '3px',
        },
        lg: {
          value: '4px',
        },
        xl: {
          value: '4px',
        },
        // inputs/selects adopt astryx's softer, rounded control shape while
        // buttons & structural chrome keep the signature small radius
        control: {
          value: '8px',
        },
      },
    },

    semanticTokens: toColorSemanticTokenTree(semanticTokens),

    textStyles,

    recipes,
    slotRecipes,
  },
})

const system = createSystem(defaultConfig, customConfig)

export default system
