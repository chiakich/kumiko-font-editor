import {
  Box,
  Button,
  Collapse,
  Heading,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'

interface GitHubImportCardProps {
  isLoading: boolean
  refInput: string
  repoInput: string
  showRefInput: boolean
  onImport: () => void
  onRefInputChange: (value: string) => void
  onRepoInputChange: (value: string) => void
  onToggleRefInput: () => void
}

export function GitHubImportCard({
  isLoading,
  refInput,
  repoInput,
  showRefInput,
  onImport,
  onRefInputChange,
  onRepoInputChange,
  onToggleRefInput,
}: GitHubImportCardProps) {
  const { t } = useTranslation()

  return (
    <Box
      border="1px solid"
      borderColor="field.line"
      p={6}
      borderRadius="sm"
      bg="field.panel"
    >
      <Heading size="sm" mb={2} textTransform="uppercase">
        {t('home.loadFromGitHub')}
      </Heading>
      <Text fontSize="sm" color="field.muted" mb={4}>
        {t('home.repoInputHint')}
      </Text>
      <VStack spacing={3} align="stretch">
        <Input
          value={repoInput}
          onChange={(event) => onRepoInputChange(event.target.value)}
          placeholder="owner/repo"
        />
        <Button
          size="sm"
          variant="ghost"
          alignSelf="flex-start"
          onClick={onToggleRefInput}
          rightIcon={
            <Text
              as="span"
              fontSize="sm"
              transform={showRefInput ? 'rotate(180deg)' : 'rotate(0deg)'}
              transition="transform 0.2s ease"
            >
              ▾
            </Text>
          }
        >
          {showRefInput
            ? '收合 branch / tag / commit'
            : '指定 branch / tag / commit'}
        </Button>
        <Collapse in={showRefInput} animateOpacity>
          <Box>
            <Input
              value={refInput}
              onChange={(event) => onRefInputChange(event.target.value)}
              placeholder={t('home.refPlaceholder')}
            />
          </Box>
        </Collapse>
        <Button
          onClick={() => void onImport()}
          isLoading={isLoading}
          loadingText="下載與解析中..."
        >
          {t('home.loadGitHubProject')}
        </Button>
      </VStack>
    </Box>
  )
}
