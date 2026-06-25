import {
  Box,
  Button,
  Link,
  Text,
  VStack,
  Dialog,
  Portal,
} from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import type { PendingGitHubImport } from 'src/features/home/types'
import { useTranslation } from 'react-i18next'

interface PendingGitHubImportModalProps {
  importRequest: PendingGitHubImport | null
  isLoading: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function PendingGitHubImportModal({
  importRequest,
  isLoading,
  onCancel,
  onConfirm,
}: PendingGitHubImportModalProps) {
  const { t } = useTranslation()

  return (
    <Dialog.Root
      open={Boolean(importRequest)}
      placement="center"
      onOpenChange={(e) => {
        if (!e.open) {
          onCancel()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="sm">
            <Dialog.Header fontWeight={800}>
              {t('home.loadGitHubProject')}
            </Dialog.Header>
            <DialogCloseButton />
            <Dialog.Body>
              <VStack align="stretch" gap={4}>
                <Text fontSize="sm" color="field.muted">
                  {t('home.loadGitHubProjectPrompt')}
                </Text>
                <Box
                  border="1px solid"
                  borderColor="field.line"
                  borderRadius="sm"
                  bg="white"
                  p={4}
                >
                  <Text fontSize="xs" color="field.muted" fontFamily="mono">
                    {t('home.repository')}
                  </Text>

                  {importRequest?.repoUrl && (
                    <Box
                      fontSize="lg"
                      color="black"
                      wordBreak="break-all"
                      textTransform="uppercase"
                      fontFamily="'SF Pro Display', 'SF Pro Text', 'Noto Sans TC', sans-serif"
                    >
                      <Box fontWeight="800">
                        {importRequest.repo.split('/')[0] || importRequest.repo}
                        /
                      </Box>
                      <Link
                        display="inline-block"
                        href={importRequest.repoUrl}
                        fontWeight="900"
                        fontSize="25px"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {importRequest.repo.split('/')[1] || importRequest.repo}
                      </Link>
                    </Box>
                  )}
                  <Text
                    mt={3}
                    fontSize="xs"
                    color="field.muted"
                    fontFamily="mono"
                  >
                    {t('home.ref')}
                  </Text>
                  <Text fontWeight="700" wordBreak="break-all">
                    {importRequest?.ref || '預設 branch'}
                  </Text>
                </Box>
              </VStack>
            </Dialog.Body>
            <Dialog.Footer gap={3}>
              <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
                {t('home.cancel')}
              </Button>
              <Button
                onClick={() => void onConfirm()}
                loading={isLoading}
                loadingText="下載與解析中..."
              >
                {t('home.loadProject')}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
