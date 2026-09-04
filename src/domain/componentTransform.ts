import type { GlyphComponentRef } from '@/domain/types'

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

const isFiniteMatrix = (
  matrix: ComponentMatrix | undefined
): matrix is ComponentMatrix =>
  Boolean(matrix) &&
  Number.isFinite(matrix?.a) &&
  Number.isFinite(matrix?.b) &&
  Number.isFinite(matrix?.c) &&
  Number.isFinite(matrix?.d) &&
  Number.isFinite(matrix?.e) &&
  Number.isFinite(matrix?.f)

// Compose a component ref's legacy transform fields into a single affine matrix:
// translate(x, y) · rotate(rotation) · [[scaleX, xyScale], [yxScale, scaleY]].
// With rotation 0 this is the raw 2x2 matrix, so UFO/Glyphs round-trips are
// exact; rotation (currently always 0 from import) folds into the matrix so
// formats without a rotation field still export correctly.
export const composeComponentMatrix = (
  ref: Pick<
    GlyphComponentRef,
    'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'xyScale' | 'yxScale'
  >
): ComponentMatrix => {
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

export const getComponentMatrix = (ref: GlyphComponentRef): ComponentMatrix =>
  isFiniteMatrix(ref.transform) ? ref.transform : composeComponentMatrix(ref)

export const componentMatrixToRefFields = (matrix: ComponentMatrix) => ({
  x: matrix.e,
  y: matrix.f,
  scaleX: matrix.a,
  xyScale: matrix.b,
  yxScale: matrix.c,
  scaleY: matrix.d,
  rotation: 0,
})

export const withComponentMatrix = (
  ref: Omit<GlyphComponentRef, 'transform'> & {
    transform?: ComponentMatrix
  }
): GlyphComponentRef => {
  const transform = isFiniteMatrix(ref.transform)
    ? ref.transform
    : composeComponentMatrix(ref)
  return {
    ...ref,
    ...componentMatrixToRefFields(transform),
    transform,
  }
}

export const translateComponentRef = (
  ref: GlyphComponentRef,
  deltaX: number,
  deltaY = 0
) => {
  const matrix = getComponentMatrix(ref)
  const transform = {
    ...matrix,
    e: Math.round(matrix.e + deltaX),
    f: Math.round(matrix.f + deltaY),
  }
  Object.assign(ref, {
    ...componentMatrixToRefFields(transform),
    transform,
  })
}

export const isIdentityComponentMatrix = (matrix: ComponentMatrix) =>
  matrix.a === 1 &&
  matrix.b === 0 &&
  matrix.c === 0 &&
  matrix.d === 1 &&
  matrix.e === 0 &&
  matrix.f === 0
