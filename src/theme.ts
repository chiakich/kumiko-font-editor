import { extendTheme, type ThemeConfig } from '@chakra-ui/react'

const config: ThemeConfig = {
  initialColorMode: 'light',
  useSystemColorMode: false,
}

const monoStack =
  '"IBM Plex Mono", "SFMono-Regular", "Menlo", "Consolas", monospace'
const sansStack =
  '"SF Pro Display", "SF Pro Text","Noto Sans TC", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", "Noto Sans HK", "Segoe UI", system-ui, sans-serif'
const glyphStack =
  '"PingFang TC", "Noto Sans TC", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", "Noto Sans HK", "Noto Sans Symbols 2", "PUAExt", "Segoe UI Symbol", sans-serif'
const plusMarkerPattern =
  "url(\"data:image/svg+xml,%3Csvg width='26' height='26' viewBox='0 0 26 26' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13 8.5V17.5M8.5 13H17.5' stroke='%23080B0D' stroke-opacity='0.18' stroke-width='1'/%3E%3C/svg%3E\")"

const colors = {
  field: {
    ink: '#080B0D',
    graphite: '#12171A',
    steel: '#252B2E',
    line: '#31383C',
    paper: '#f8f8f8',
    panel: '#FFFFFF',
    panelMuted: '#E5E7E2',
    haze: '#B8BDB3',
    muted: '#5F675D',
    yellow: {
      200: '#FFFD8F',
      300: '#FFFB42',
      400: '#F7EB40',
      500: '#E5E000',
      600: '#B3AF00',
    },
    cyan: {
      300: '#6FF4FF',
      400: '#25DAF2',
      500: '#00AFC9',
    },
    red: {
      400: '#FF604F',
      500: '#E83A2B',
    },
    green: {
      400: '#A8FF5C',
      500: '#6DD526',
    },
    gray: {
      50: '#F6F7F4',
      100: '#E5E7E2',
      200: '#CFD3CB',
      300: '#B8BDB3',
      400: '#939A90',
      500: '#5F675D',
      600: '#4A5148',
      700: '#353B33',
      800: '#232823',
      900: '#121611',
    },
  },
}

const semanticTokens = {
  colors: {
    // surfaces
    background: 'field.paper',
    foreground: 'field.ink',
    card: 'field.panel',
    cardForeground: 'field.ink',
    popover: 'field.panel',
    popoverForeground: 'field.ink',
    // brand / interactive
    primary: 'field.yellow.400',
    primaryForeground: 'field.ink',
    primaryHover: 'field.yellow.300',
    primaryActive: 'field.yellow.500',
    secondary: 'field.panelMuted',
    secondaryForeground: 'field.ink',
    // quiet / supporting
    muted: 'field.panelMuted',
    mutedForeground: 'field.muted',
    haze: 'field.haze',
    // accent = the "inverted" hover state (dark chip, bright text)
    accent: 'field.ink',
    accentForeground: 'field.yellow.300',
    // status
    destructive: 'field.red.500',
    destructiveHover: 'field.red.400',
    destructiveForeground: 'field.panel',
    success: 'field.green.500',
    successForeground: 'field.ink',
    warning: 'field.yellow.500',
    // lines & focus
    border: 'field.line',
    input: 'field.line',
    ring: 'field.cyan.400',
    // data visualization
    'chart.1': 'field.yellow.400',
    'chart.2': 'field.cyan.400',
    'chart.3': 'field.red.500',
    'chart.4': 'field.green.500',
    'chart.5': 'field.graphite',
  },
}

const components = {
  Button: {
    baseStyle: {
      borderRadius: '2px',
      fontFamily: sansStack,
      fontWeight: 800,
      letterSpacing: '0.02em',
      transitionProperty: 'background, color, border-color',
      transitionDuration: '120ms',
      _focusVisible: {
        boxShadow: '0 0 0 2px var(--chakra-colors-ring)',
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
        px: 2,
        fontSize: '10px',
      },
      sm: {
        h: 8,
        px: 3,
        fontSize: '12px',
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
          borderRadius: '2px',
          borderColor: 'input',
          fontFamily: monoStack,
          _hover: {
            borderColor: 'foreground',
          },
          _focusVisible: {
            borderColor: 'ring',
            boxShadow: '0 0 0 1px var(--chakra-colors-ring)',
          },
        },
      },
    },
    defaultProps: {
      variant: 'outline',
    },
  },
  Select: {
    variants: {
      outline: {
        field: {
          bg: 'card',
          borderRadius: '2px',
          borderColor: 'input',
          fontFamily: monoStack,
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
        fontWeight: 800,
      },
    },
  },
  Menu: {
    baseStyle: {
      list: {
        borderRadius: '2px',
        bg: 'popover',
        p: 1,
        boxShadow: '6px 6px 0 rgba(8, 11, 13, 0.18)',
      },
      item: {
        borderRadius: '1px',
        fontWeight: 800,
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
      fontWeight: 800,
      borderRadius: '2px',
      _disabled: {
        pointerEvents: 'none',
      },
    },
  },
}

const theme = extendTheme({
  config,
  colors,
  semanticTokens,
  fonts: {
    heading: sansStack,
    body: sansStack,
    mono: monoStack,
    glyph: glyphStack,
  },
  radii: {
    none: '0',
    sm: '2px',
    md: '3px',
    lg: '4px',
    xl: '4px',
  },
  components,
  styles: {
    global: {
      ':root': {
        '--field-plus-pattern': plusMarkerPattern,
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
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      },
      canvas: {
        touchAction: 'none',
      },
      '::selection': {
        bg: 'primary',
        color: 'primaryForeground',
      },
    },
  },
})

export default theme
