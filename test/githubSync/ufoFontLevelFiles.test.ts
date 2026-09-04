import { describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { buildUfoFontLevelFiles } from '@/lib/fontFormats/ufoFontLevelFiles'
import type { UfoMetadataRecord } from '@/lib/fontFormats/ufoTypes'

const makeMetadata = (
  overrides: Partial<UfoMetadataRecord> = {}
): UfoMetadataRecord => ({
  projectId: 'p1',
  ufoId: 'Kumiko.ufo',
  relativePath: 'Kumiko.ufo',
  metainfo: null,
  fontinfo: { unitsPerEm: 1000 },
  lib: {},
  groups: {},
  kerning: {},
  featuresText: null,
  layers: [{ layerId: 'public.default', glyphDir: 'glyphs' }],
  contents: {},
  glyphOrder: [],
  updatedAt: 0,
  ...overrides,
})

const window = new Window()
vi.stubGlobal('DOMParser', window.DOMParser)
vi.stubGlobal('Node', window.Node)

const EMPTY_DICT =
  '<?xml version="1.0"?><plist version="1.0"><dict></dict></plist>'
const METAINFO =
  '<?xml version="1.0"?><plist version="1.0"><dict><key>creator</key><string>com.example</string><key>formatVersion</key><integer>3</integer></dict></plist>'

const pathsOf = (metadata: UfoMetadataRecord) =>
  buildUfoFontLevelFiles(metadata).map((file) => file.path)

const textOf = (metadata: UfoMetadataRecord, path: string) =>
  buildUfoFontLevelFiles(metadata).find((file) => file.path === path)?.text

describe('buildUfoFontLevelFiles', () => {
  it('emits every UFO font-level file except optional features', () => {
    expect(pathsOf(makeMetadata())).toEqual([
      'metainfo.plist',
      'fontinfo.plist',
      'lib.plist',
      'groups.plist',
      'kerning.plist',
      'layercontents.plist',
    ])
  })

  it('appends features.fea only when feature text exists', () => {
    const metadata = makeMetadata({ featuresText: 'feature kern {} kern;' })
    expect(pathsOf(metadata)).toContain('features.fea')
    expect(textOf(metadata, 'features.fea')).toBe('feature kern {} kern;')
    expect(pathsOf(makeMetadata({ featuresText: '' }))).toContain(
      'features.fea'
    )
  })

  it('falls back to Kumiko metainfo defaults when the source has none', () => {
    const text = textOf(makeMetadata(), 'metainfo.plist') ?? ''
    expect(text).toContain('org.kumiko.fonteditor')
    expect(text).toContain('formatVersion')
  })

  it('keeps imported metainfo values instead of the defaults', () => {
    const text =
      textOf(
        makeMetadata({
          metainfo: { creator: 'com.example.tool', formatVersion: 2 },
        }),
        'metainfo.plist'
      ) ?? ''
    expect(text).toContain('com.example.tool')
    expect(text).not.toContain('org.kumiko.fonteditor')
  })

  it('serializes layercontents as layerId/glyphDir pairs', () => {
    const text =
      textOf(
        makeMetadata({
          layers: [
            { layerId: 'public.default', glyphDir: 'glyphs' },
            { layerId: 'background', glyphDir: 'glyphs.background' },
          ],
        }),
        'layercontents.plist'
      ) ?? ''
    expect(text).toContain('public.default')
    expect(text).toContain('glyphs.background')
  })
})

describe('UFO font-level import baselines', () => {
  it('records blob baselines for the font-level files the repo actually has', async () => {
    const { importUfoWorkspaceEntries } =
      await import('@/lib/fontFormats/ufoFormat')
    const { gitBlobShaFromText } = await import('@/lib/github/sync/gitBlobSha')
    const fontinfo =
      '<?xml version="1.0"?><plist version="1.0"><dict><key>unitsPerEm</key><integer>1000</integer></dict></plist>'
    const imported = await importUfoWorkspaceEntries(
      [
        { relativePath: 'Kumiko.ufo/metainfo.plist', text: METAINFO },
        { relativePath: 'Kumiko.ufo/fontinfo.plist', text: fontinfo },
        { relativePath: 'Kumiko.ufo/glyphs/contents.plist', text: EMPTY_DICT },
      ],
      { projectId: 'import-baseline', title: 'Kumiko' }
    )

    const source = imported.projectSourceData.ufo?.ufos?.[0]
    expect(source?.remoteBlobShaByPath?.['Kumiko.ufo/fontinfo.plist']).toBe(
      await gitBlobShaFromText(fontinfo)
    )
    // Files the repo does not have must not get a baseline.
    expect(source?.remoteBlobShaByPath).not.toHaveProperty(
      'Kumiko.ufo/features.fea'
    )
  })
})
