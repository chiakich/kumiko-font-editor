import {
  Box,
  Button,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from '@chakra-ui/react'
import type { PendingGitHubImport } from 'src/features/home/types'

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
  return (
    <Modal isOpen={Boolean(importRequest)} onClose={onCancel} isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="sm">
        <ModalHeader fontWeight={800}>載入 GitHub 專案</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <Text fontSize="sm" color="field.muted">
              是否要載入以下 GitHub 專案？
            </Text>
            <Box
              border="1px solid"
              borderColor="field.line"
              borderRadius="sm"
              bg="white"
              p={4}
            >
              <Text fontSize="xs" color="field.muted" fontFamily="mono">
                Repository
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
                    {importRequest.repo.split('/')[0] || importRequest.repo}/
                  </Box>
                  <Link
                    display="inline-block"
                    href={importRequest.repoUrl}
                    isExternal
                    fontWeight="900"
                    fontSize="25px"
                  >
                    {importRequest.repo.split('/')[1] || importRequest.repo}
                  </Link>
                </Box>
              )}
              <Text mt={3} fontSize="xs" color="field.muted" fontFamily="mono">
                Ref
              </Text>
              <Text fontWeight="700" wordBreak="break-all">
                {importRequest?.ref || '預設 branch'}
              </Text>
            </Box>
          </VStack>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="ghost" onClick={onCancel} isDisabled={isLoading}>
            取消
          </Button>
          <Button
            onClick={() => void onConfirm()}
            isLoading={isLoading}
            loadingText="下載與解析中..."
          >
            載入專案
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
