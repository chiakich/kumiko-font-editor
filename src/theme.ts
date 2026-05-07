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
      300: '#FFF56A',
      400: '#F7EB40',
      500: '#E8D619',
      600: '#B6A600',
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
        boxShadow: '0 0 0 2px #25DAF2',
      },
      _disabled: {
        opacity: 0.42,
        cursor: 'not-allowed',
        transform: 'none',
      },
    },
    variants: {
      solid: {
        bg: 'field.yellow.400',
        color: 'field.ink',
        border: '1px solid transparent',
        boxShadow: 'none',
        _hover: {
          bg: 'field.ink',
          color: 'field.yellow.300',
          boxShadow: 'none',
          transform: 'none',
          _disabled: {
            bg: 'field.yellow.400',
            color: 'field.ink',
            boxShadow: 'none',
          },
        },
        _active: {
          bg: 'field.yellow.500',
          color: 'field.ink',
          transform: 'none',
          boxShadow: 'none',
        },
      },
      outline: {
        bg: 'field.panelMuted',
        color: 'field.ink',
        border: '1px solid transparent',
        _hover: {
          bg: 'field.yellow.400',
          color: 'field.ink',
          borderColor: 'transparent',
        },
      },
      ghost: {
        color: 'field.ink',
        _hover: {
          bg: 'field.panelMuted',
          color: 'field.ink',
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
          bg: 'field.panel',
          borderRadius: '2px',
          borderColor: 'field.line',
          fontFamily: monoStack,
          _hover: {
            borderColor: 'field.ink',
          },
          _focusVisible: {
            borderColor: 'field.cyan.400',
            boxShadow: '0 0 0 1px #25DAF2',
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
          bg: 'field.panel',
          borderRadius: '2px',
          borderColor: 'field.line',
          fontFamily: monoStack,
          _focusVisible: {
            borderColor: 'field.cyan.400',
            boxShadow: '0 0 0 1px #25DAF2',
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
        bg: 'field.panelMuted',
        color: 'field.ink',
        fontFamily: monoStack,
        fontWeight: 800,
      },
    },
  },
  Menu: {
    baseStyle: {
      list: {
        borderRadius: '2px',
        border: '1px solid',
        borderColor: 'field.line',
        bg: 'field.panel',
        p: 1,
        boxShadow: '6px 6px 0 rgba(8, 11, 13, 0.18)',
      },
      item: {
        borderRadius: '1px',
        fontWeight: 800,
        _hover: {
          bg: 'field.graphite',
          color: 'field.yellow.300',
        },
        _focus: {
          bg: 'field.graphite',
          color: 'field.yellow.300',
        },
      },
    },
  },
  Tabs: {
    variants: {
      enclosed: {
        tab: {
          borderRadius: '2px 2px 0 0',
          borderColor: 'transparent',
          fontWeight: 900,
          _selected: {
            color: 'field.ink',
            bg: 'field.yellow.400',
            borderColor: 'field.line',
          },
        },
      },
    },
  },
}

const theme = extendTheme({
  config,
  colors,
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
        bg: 'field.paper',
        color: 'field.ink',
        backgroundColor: 'field.paper',
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
        bg: 'field.yellow.400',
        color: 'field.ink',
      },
    },
  },
})

export default theme
