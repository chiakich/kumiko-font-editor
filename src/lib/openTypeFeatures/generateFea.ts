import { buildFeaDocument } from 'src/lib/openTypeFeatures/buildFeaDocument'
import { serializeFeaDocument } from 'src/lib/openTypeFeatures/serializeFea'
import type { OpenTypeFeaturesState } from 'src/lib/openTypeFeatures/types'

export const generateFea = (state: OpenTypeFeaturesState) =>
  serializeFeaDocument(buildFeaDocument(state))
