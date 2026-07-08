import { Badge, Box, HStack, Stack, Text } from '@chakra-ui/react'
import { WarningTriangle } from 'iconoir-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  validateKerning,
  type KerningValidationIssueKind,
} from 'src/lib/kerning/resolveKerning'
import type { FontData } from 'src/store'
import { KerningCard } from 'src/features/editor/rightPanel/kerning/KerningPairInspector'

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

  const issues = useMemo(() => validateKerning(fontData), [fontData])
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
