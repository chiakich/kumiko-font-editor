import type { PathHitInfo } from '@/sceneView/types'

export type HitTestResult =
  | { type: 'point' | 'handle'; pointIndex: number; selection: Set<string> }
  | {
      type: 'line-segment' | 'curve-segment'
      pathHit: PathHitInfo
      selection: Set<string>
    }
  | { type: 'contour-interior'; contourIndex: number; selection: Set<string> }
  | { type: 'empty'; selection: Set<string> }
