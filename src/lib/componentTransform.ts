import type { GlyphComponentRef } from 'src/store/types'

// Flat 2D affine matrix in DOMMatrix order: a point (x, y) maps to
// (a*x + c*y + e, b*x + d*y + f).
export interface ComponentMatrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

// Compose a component ref's transform into a single affine matrix:
// translate(x, y) · rotate(rotation) · [[scaleX, xyScale], [yxScale, scaleY]].
// With rotation 0 this is the raw 2x2 matrix, so UFO/Glyphs round-trips are
// exact; rotation (currently always 0 from import) folds into the matrix so
// formats without a rotation field still export correctly.
export const getComponentMatrix = (ref: GlyphComponentRef): ComponentMatrix => {
  const xy = ref.xyScale ?? 0
  const yx = ref.yxScale ?? 0
  const radians = (ref.rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    a: cos * ref.scaleX - sin * xy,
    b: sin * ref.scaleX + cos * xy,
    c: cos * yx - sin * ref.scaleY,
    d: sin * yx + cos * ref.scaleY,
    e: ref.x,
    f: ref.y,
  }
}

export const isIdentityComponentMatrix = (matrix: ComponentMatrix) =>
  matrix.a === 1 &&
  matrix.b === 0 &&
  matrix.c === 0 &&
  matrix.d === 1 &&
  matrix.e === 0 &&
  matrix.f === 0
