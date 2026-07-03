import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

import { globalCss } from './globalCss'
import { durations, easings } from './motion'
import { palette } from './palette'
import { radii } from './radii'
import { recipes, slotRecipes } from './recipes'
import { semanticColors } from './semantic'
import { shadows } from './shadows'
import { fonts, letterSpacings, lineHeights, textStyles } from './typography'
import { toColorSemanticTokenTree, toTokenTree } from './util'

const customConfig = defineConfig({
  globalCss,
  theme: {
    tokens: {
      // top-level ramps override Chakra's same-named default palettes
      colors: toTokenTree(palette),
      shadows: toTokenTree(shadows),
      durations: toTokenTree(durations),
      easings: toTokenTree(easings),
      lineHeights: toTokenTree(lineHeights),
      letterSpacings: toTokenTree(letterSpacings),
      fonts,
      radii: toTokenTree(radii),
    },
    semanticTokens: {
      colors: toColorSemanticTokenTree(semanticColors),
    },
    textStyles,
    recipes,
    slotRecipes,
  },
})

const system = createSystem(defaultConfig, customConfig)

export default system
