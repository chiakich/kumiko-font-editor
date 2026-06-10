import {
  Badge,
  Box,
  Button,
  Divider,
  HStack,
  Stack,
  Tag,
  Text,
} from '@chakra-ui/react'
import type {
  QualityIssue,
  QualityIssueSeverity,
} from 'src/features/common/qualityCheck/qualityLint'

const severityMeta: Record<
  QualityIssueSeverity,
  { label: string; colorScheme: string }
> = {
  blocking: { label: '阻擋', colorScheme: 'red' },
  warning: { label: '警告', colorScheme: 'orange' },
  info: { label: '提示', colorScheme: 'cyan' },
}

interface LintPanelProps {
  issues: QualityIssue[]
  glyphCount: number
  onLocateIssue: (issue: QualityIssue) => void
}

export function LintPanel({
  issues,
  glyphCount,
  onLocateIssue,
}: LintPanelProps) {
  const groupedIssues = issues.reduce<Record<string, QualityIssue[]>>(
    (groups, issue) => {
      groups[issue.group] = [...(groups[issue.group] ?? []), issue]
      return groups
    },
    {}
  )

  if (glyphCount === 0) {
    return <EmptyPanel title="沒有可檢查的 glyph" />
  }

  if (issues.length === 0) {
    return <EmptyPanel title="目前沒有 lint 警告" />
  }

  return (
    <Stack spacing={3}>
      {Object.entries(groupedIssues).map(([group, groupIssues]) => (
        <Box
          key={group}
          borderWidth={1}
          borderColor="field.line"
          bg="field.panel"
        >
          <HStack justify="space-between" px={3} py={2} bg="field.panelMuted">
            <Text fontSize="sm" fontWeight="900">
              {group}
            </Text>
            <Tag size="sm">{groupIssues.length}</Tag>
          </HStack>
          <Stack spacing={0} divider={<Divider />} align="stretch">
            {groupIssues.map((issue) => {
              const meta = severityMeta[issue.severity]
              return (
                <HStack
                  key={issue.id}
                  justify="space-between"
                  align="center"
                  px={3}
                  py={2}
                  spacing={3}
                >
                  <HStack spacing={3} minW={0}>
                    <Badge colorScheme={meta.colorScheme}>{meta.label}</Badge>
                    <Text fontFamily="mono" fontSize="sm" fontWeight="900">
                      {issue.glyphName}
                    </Text>
                    <Text fontSize="sm" color="field.muted" noOfLines={1}>
                      {issue.message}
                    </Text>
                  </HStack>
                  <HStack spacing={2}>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => onLocateIssue(issue)}
                    >
                      定位
                    </Button>
                    <Button size="xs" variant="ghost">
                      預覽
                    </Button>
                  </HStack>
                </HStack>
              )
            })}
          </Stack>
        </Box>
      ))}
    </Stack>
  )
}

function EmptyPanel({ title }: { title: string }) {
  return (
    <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={6}>
      <Text fontSize="sm" color="field.muted" fontWeight="800">
        {title}
      </Text>
    </Box>
  )
}
