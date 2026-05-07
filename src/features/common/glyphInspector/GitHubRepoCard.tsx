import { Badge, Box, Button, HStack, Link, Stack, Text } from '@chakra-ui/react'
import type { GitHubRepoSummary } from 'src/lib/githubAuth'

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
  return (
    <Box borderWidth={1} borderRadius="lg" p={4}>
      <Stack spacing={3}>
        <HStack justify="space-between" align="start" spacing={3}>
          <Box minW={0}>
            <HStack spacing={2} mb={1} align="center">
              <Text fontWeight="medium">{title}</Text>
              {badgeLabel ? (
                <Badge colorScheme={badgeColorScheme}>{badgeLabel}</Badge>
              ) : null}
            </HStack>
            {repo ? (
              <Stack spacing={1}>
                <Link href={repo.htmlUrl} isExternal color="blue.600">
                  {repo.fullName}
                </Link>
                <Text fontSize="sm" color="gray.500">
                  預設分支：{repo.defaultBranch}
                </Text>
              </Stack>
            ) : (
              <Text fontSize="sm" color="gray.500">
                尚未取得 repo 資訊
              </Text>
            )}
          </Box>
          {actionLabel ? (
            <Button
              size="xs"
              variant="outline"
              onClick={onAction}
              isLoading={isActionLoading}
              isDisabled={isActionDisabled || !onAction}
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
          <HStack justify="space-between" align="center" spacing={3}>
            <Text fontSize="sm" color="gray.600">
              {statusText}
            </Text>
            {statusActionLabel ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={onStatusAction}
                isDisabled={isStatusActionDisabled || !onStatusAction}
                isLoading={isStatusActionLoading}
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
