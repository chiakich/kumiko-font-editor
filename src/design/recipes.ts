import { monoStack, sansStack } from './typography'

// astryx interaction model: keep the variant's own bg/color, layer a translucent
// overlay on top via a background-image gradient. Re-declaring bg/color here is
// required — Chakra's default solid recipe otherwise leaks `colorPalette.solid/90`
// into _hover and greys the button. Hover only on hover-capable devices; press
// adds a stronger overlay + a slight scale.
const hoverState = (bg: string, color: string) => ({
  bg,
  color,
  '@media (hover: hover)': {
    backgroundImage:
      'linear-gradient(var(--overlay-hover), var(--overlay-hover))',
  },
})
const activeState = (bg: string, color: string) => ({
  bg,
  color,
  backgroundImage:
    'linear-gradient(var(--overlay-pressed), var(--overlay-pressed))',
  transform: 'scale(0.98)',
})

const components = {
  Button: {
    baseStyle: {
      borderRadius: 'control',
      fontFamily: sansStack,
      fontWeight: 700,
      lineHeight: '1',
      letterSpacing: '0.02em',
      backgroundImage: 'none',
      transitionProperty:
        'background-image, background-color, color, box-shadow, transform',
      transitionDuration: 'fast',
      transitionTimingFunction: 'standard',
      _focusVisible: {
        outline: 'none',
        boxShadow:
          '0 0 0 2px var(--chakra-colors-background), 0 0 0 4px var(--chakra-colors-ring)',
      },
      _disabled: {
        opacity: 0.5,
        cursor: 'not-allowed',
        backgroundImage: 'none',
        transform: 'none',
      },
    },
    variants: {
      solid: {
        bg: 'primary',
        color: 'primaryForeground',
        border: '1px solid transparent',
        boxShadow: 'none',
        _hover: hoverState('primary', 'primaryForeground'),
        _active: activeState('primary', 'primaryForeground'),
      },
      outline: {
        bg: 'secondary',
        color: 'secondaryForeground',
        border: '1px solid transparent',
        _hover: hoverState('secondary', 'secondaryForeground'),
        _active: activeState('secondary', 'secondaryForeground'),
      },
      ghost: {
        bg: 'transparent',
        color: 'foreground',
        _hover: hoverState('transparent', 'foreground'),
        _active: activeState('transparent', 'foreground'),
        _disabled: {
          pointerEvents: 'none',
        },
      },
    },
    // astryx element sizes: sm 28px / md 32px / lg 36px; md is the default.
    // px follows astryx spacing (sm 10 / md 12); xs is a compact icon size.
    sizes: {
      xs: {
        h: 6,
        minW: 6,
        px: 2,
        fontSize: '10px',
      },
      sm: {
        h: 7,
        minW: 7,
        px: 2.5,
        fontSize: '12px',
      },
      md: {
        h: 8,
        minW: 8,
        px: 3,
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
        borderRadius: 'sm',
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
        borderRadius: 'md',
        bg: 'popover',
        p: 1,
        boxShadow: 'med',
      },
      item: {
        borderRadius: 'sm',
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
          fontWeight: 600,
          fontSize: 'xs',
          letterSpacing: 'wide',
          border: 'none',
          px: 3,
          transitionProperty: 'background-color, color, box-shadow',
          transitionDuration: 'fast',
          transitionTimingFunction: 'standard',
          _hover: {
            bg: 'card',
            color: 'foreground',
          },
          _selected: {
            color: 'accentForeground',
            bg: 'accent',
            borderColor: 'transparent',
            boxShadow: 'low',
          },
        },
        tablist: {
          alignItems: 'center',
          bg: 'secondary',
          borderBottom: 'none',
          borderRadius: 'full',
          gap: '2px',
          p: '3px',
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
      borderRadius: 'sm',
      boxShadow: 'med',
      _disabled: {
        pointerEvents: 'none',
      },
    },
  },
}

export const recipes = {
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

export const slotRecipes = {
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
