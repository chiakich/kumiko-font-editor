import { Badge, Box, HStack, Stack, Text } from '@chakra-ui/react'
import { WarningTriangle } from 'iconoir-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getMasterKerningPairs,
  validateKerning,
  type KerningValidationIssueKind,
} from '@/lib/kerning/resolveKerning'
import type { FontData } from '@/domain'
import { useStore } from '@/store'
import { KerningCard } from '@/features/editor/rightPanel/kerning/KerningPairInspector'

const ISSUE_LABEL_KEYS: Record<KerningValidationIssueKind, string> = {
  'empty-group': 'editor.kerningIssueEmptyGroup',
  'missing-glyph': 'editor.kerningIssueMissingGlyph',
  'duplicate-membership': 'editor.kerningIssueDuplicateMembership',
  'missing-group-reference': 'editor.kerningIssueMissingGroupReference',
}

interface KerningValidationCardProps {
  fontData: FontData
}

export function KerningValidationCard({
  fontData,
}: KerningValidationCardProps) {
  const { t } = useTranslation()
  const activeMasterId = useStore((state) => state.activeMasterId)

  // Validate the pair set the rest of the panel shows (active master's).
  const issues = useMemo(
    () =>
      validateKerning({
        ...fontData,
        kerningPairs: getMasterKerningPairs(fontData, activeMasterId),
      }),
    [fontData, activeMasterId]
  )
  if (issues.length === 0) return null

  return (
    <KerningCard
      title={t('editor.kerningValidationIssues')}
      actions={<Badge colorPalette="orange">{issues.length}</Badge>}
    >
      <Stack gap={0} maxH="180px" overflowY="auto">
        {issues.map((issue, index) => (
          <HStack
            key={`${issue.kind}-${issue.message}-${index}`}
            px={3}
            py={1.5}
            gap={2}
            borderBottomWidth="1px"
            borderColor="border"
            _last={{ borderBottomWidth: 0 }}
            align="flex-start"
          >
            <Box color="orange.500" display="inline-flex" mt="2px">
              <WarningTriangle width={12} height={12} aria-hidden="true" />
            </Box>
            <Stack gap={0}>
              <Text fontSize="10px" fontWeight="bold" color="mutedForeground">
                {t(ISSUE_LABEL_KEYS[issue.kind])}
              </Text>
              <Text fontSize="xs" fontFamily="mono">
                {issue.message}
              </Text>
            </Stack>
          </HStack>
        ))}
      </Stack>
    </KerningCard>
  )
}
