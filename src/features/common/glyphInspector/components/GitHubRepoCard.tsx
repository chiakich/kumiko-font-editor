import { Badge, Box, Button, HStack, Link, Stack, Text } from '@chakra-ui/react'
import type { GitHubRepoSummary } from 'src/lib/github/githubAuth'
import { useTranslation } from 'react-i18next'

interface GitHubRepoCardProps {
  title: string
  repo: GitHubRepoSummary | null
  badgeLabel?: string | null
  badgeColorScheme?: string
  statusText?: string | null
  helperText?: string | null
  actionLabel?: string | null
  isActionLoading?: boolean
  isActionDisabled?: boolean
  onAction?: () => void
  statusActionLabel?: string | null
  isStatusActionDisabled?: boolean
  isStatusActionLoading?: boolean
  onStatusAction?: () => void
}

export function GitHubRepoCard({
  title,
  repo,
  badgeLabel,
  badgeColorScheme = 'gray',
  statusText,
  helperText,
  actionLabel,
  isActionLoading = false,
  isActionDisabled = false,
  onAction,
  statusActionLabel,
  isStatusActionDisabled = false,
  isStatusActionLoading = false,
  onStatusAction,
}: GitHubRepoCardProps) {
  const { t } = useTranslation()

  return (
    <Box borderWidth={1} borderRadius="lg" p={4}>
      <Stack gap={3}>
        <HStack justify="space-between" align="start" gap={3}>
          <Box minW={0}>
            <HStack gap={2} mb={1} align="center">
              <Text fontWeight="medium">{title}</Text>
              {badgeLabel ? (
                <Badge colorPalette={badgeColorScheme}>{badgeLabel}</Badge>
              ) : null}
            </HStack>
            {repo ? (
              <Stack gap={1}>
                <Link
                  href={repo.htmlUrl}
                  color="blue.600"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {repo.fullName}
                </Link>
                <Text fontSize="sm" color="gray.500">
                  {t('glyphInspector.defaultBranchLabel')}
                  {repo.defaultBranch}
                </Text>
              </Stack>
            ) : (
              <Text fontSize="sm" color="gray.500">
                {t('glyphInspector.repoUnavailable')}
              </Text>
            )}
          </Box>
          {actionLabel ? (
            <Button
              size="xs"
              variant="outline"
              onClick={onAction}
              loading={isActionLoading}
              disabled={isActionDisabled || !onAction}
              loadingText={actionLabel}
              flexShrink={0}
            >
              {actionLabel}
            </Button>
          ) : null}
        </HStack>
        {helperText ? (
          <Text fontSize="sm" color="gray.600">
            {helperText}
          </Text>
        ) : null}
        {statusText ? (
          <HStack justify="space-between" align="center" gap={3}>
            <Text fontSize="sm" color="gray.600">
              {statusText}
            </Text>
            {statusActionLabel ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={onStatusAction}
                disabled={isStatusActionDisabled || !onStatusAction}
                loading={isStatusActionLoading}
                flexShrink={0}
              >
                {statusActionLabel}
              </Button>
            ) : null}
          </HStack>
        ) : null}
      </Stack>
    </Box>
  )
}
