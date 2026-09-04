import type { ProjectSourceFormat } from '@/lib/project/projectFormats'

export const canUseCanonicalUfoZipExport = (
  sourceFormat: ProjectSourceFormat | null | undefined
) => sourceFormat === 'ufo' || sourceFormat === 'designspace'
