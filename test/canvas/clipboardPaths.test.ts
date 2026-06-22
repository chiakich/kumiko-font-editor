import { describe, expect, it } from 'vitest'
import {
  parseClipboardPathsText,
  serializeClipboardPathsAsSvg,
  type ClipboardPathPayload,
} from 'src/features/editor/canvas/utils/clipboardPaths'

describe('clipboard path SVG export', () => {
  it('serializes font-coordinate paths as upright SVG paths', () => {
    const payload: ClipboardPathPayload = {
      type: 'kumiko-paths',
      paths: [
        {
          closed: true,
          nodes: [
            { x: 0, y: 0, kind: 'oncurve', segmentType: 'line' },
            { x: 50, y: 100, kind: 'offcurve' },
            { x: 150, y: 100, kind: 'offcurve' },
            { x: 200, y: 0, kind: 'oncurve', segmentType: 'cubic' },
          ],
        },
      ],
    }

    const svg = serializeClipboardPathsAsSvg(payload)

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('viewBox="0 0 200 100"')
    expect(svg).toContain('M 0 100 C 50 0 150 0 200 100 Z')
    expect(parseClipboardPathsText(svg ?? '')?.paths[0]).toMatchObject({
      closed: true,
      nodes: [
        { x: 0, y: 0, kind: 'oncurve' },
        { x: 50, y: 100, kind: 'offcurve' },
        { x: 150, y: 100, kind: 'offcurve' },
        { x: 200, y: 0, kind: 'oncurve', segmentType: 'cubic' },
      ],
    })
  })

  it('returns null when there are no serializable paths', () => {
    expect(
      serializeClipboardPathsAsSvg({ type: 'kumiko-paths', paths: [] })
    ).toBeNull()
  })
})
