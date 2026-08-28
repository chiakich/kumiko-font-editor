import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { traceTextShaping } from 'src/lib/openTypeFeatures/traceShaping'

const FIXTURE = new URL(
  '../../test_glyphs/FiraCode-Regular.otf',
  import.meta.url
)

const FIXTURE_PATH = fileURLToPath(FIXTURE)
// The fixture font is not in version control; skip when it is absent.
const itWithFiraCode = existsSync(FIXTURE_PATH) ? it : it.skip

const loadFont = async () => {
  const buffer = await readFile(FIXTURE_PATH)
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer
}

describe('traceTextShaping', () => {
  itWithFiraCode(
    'attributes ligature substitutions to their feature and clusters',
    async () => {
      const font = await loadFont()
      const result = await traceTextShaping(font, '->')
      expect(result.ok).toBe(true)
      const calt = result.steps.filter((step) => step.featureTag === 'calt')
      expect(calt.length).toBeGreaterThan(0)
      // The arrow ligature touches both source clusters.
      const touching = calt.filter(
        (step) => step.clusters.includes(0) || step.clusters.includes(1)
      )
      expect(touching.length).toBeGreaterThan(0)
      expect(
        touching.some(
          (step) => step.afterNames.join(' ') !== step.beforeNames.join(' ')
        )
      ).toBe(true)
    }
  )

  itWithFiraCode('returns no steps for text nothing applies to', async () => {
    const font = await loadFont()
    const result = await traceTextShaping(font, 'no')
    expect(result.ok).toBe(true)
    expect(result.steps.filter((step) => step.phase === 'GSUB')).toEqual([])
  })
})
