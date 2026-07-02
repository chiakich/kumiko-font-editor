import { describe, it, expect } from 'vitest'
import { serializeDesignspace } from './designspace'
import type { FontAxes } from 'src/store'

const axes: FontAxes = {
  axes: [
    {
      name: 'Weight',
      label: 'Weight',
      tag: 'wght',
      minValue: 400,
      defaultValue: 400,
      maxValue: 900,
    },
  ],
  mappings: [],
}

describe('serializeDesignspace default source marking', () => {
  it('marks a near-default source as default within tolerance', () => {
    const xml = serializeDesignspace(axes, [
      { filename: 'a.otf', name: 'A', location: { Weight: 400.0000004 } },
      { filename: 'b.otf', name: 'B', location: { Weight: 900 } },
    ])
    const copies = xml.match(/<info copy="1"\/>/g) ?? []
    expect(copies.length).toBe(1)
    // The default marker must sit on the near-default source A, not B.
    const aBlock = xml.slice(xml.indexOf('name="A"'), xml.indexOf('name="B"'))
    expect(aBlock).toContain('<info copy="1"/>')
  })

  it('marks only the first source when several share the default location', () => {
    const xml = serializeDesignspace(axes, [
      { filename: 'a.otf', name: 'A', location: { Weight: 400 } },
      { filename: 'b.otf', name: 'B', location: { Weight: 400 } },
    ])
    const copies = xml.match(/<info copy="1"\/>/g) ?? []
    expect(copies.length).toBe(1)
  })
})
