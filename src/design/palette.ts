// Primitive color ramps — the single source of raw hex. These are emitted at
// top level (gray/red/yellow/...) which REPLACES Chakra's same-named default
// palettes: `colorPalette="red"`, `red.500`, and Chakra's own bg/fg/border
// semantic tokens all resolve through these, so the whole app re-sources here.
//
// Brand hues (yellow/cyan/red/green) keep the vivid signature values at their
// used shades; gray is neutral (de-greened, astryx tone); the remaining status
// hues (orange/blue/teal/purple/pink) are anchored on astryx's status colors.

export const palette = {
  white: '#FFFFFF',
  black: '#080B0D',

  // neutral gray — astryx-flavored, no green cast; drives surfaces/text/borders
  gray: {
    50: '#F6F6F7',
    100: '#ECEDEE',
    200: '#DFE0E2',
    300: '#C7C9CC',
    400: '#A0A3A8',
    500: '#767A80',
    600: '#565A60',
    700: '#3E4145',
    800: '#2D2E31',
    900: '#242528',
    950: '#17181A',
  },

  // brand yellow — primary/warning; 200–600 are the established brand values
  yellow: {
    50: '#FEFEE7',
    100: '#FDFCC0',
    200: '#FFFD8F',
    300: '#FFFB42',
    400: '#F7EB40',
    500: '#E5E000',
    600: '#B3AF00',
    700: '#898600',
    800: '#625F00',
    900: '#423F00',
    950: '#242200',
  },

  // brand cyan — ring/accents
  cyan: {
    50: '#E4FBFF',
    100: '#C0F7FF',
    200: '#93F1FF',
    300: '#6FF4FF',
    400: '#25DAF2',
    500: '#00AFC9',
    600: '#008EA4',
    700: '#016B7C',
    800: '#014E5A',
    900: '#013640',
    950: '#012026',
  },

  // brand red — destructive; 400/500 keep the vivid brand values
  red: {
    50: '#FDECEA',
    100: '#FCCCC5',
    200: '#FAA69B',
    300: '#F5786A',
    400: '#FF604F',
    500: '#E83A2B',
    600: '#C22A1D',
    700: '#8F1D13',
    800: '#6B160E',
    900: '#470E09',
    950: '#2B0705',
  },

  // brand green — success; 400/500 keep the vivid brand values
  green: {
    50: '#F2FDE6',
    100: '#E0FBC5',
    200: '#C8FF95',
    300: '#B4FF74',
    400: '#A8FF5C',
    500: '#6DD526',
    600: '#57AA1E',
    700: '#417F16',
    800: '#305D10',
    900: '#1F3C0A',
    950: '#112306',
  },

  // astryx-anchored status hues (brand does not define these)
  orange: {
    50: '#FCF0E4',
    100: '#F8D5B0',
    200: '#F4B472',
    300: '#F28E2E',
    400: '#EB6E00',
    500: '#C85E00',
    600: '#B34A01',
    700: '#6B2203',
    800: '#521A02',
    900: '#371102',
    950: '#210A01',
  },
  blue: {
    50: '#E7F1FE',
    100: '#BDD9FD',
    200: '#8CBCFB',
    300: '#4E97F8',
    400: '#2694FE',
    500: '#0064E0',
    600: '#0850B4',
    700: '#042F97',
    800: '#03246F',
    900: '#02184A',
    950: '#010E2B',
  },
  teal: {
    50: '#E3F7F6',
    100: '#B4E9E7',
    200: '#7FD8D5',
    300: '#4CCFC8',
    400: '#14B3AD',
    500: '#08A3A3',
    600: '#08767D',
    700: '#0A5259',
    800: '#083943',
    900: '#052A31',
    950: '#02181C',
  },
  purple: {
    50: '#F0EEFF',
    100: '#D6CFFF',
    200: '#B9AEFF',
    300: '#9081FF',
    400: '#7340FE',
    500: '#5B22E8',
    600: '#4A17BE',
    700: '#3E0697',
    800: '#2F0572',
    900: '#1F034A',
    950: '#12022B',
  },
  pink: {
    50: '#FCEAF6',
    100: '#F8C6E9',
    200: '#F49BD9',
    300: '#F351C0',
    400: '#E22FA8',
    500: '#C02294',
    600: '#9A1A76',
    700: '#650053',
    800: '#4E0040',
    900: '#34002B',
    950: '#1F0019',
  },

  // translucent overlays — used on the dark editing-canvas chrome
  whiteAlpha: {
    50: 'rgba(255, 255, 255, 0.04)',
    100: 'rgba(255, 255, 255, 0.06)',
    200: 'rgba(255, 255, 255, 0.08)',
    300: 'rgba(255, 255, 255, 0.16)',
    400: 'rgba(255, 255, 255, 0.24)',
    500: 'rgba(255, 255, 255, 0.36)',
    600: 'rgba(255, 255, 255, 0.48)',
    700: 'rgba(255, 255, 255, 0.64)',
    800: 'rgba(255, 255, 255, 0.80)',
    900: 'rgba(255, 255, 255, 0.92)',
    950: 'rgba(255, 255, 255, 0.95)',
  },
  blackAlpha: {
    50: 'rgba(8, 11, 13, 0.04)',
    100: 'rgba(8, 11, 13, 0.06)',
    200: 'rgba(8, 11, 13, 0.08)',
    300: 'rgba(8, 11, 13, 0.16)',
    400: 'rgba(8, 11, 13, 0.24)',
    500: 'rgba(8, 11, 13, 0.36)',
    600: 'rgba(8, 11, 13, 0.48)',
    700: 'rgba(8, 11, 13, 0.64)',
    800: 'rgba(8, 11, 13, 0.80)',
    900: 'rgba(8, 11, 13, 0.92)',
    950: 'rgba(8, 11, 13, 0.95)',
  },
}
