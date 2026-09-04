// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// paper.js needs a canvas 2D context at import time; happy-dom has none.
vi.mock('paper', () => ({ default: {}, paper: {} }))

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KernPairView } from '@/features/featureWorkspace/KernPairView'
import { createEmptyOpenTypeFeaturesState } from '@/lib/openTypeFeatures/defaults'
import { useStore } from '@/store'
import { makeFontData } from '../openTypeFeatures/openTypeFeatureTestHelpers'
import { renderWithProviders } from './renderWithProviders'

const seedStore = (
  overrides: Partial<Parameters<typeof useStore.setState>[0]>
) => {
  useStore.setState({
    fontData: makeFontData(['a', 'b']),
    activeMasterId: null,
    ...overrides,
  })
}

describe('KernPairView', () => {
  beforeEach(() => {
    seedStore({})
  })

  it('adds a pair through the new-pair row', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <KernPairView
        fontData={useStore.getState().fontData!}
        state={createEmptyOpenTypeFeaturesState()}
        onOpenIrKern={vi.fn()}
        onPreviewText={vi.fn()}
      />
    )
    await user.type(screen.getByLabelText('左側(字符或 @群組)'), 'a')
    await user.type(screen.getByLabelText('右側(字符或 @群組)'), 'b')
    await user.type(screen.getByLabelText('字距值'), '-50{Enter}')
    const pairs = useStore.getState().fontData?.kerningPairs ?? []
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({
      left: { kind: 'glyph', glyph: 'a' },
      right: { kind: 'glyph', glyph: 'b' },
      value: -50,
    })
  })

  it('routes edits to the active master and shows its badge', async () => {
    const user = userEvent.setup()
    const fontData = {
      ...makeFontData(['a', 'b']),
      sources: {
        Bold: { id: 'Bold', name: 'Bold', location: {} },
      },
      kerningPairsByMaster: { Bold: [] },
    }
    seedStore({ fontData, activeMasterId: 'Bold' })
    renderWithProviders(
      <KernPairView
        fontData={useStore.getState().fontData!}
        state={createEmptyOpenTypeFeaturesState()}
        onOpenIrKern={vi.fn()}
        onPreviewText={vi.fn()}
      />
    )
    expect(screen.getByText('Master:Bold')).toBeInTheDocument()
    await user.type(screen.getByLabelText('左側(字符或 @群組)'), 'a')
    await user.type(screen.getByLabelText('右側(字符或 @群組)'), 'b')
    await user.type(screen.getByLabelText('字距值'), '-30{Enter}')
    const next = useStore.getState().fontData!
    expect(next.kerningPairsByMaster?.Bold).toHaveLength(1)
    expect(next.kerningPairs ?? []).toHaveLength(0)
  })

  it('loads a word-list line into the preview', async () => {
    const user = userEvent.setup()
    const onPreviewText = vi.fn()
    renderWithProviders(
      <KernPairView
        fontData={useStore.getState().fontData!}
        state={createEmptyOpenTypeFeaturesState()}
        onOpenIrKern={vi.fn()}
        onPreviewText={onPreviewText}
      />
    )
    await user.type(screen.getByLabelText('詞表'), 'abba')
    await user.click(screen.getByRole('button', { name: 'abba' }))
    expect(onPreviewText).toHaveBeenCalledWith('abba')
  })
})

describe('KernPairView vertical tab', () => {
  it('adds a pair to the vertical set from the vkrn tab', async () => {
    seedStore({})
    const user = userEvent.setup()
    renderWithProviders(
      <KernPairView
        fontData={useStore.getState().fontData!}
        state={createEmptyOpenTypeFeaturesState()}
        onOpenIrKern={vi.fn()}
        onPreviewText={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: '直排 vkrn' }))
    await user.type(screen.getByLabelText('左側(字符或 @群組)'), 'a')
    await user.type(screen.getByLabelText('右側(字符或 @群組)'), 'b')
    await user.type(screen.getByLabelText('字距值'), '-80{Enter}')
    const next = useStore.getState().fontData!
    expect(next.verticalKerningPairs).toHaveLength(1)
    expect(next.verticalKerningPairs?.[0].value).toBe(-80)
    expect(next.kerningPairs ?? []).toHaveLength(0)
  })

  it('opens on the vertical tab when routed from the vkrn rail row', () => {
    seedStore({
      fontData: {
        ...makeFontData(['a', 'b']),
        verticalKerningPairs: [
          {
            id: 'v1',
            left: { kind: 'glyph', glyph: 'a' },
            right: { kind: 'glyph', glyph: 'b' },
            value: -80,
          },
        ],
      },
    })
    renderWithProviders(
      <KernPairView
        fontData={useStore.getState().fontData!}
        state={createEmptyOpenTypeFeaturesState()}
        onOpenIrKern={vi.fn()}
        onPreviewText={vi.fn()}
        initialOrientation="vertical"
      />
    )
    // The count badge follows the open tab: 1 vertical pair, 0 horizontal.
    expect(screen.getByText('1 個字對')).toBeInTheDocument()
  })
})
