export const monoStack =
  '"IBM Plex Mono", "SFMono-Regular", "Menlo", "Consolas", monospace'
export const sansStack =
  '"SF Pro Display", "SF Pro Text","Noto Sans TC", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", "Noto Sans HK", "Segoe UI", system-ui, sans-serif'
export const glyphStack =
  '"PingFang TC", "Noto Sans TC", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR", "Noto Sans HK", "Noto Sans Symbols 2", "PUAExt", "Segoe UI Symbol", sans-serif'

export const fonts = {
  heading: { value: sansStack },
  body: { value: sansStack },
  mono: { value: monoStack },
  glyph: { value: glyphStack },
}

// role-tuned line-heights (行距) — tight for headings, relaxed for small copy
export const lineHeights = {
  none: '1',
  tight: '1.25',
  snug: '1.35',
  normal: '1.5',
  relaxed: '1.65',
}

export const letterSpacings = {
  tight: '-0.01em',
  normal: '0',
  wide: '0.02em',
  // tiny all-caps labels breathe better with extra tracking
  caps: '0.06em',
}

// opt-in named type styles — bundle size + weight + 行距 + tracking so text
// picks up consistent leading without per-usage tuning (usage: textStyle="body")
export const textStyles = {
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
