import { describe, expect, it } from 'vitest'
import { listShapingLanguageOptions } from 'src/features/common/projectControl/fontSettings/features/utils/shapingLanguage'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'

const state = (systems: Array<[string, string]>) =>
  ({
    languagesystems: systems.map(([script, language], index) => ({
      id: `ls-${index}`,
      script,
      language,
    })),
  }) as OpenTypeFeaturesState

describe('shaping language options', () => {
  it('maps OT tags to what HarfBuzz understands', () => {
    const options = listShapingLanguageOptions(
      state([
        ['DFLT', 'dflt'],
        ['hani', 'ZHT'],
        ['kana', 'JAN'],
      ])
    )
    expect(options.map((option) => option.label)).toEqual([
      'hani/ZHT',
      'kana/JAN',
    ])
    expect(options[0].hbScript).toBe('Hani')
    expect(options[0].hbLanguage).toBe('zh-TW')
    expect(options[1].hbLanguage).toBe('ja')
  })

  it('falls back to a lowercased tag for unknown languages', () => {
    const options = listShapingLanguageOptions(state([['latn', 'XYZ']]))
    expect(options[0].hbLanguage).toBe('xyz')
  })
})
