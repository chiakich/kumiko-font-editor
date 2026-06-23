import type { OpenTypeTableTag } from 'src/lib/openTypeFeatures'

export type OpenTypeWorkbenchSelection =
  | { kind: 'source'; view: 'raw-fea' | 'imported-tables' }
  | {
      kind: 'prefix'
      view: 'languagesystems' | 'glyph-classes' | 'mark-classes' | 'gdef'
    }
  | { kind: 'feature'; featureId: string }
  | { kind: 'table'; table: OpenTypeTableTag }
  | {
      kind: 'build'
      view: 'generated-fea' | 'export-policy' | 'diagnostics' | 'suggestions'
    }

export const DEFAULT_OPEN_TYPE_SELECTION: OpenTypeWorkbenchSelection = {
  kind: 'source',
  view: 'raw-fea',
}
