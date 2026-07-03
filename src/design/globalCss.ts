const plusMarkerPattern =
  "url(\"data:image/svg+xml,%3Csvg width='26' height='26' viewBox='0 0 26 26' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13 8.5V17.5M8.5 13H17.5' stroke='%23080B0D' stroke-opacity='0.18' stroke-width='1'/%3E%3C/svg%3E\")"
// dark-mode variant of the blueprint grid — light strokes on the near-black bg
const plusMarkerPatternDark =
  "url(\"data:image/svg+xml,%3Csvg width='26' height='26' viewBox='0 0 26 26' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M13 8.5V17.5M8.5 13H17.5' stroke='%23DFE2E5' stroke-opacity='0.10' stroke-width='1'/%3E%3C/svg%3E\")"

export const globalCss = {
  ':root': {
    '--field-plus-pattern': plusMarkerPattern,
    // interaction overlays layered over a control's base bg (astryx model):
    // a translucent tint that darkens on hover / press without changing hue
    '--overlay-hover': 'rgba(8, 11, 13, 0.05)',
    '--overlay-pressed': 'rgba(8, 11, 13, 0.1)',
    colorScheme: 'light',
  },
  '.dark': {
    '--field-plus-pattern': plusMarkerPatternDark,
    '--overlay-hover': 'rgba(255, 255, 255, 0.06)',
    '--overlay-pressed': 'rgba(255, 255, 255, 0.12)',
    colorScheme: 'dark',
  },
  '*': {
    boxSizing: 'border-box',
    // render every rounded corner as a squircle (superellipse)
    cornerShape: 'squircle',
  },
  // opt-out: keep true round corners on pill/circle shapes (squircle distorts them)
  '.corner-round': {
    cornerShape: 'round',
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
}
