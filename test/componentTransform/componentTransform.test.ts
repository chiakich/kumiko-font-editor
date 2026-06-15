import { describe, expect, it } from 'vitest'
import {
  getComponentMatrix,
  isIdentityComponentMatrix,
} from 'src/lib/componentTransform'
import type { GlyphComponentRef } from 'src/store/types'

const ref = (overrides: Partial<GlyphComponentRef>): GlyphComponentRef =>
  ({
    id: 'c',
    glyphId: 'base',
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    ...overrides,
  }) as GlyphComponentRef

const close = (matrix: ReturnType<typeof getComponentMatrix>) => ({
  a: Number(matrix.a.toFixed(10)),
  b: Number(matrix.b.toFixed(10)),
  c: Number(matrix.c.toFixed(10)),
  d: Number(matrix.d.toFixed(10)),
  e: matrix.e,
  f: matrix.f,
})

describe('getComponentMatrix', () => {
  it('is identity for an untransformed ref', () => {
    const matrix = getComponentMatrix(ref({}))
    expect(matrix).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    expect(isIdentityComponentMatrix(matrix)).toBe(true)
  })

  it('maps scale and offset directly with rotation 0', () => {
    const matrix = getComponentMatrix(
      ref({ scaleX: 2, scaleY: 3, x: 10, y: -5 })
    )
    expect(matrix).toEqual({ a: 2, b: 0, c: 0, d: 3, e: 10, f: -5 })
  })

  it('passes the raw 2x2 matrix through when rotation is 0 (UFO round-trip)', () => {
    const matrix = getComponentMatrix(
      ref({ scaleX: 1, scaleY: 1, xyScale: 0.25, yxScale: -0.5 })
    )
    // a=scaleX, b=xyScale, c=yxScale, d=scaleY — exactly the UFO matrix.
    expect(matrix).toMatchObject({ a: 1, b: 0.25, c: -0.5, d: 1 })
  })

  it('produces a rotation matrix for a 90 degree rotation', () => {
    expect(close(getComponentMatrix(ref({ rotation: 90 })))).toEqual({
      a: 0,
      b: 1,
      c: -1,
      d: 0,
      e: 0,
      f: 0,
    })
  })

  it('composes rotation with scale', () => {
    expect(close(getComponentMatrix(ref({ rotation: 90, scaleX: 2 })))).toEqual(
      { a: 0, b: 2, c: -1, d: 0, e: 0, f: 0 }
    )
  })
})
