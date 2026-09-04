import { describe, expect, it } from 'vitest'
import {
  isFeatureTagEnabled,
  setFeatureTagEnabled,
} from '@/features/common/projectControl/fontSettings/features/utils/featureEnablement'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures'

const state = (partial: Partial<OpenTypeFeaturesState>) =>
  ({
    features: [],
    lookups: [],
    glyphClasses: [],
    ...partial,
  }) as OpenTypeFeaturesState

describe('feature enablement', () => {
  it('toggles the IR feature and its raw snippet together', () => {
    const initial = state({
      features: [
        { id: 'f1', tag: 'vert', isActive: true },
      ] as OpenTypeFeaturesState['features'],
      rawFeatureSnippets: [
        {
          id: 's1',
          kind: 'feature',
          tag: 'vert',
          text: 'feature vert {} vert;',
        },
        { id: 's2', kind: 'prefix', text: '# note' },
      ],
    })

    const disabled = setFeatureTagEnabled(initial, 'vert', false)
    expect(disabled.features[0].isActive).toBe(false)
    expect(disabled.rawFeatureSnippets?.[0].disabled).toBe(true)
    expect(disabled.rawFeatureSnippets?.[1].disabled).toBeUndefined()
    expect(isFeatureTagEnabled(disabled, 'vert')).toBe(false)

    const enabled = setFeatureTagEnabled(disabled, 'vert', true)
    expect(isFeatureTagEnabled(enabled, 'vert')).toBe(true)
  })

  it('reads a snippet-only feature from its disabled flag', () => {
    const snippetOnly = state({
      rawFeatureSnippets: [
        {
          id: 's1',
          kind: 'feature',
          tag: 'salt',
          text: 'feature salt {} salt;',
          disabled: true,
        },
      ],
    })
    expect(isFeatureTagEnabled(snippetOnly, 'salt')).toBe(false)
  })
})
