// Minimal ambient declaration for bezier-js (the package ships no types).
// Only the surface used by the ported modules is declared.
declare module 'bezier-js' {
  export interface Point {
    x: number
    y: number
    z?: number
  }

  export class Bezier {
    constructor(...coords: Array<number | Point>)
    points: Point[]
    get(t: number): Point
    derivative(t: number): Point
    dderivative(t: number): Point
    project(point: Point): Point & { t?: number; d?: number }
    length(): number
    split(t1: number, t2?: number): Bezier
    lineIntersects(line: { p1: Point; p2: Point }): number[]
  }
}
