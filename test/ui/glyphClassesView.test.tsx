// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

// paper.js needs a canvas 2D context at import time; happy-dom has none.
vi.mock('paper', () => ({ default: {}, paper: {} }))
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlyphClassesView } from 'src/features/featureWorkspace/GlyphClassesView'
import { createEmptyOpenTypeFeaturesState } from 'src/lib/openTypeFeatures/defaults'
import { createGlyphClass } from 'src/features/common/projectControl/fontSettings/features/utils/classAuthoring'
import { makeFontData } from '../openTypeFeatures/openTypeFeatureTestHelpers'
import { renderWithProviders } from './renderWithProviders'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures'

describe('GlyphClassesView', () => {
  it('creates a class through the new-class input', async () => {
    const user = userEvent.setup()
    const onStateChange = vi.fn()
    renderWithProviders(
      <GlyphClassesView
        fontData={makeFontData(['a', 'b'])}
        state={createEmptyOpenTypeFeaturesState()}
        onStateChange={onStateChange}
      />
    )
    await user.type(screen.getByLabelText('新增類別'), 'kana{Enter}')
    expect(onStateChange).toHaveBeenCalledTimes(1)
    const next = onStateChange.mock.calls[0][0] as OpenTypeFeaturesState
    expect(next.glyphClasses).toHaveLength(1)
    expect(next.glyphClasses[0].name).toBe('@kana')
  })

  it('disables deletion while rules reference the class', () => {
    const created = createGlyphClass(
      createEmptyOpenTypeFeaturesState(),
      'kana'
    )!
    const state: OpenTypeFeaturesState = {
      ...created.state,
      lookups: [
        {
          id: 'l1',
          name: 'l1',
          table: 'GSUB',
          lookupType: 'singleSubst',
          lookupFlag: {},
          editable: true,
          origin: 'manual',
          rules: [
            {
              id: 'r1',
              kind: 'singleSubstitution',
              target: { kind: 'class', classId: created.classId },
              replacement: 'b',
              meta: { origin: 'manual' },
            },
          ],
        },
      ],
    }
    renderWithProviders(
      <GlyphClassesView
        fontData={makeFontData(['a', 'b'])}
        state={state}
        onStateChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: '刪除' })).toBeDisabled()
  })
})
