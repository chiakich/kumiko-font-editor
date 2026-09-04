// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

// paper.js needs a canvas 2D context at import time; happy-dom has none.
vi.mock('paper', () => ({ default: {}, paper: {} }))

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeatureRuleEditor } from '@/features/common/openTypeFeatures/components/FeatureRuleEditor'
import { createEmptyOpenTypeFeaturesState } from '@/lib/openTypeFeatures/defaults'
import {
  addRuleToFeature,
  createFeature,
} from '@/features/common/openTypeFeatures/utils/featureAuthoring'
import { renderWithProviders } from './renderWithProviders'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures'

const stateWithFeature = () => {
  const created = createFeature(createEmptyOpenTypeFeaturesState(), 'ss02')!
  return { state: created.state, feature: created.state.features[0] }
}

describe('FeatureRuleEditor', () => {
  it('creates a substitution rule from the add-rule button', async () => {
    const user = userEvent.setup()
    const { state, feature } = stateWithFeature()
    const onStateChange = vi.fn()
    renderWithProviders(
      <FeatureRuleEditor
        state={state}
        lookupIds={[]}
        feature={feature}
        onStateChange={onStateChange}
      />
    )
    await user.click(screen.getByRole('button', { name: '＋ 替換規則' }))
    const next = onStateChange.mock.calls[0][0] as OpenTypeFeaturesState
    expect(next.lookups).toHaveLength(1)
    expect(next.lookups[0].rules[0].kind).toBe('singleSubstitution')
  })

  it('deletes a rule from its row', async () => {
    const user = userEvent.setup()
    const base = stateWithFeature()
    const added = addRuleToFeature(
      base.state,
      base.feature,
      'singleSubstitution'
    )
    const feature = added.state.features[0]
    const lookupIds = feature.entries.flatMap((entry) => entry.lookupIds)
    const onStateChange = vi.fn()
    renderWithProviders(
      <FeatureRuleEditor
        state={added.state}
        lookupIds={lookupIds}
        feature={feature}
        onStateChange={onStateChange}
      />
    )
    await user.click(screen.getByRole('button', { name: '刪除規則' }))
    const next = onStateChange.mock.calls[0][0] as OpenTypeFeaturesState
    expect(next.lookups[0].rules).toHaveLength(0)
  })
})
