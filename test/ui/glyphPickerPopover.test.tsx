// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// paper.js needs a canvas 2D context at import time; happy-dom has none.
vi.mock('paper', () => ({ default: {}, paper: {} }))

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlyphPickerPopover } from '@/features/common/openTypeFeatures/components/GlyphPickerPopover'
import type { FontData, GlyphData } from '@/domain'
import { useStore } from '@/store'
import { renderWithProviders } from './renderWithProviders'

// A glyph with a real layer, so makeEditableGlyphCopy can copy it.
const layeredGlyph = (name: string, unicode?: string): GlyphData => ({
  id: name,
  name,
  paths: [],
  components: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width: 500 },
  unicodes: unicode ? [unicode] : [],
  activeLayerId: 'public.default',
  layerOrder: ['public.default'],
  layers: {
    'public.default': {
      id: 'public.default',
      name: 'public.default',
      type: 'master',
      paths: [],
      componentRefs: [],
      anchors: [],
      guidelines: [],
      metrics: { lsb: 0, rsb: 0, width: 500 },
    },
  },
})

const fontDataWith = (glyphs: GlyphData[]): FontData => ({
  glyphs: Object.fromEntries(glyphs.map((glyph) => [glyph.id, glyph])),
  glyphOrder: glyphs.map((glyph) => glyph.id),
  unitsPerEm: 1000,
})

describe('GlyphPickerPopover create-variant flow', () => {
  beforeEach(() => {
    useStore.setState({ fontData: fontDataWith([layeredGlyph('a', '0061')]) })
  })

  it('creates the variant glyph and picks it', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    renderWithProviders(
      <GlyphPickerPopover
        fontData={useStore.getState().fontData!}
        isOpen
        initialQuery="a"
        onClose={vi.fn()}
        onPick={onPick}
      />
    )
    await user.type(screen.getByLabelText('變體後綴'), 'vert')
    await user.click(screen.getByRole('button', { name: '建立變體' }))
    expect(useStore.getState().fontData?.glyphs['a.vert']).toBeTruthy()
    expect(onPick).toHaveBeenCalledWith('a.vert')
  })

  it('never picks a name whose glyph could not be created', async () => {
    // No layers: the store's copy action refuses silently.
    useStore.setState({
      fontData: fontDataWith([
        {
          ...layeredGlyph('a', '0061'),
          layers: undefined,
          layerOrder: undefined,
        },
      ]),
    })
    const user = userEvent.setup()
    const onPick = vi.fn()
    renderWithProviders(
      <GlyphPickerPopover
        fontData={useStore.getState().fontData!}
        isOpen
        initialQuery="a"
        onClose={vi.fn()}
        onPick={onPick}
      />
    )
    await user.type(screen.getByLabelText('變體後綴'), 'vert')
    await user.click(screen.getByRole('button', { name: '建立變體' }))
    expect(useStore.getState().fontData?.glyphs['a.vert']).toBeUndefined()
    expect(onPick).not.toHaveBeenCalled()
  })
})
