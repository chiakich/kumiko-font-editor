import { mode } from './util'

// Semantic (role) tokens — shadcn-style names. Mode-aware surfaces/text carry
// literal per-mode values via `mode()`; everything else references a primitive
// ramp by path. Dark values follow astryx's neutral dark-gray ramp: a lifted
// near-black page, clearly-elevated card/panel surfaces, translucent-white
// hairlines. The editing canvas is intentionally NOT driven by these.
export const semanticColors = {
  // surfaces
  background: mode('#F4F5F2', '#1A1B1D'),
  foreground: mode('#0B0F11', '#DFE2E5'),
  card: mode('#FCFCFB', '#242528'),
  cardForeground: 'foreground',
  popover: 'card',
  popoverForeground: 'foreground',

  // brand / interactive — yellow stays yellow in both modes
  primary: 'yellow.400',
  primaryForeground: 'black', // fixed dark ink on yellow
  primaryHover: 'yellow.300',
  primaryActive: 'yellow.500',
  secondary: 'muted',
  secondaryForeground: 'foreground',

  // quiet / supporting
  muted: mode('#E7E9E3', '#2D2E31'), // quiet fills
  mutedForeground: mode('#5F675D', '#AAAFB5'), // secondary text
  haze: mode('#B4B9AF', '#6F747C'), // faint text / placeholder

  // accent = the "inverted" hover chip — dark-on-light flips to light-on-dark
  accent: mode('#0B0F11', '#E4E7EA'),
  accentForeground: mode('#FFFB42', '#0B0F11'),

  // status
  destructive: 'red.500',
  destructiveHover: 'red.400',
  destructiveForeground: 'white', // fixed white on red
  success: 'green.500',
  successForeground: 'black', // fixed dark ink on green
  warning: 'yellow.500',

  // lines & focus
  border: mode('#31383C', '#3A3C41'),
  input: mode('#31383C', '#3A3C41'),
  ring: 'cyan.400',
  // refined control edges — softer than the structural `border`
  controlBorder: mode('rgba(11, 15, 17, 0.14)', 'rgba(242, 244, 246, 0.10)'),
  controlBorderHover: mode(
    'rgba(11, 15, 17, 0.28)',
    'rgba(242, 244, 246, 0.18)'
  ),
  placeholder: 'haze',

  // data visualization
  'chart.1': 'yellow.400',
  'chart.2': 'cyan.400',
  'chart.3': 'red.500',
  'chart.4': 'green.500',
  'chart.5': 'gray.700',

  // Override Chakra's own neutral semantic tokens so its built-in recipes
  // (Dialog/Popover/Menu content/Switch…) render on our surfaces/text in both
  // modes instead of Chakra's default gray-derived values.
  bg: {
    DEFAULT: 'background',
    subtle: 'muted',
    panel: 'card',
  },
  fg: {
    DEFAULT: 'foreground',
    muted: 'mutedForeground',
    subtle: 'haze',
  },
}
