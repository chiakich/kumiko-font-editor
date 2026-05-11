import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import {
  createHarfBuzzRuntimeStatus,
  getHarfBuzzRuntimeCapabilities,
  resolveHarfBuzzWasmLocation,
  shapeTextWithHarfBuzz,
} from 'src/lib/openTypeFeatures'

describe('HarfBuzz shaping runtime', () => {
  it('reports available runtime capabilities', () => {
    expect(getHarfBuzzRuntimeCapabilities()).toEqual([
      expect.objectContaining({
        packageName: 'harfbuzzjs',
        status: 'available',
      }),
    ])

    expect(createHarfBuzzRuntimeStatus()).toMatchObject({
      backend: 'harfbuzzjs',
      canShape: true,
      state: 'ready',
    })
  })

  it('resolves Vite node_modules wasm URLs for Node-based tests', () => {
    expect(
      resolveHarfBuzzWasmLocation('/node_modules/harfbuzzjs/hb.wasm')
    ).toBe(`${process.cwd()}/node_modules/harfbuzzjs/hb.wasm`)
    expect(resolveHarfBuzzWasmLocation('/assets/hb.wasm')).toBe(
      '/assets/hb.wasm'
    )
  })

  it('shapes text with HarfBuzz WASM', async () => {
    const fontBuffer = await readFile(
      'node_modules/harfbuzzjs/test/fonts/noto/NotoSans-Regular.ttf'
    )

    const result = await shapeTextWithHarfBuzz(
      fontBuffer.buffer.slice(
        fontBuffer.byteOffset,
        fontBuffer.byteOffset + fontBuffer.byteLength
      ),
      'fi',
      { features: ['liga=1', 'kern=1'] }
    )

    expect(result.ok).toBe(true)
    expect(result.glyphs.length).toBeGreaterThan(0)
    expect(result.runtimeStatus).toMatchObject({
      backend: 'harfbuzzjs',
      canShape: true,
      state: 'ready',
    })
    expect(result.glyphs[0]).toEqual(
      expect.objectContaining({
        cluster: expect.any(Number),
        glyphId: expect.any(Number),
        xAdvance: expect.any(Number),
      })
    )
  })

  it('returns a structured failure for empty font buffers', async () => {
    const result = await shapeTextWithHarfBuzz(new ArrayBuffer(0), 'abc')

    expect(result).toEqual({
      glyphs: [],
      message: 'Cannot shape text without a font buffer.',
      ok: false,
      runtimeStatus: {
        backend: 'harfbuzzjs',
        canShape: false,
        message: 'HarfBuzz WASM shaping runtime is not available.',
        state: 'not-configured',
      },
    })
  })
})
