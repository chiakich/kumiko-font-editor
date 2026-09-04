import { describe, expect, it } from 'vitest'
import { buildPairSpacingLayout } from '@/features/editor/rightPanel/kerning/pairSpacingLayout'
import type { FontData, GlyphData, GlyphLayerData } from '@/domain'

const makeLayer = (id: string, width: number): GlyphLayerData => ({
  id,
  name: id,
  type: 'master',
  associatedMasterId: id,
  paths: [],
  componentRefs: [],
  anchors: [],
  guidelines: [],
  metrics: { lsb: 0, rsb: 0, width },
})

const makeGlyph = (
  id: string,
  widthByLayer: Record<string, number>
): GlyphData => {
  const layerIds = Object.keys(widthByLayer)
  return {
    id,
    name: id,
    activeLayerId: layerIds[0],
    layerOrder: layerIds,
    layers: Object.fromEntries(
      layerIds.map((layerId) => [
        layerId,
        makeLayer(layerId, widthByLayer[layerId]),
      ])
    ),
  }
}

const makeFont = (glyphs: GlyphData[]): FontData => ({
  glyphs: Object.fromEntries(glyphs.map((glyph) => [glyph.id, glyph])),
  glyphOrder: glyphs.map((glyph) => glyph.id),
  unitsPerEm: 1000,
})

const font = makeFont([
  makeGlyph('A', { 'public.default': 600, bold: 700 }),
  makeGlyph('V', { 'public.default': 550, bold: 640 }),
])

const offsets = (layout: ReturnType<typeof buildPairSpacingLayout>) =>
  Object.fromEntries(
    (layout?.glyphs ?? []).map((entry) => [entry.key, entry.offsetX])
  )

const viewBoxWidth = (layout: ReturnType<typeof buildPairSpacingLayout>) =>
  Number(layout!.viewBox.split(' ')[2])

describe('buildPairSpacingLayout', () => {
  it('places the right glyph one advance plus the kerning value along', () => {
    const layout = buildPairSpacingLayout(font, 'A', 'V', null, -80)
    expect(offsets(layout)).toEqual({
      left: 0,
      'right-unkerned': 600,
      right: 520,
    })
  })

  it('tightens for negative and loosens for positive kerning', () => {
    const tight = buildPairSpacingLayout(font, 'A', 'V', null, -80)
    const loose = buildPairSpacingLayout(font, 'A', 'V', null, 80)
    const neutral = buildPairSpacingLayout(font, 'A', 'V', null, 0)

    const rightOffset = (layout: ReturnType<typeof buildPairSpacingLayout>) =>
      layout!.glyphs.find((entry) => entry.key === 'right')!.offsetX

    expect(rightOffset(tight)).toBeLessThan(rightOffset(neutral))
    expect(rightOffset(loose)).toBeGreaterThan(rightOffset(neutral))
  })

  it('omits the un-kerned ghost when there is nothing to compare', () => {
    const layout = buildPairSpacingLayout(font, 'A', 'V', null, 0)
    expect(layout!.glyphs.map((entry) => entry.key)).toEqual(['left', 'right'])
    expect(layout!.glyphs.every((entry) => !entry.isGhost)).toBe(true)
  })

  it('marks only the un-kerned position as a ghost', () => {
    const layout = buildPairSpacingLayout(font, 'A', 'V', null, -80)
    expect(
      layout!.glyphs.filter((entry) => entry.isGhost).map((entry) => entry.key)
    ).toEqual(['right-unkerned'])
  })

  it('keeps both the kerned and un-kerned extents inside the frame', () => {
    // A tight pair still has to show the ghost sitting further right.
    const tight = buildPairSpacingLayout(font, 'A', 'V', null, -200)
    const padding = -Number(tight!.viewBox.split(' ')[0])
    expect(viewBoxWidth(tight)).toBeGreaterThanOrEqual(
      600 + 550 + padding * 2 - 0.001
    )

    const loose = buildPairSpacingLayout(font, 'A', 'V', null, 200)
    expect(viewBoxWidth(loose)).toBeGreaterThanOrEqual(
      600 + 200 + 550 + padding * 2 - 0.001
    )
  })

  it('follows the active master advance', () => {
    const layout = buildPairSpacingLayout(font, 'A', 'V', 'bold', -80)
    expect(offsets(layout)).toEqual({
      left: 0,
      'right-unkerned': 700,
      right: 620,
    })
  })

  it('widens the frame leftwards when kerning pulls past the origin', () => {
    // advance 600 with padding 80: anything under -680 used to fall outside
    // the viewBox and get clipped by the SVG's overflow: hidden.
    const layout = buildPairSpacingLayout(font, 'A', 'V', null, -800)
    const [originX, , width] = layout!.viewBox.split(' ').map(Number)
    const rightOffset = layout!.glyphs.find(
      (entry) => entry.key === 'right'
    )!.offsetX

    expect(rightOffset).toBe(-200)
    expect(originX).toBeLessThanOrEqual(rightOffset)
    // The ghost still sits at the un-kerned position, so the frame spans both.
    expect(originX + width).toBeGreaterThanOrEqual(600 + 550)
  })

  it('returns null when either glyph is missing', () => {
    expect(buildPairSpacingLayout(font, 'A', 'missing', null, 0)).toBeNull()
    expect(buildPairSpacingLayout(font, 'missing', 'V', null, 0)).toBeNull()
  })
})
