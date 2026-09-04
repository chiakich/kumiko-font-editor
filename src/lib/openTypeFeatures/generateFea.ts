import { buildFeaDocument } from '@/lib/openTypeFeatures/buildFeaDocument'
import { serializeFeaDocument } from '@/lib/openTypeFeatures/serializeFea'
import type { OpenTypeFeaturesState } from '@/lib/openTypeFeatures/types'

export const generateFea = (state: OpenTypeFeaturesState) =>
  serializeFeaDocument(buildFeaDocument(state))
