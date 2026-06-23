import {
  Badge,
  Box,
  Button,
  Code,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Radio,
  RadioGroup,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DesignspaceCandidate } from 'src/lib/fontFormats/adapters/ufo'

interface DesignspaceImportChoiceModalProps {
  candidates: DesignspaceCandidate[]
  isLoading: boolean
  isOpen: boolean
  onCancel: () => void
  onConfirm: (designspacePath: string) => void
}

const candidateSummary = (candidate: DesignspaceCandidate) => {
  const axes =
    candidate.axes
      .map((axis) => axis.tag || axis.name)
      .filter(Boolean)
      .join(', ') || '-'
  return { axes }
}

export function DesignspaceImportChoiceModal({
  candidates,
  isLoading,
  isOpen,
  onCancel,
  onConfirm,
}: DesignspaceImportChoiceModalProps) {
  const { t } = useTranslation()
  const candidateKey = useMemo(
    () => candidates.map((candidate) => candidate.relativePath).join('\n'),
    [candidates]
  )
  const recommendedPath = useMemo(
    () =>
      candidates.find(
        (candidate) => candidate.recommended && !candidate.parseError
      )?.relativePath ??
      candidates.find((candidate) => !candidate.parseError)?.relativePath ??
      '',
    [candidates]
  )
  const [selection, setSelection] = useState({ key: '', path: '' })
  const selectedPath =
    selection.key === candidateKey &&
    candidates.some((candidate) => candidate.relativePath === selection.path)
      ? selection.path
      : recommendedPath

  const selectedCandidate = candidates.find(
    (candidate) => candidate.relativePath === selectedPath
  )
  const canConfirm = Boolean(selectedCandidate && !selectedCandidate.parseError)

  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="2xl" isCentered>
      <ModalOverlay />
      <ModalContent borderRadius="sm">
        <ModalHeader>{t('home.chooseDesignspaceTitle')}</ModalHeader>
        <ModalBody>
          <Stack spacing={4}>
            <Text fontSize="sm" color="field.muted">
              {t('home.chooseDesignspaceDescription')}
            </Text>

            <RadioGroup
              value={selectedPath}
              onChange={(path) => setSelection({ key: candidateKey, path })}
            >
              <Stack spacing={3}>
                {candidates.map((candidate) => {
                  const { axes } = candidateSummary(candidate)
                  const disabled = Boolean(candidate.parseError)
                  return (
                    <Box
                      key={candidate.relativePath}
                      border="1px solid"
                      borderColor={
                        candidate.relativePath === selectedPath
                          ? 'field.red.500'
                          : 'field.line'
                      }
                      bg={
                        candidate.relativePath === selectedPath
                          ? 'field.yellow.300'
                          : 'field.paper'
                      }
                      borderRadius="sm"
                      p={3}
                    >
                      <Radio
                        value={candidate.relativePath}
                        isDisabled={disabled}
                      >
                        <Stack spacing={2} pl={1}>
                          <HStack spacing={2} align="center" wrap="wrap">
                            <Code fontSize="xs">{candidate.relativePath}</Code>
                            {candidate.recommended && (
                              <Badge colorScheme="green">
                                {t('home.recommendedDesignspace')}
                              </Badge>
                            )}
                            {disabled && (
                              <Badge colorScheme="red">
                                {t('home.unreadableDesignspace')}
                              </Badge>
                            )}
                          </HStack>
                          <HStack spacing={3} wrap="wrap">
                            <Text fontSize="xs" color="field.muted">
                              {t('home.designspaceAxes', { axes })}
                            </Text>
                            <Text fontSize="xs" color="field.muted">
                              {t('home.designspaceSources', {
                                count: candidate.sourceCount,
                                matched: candidate.matchedSourceCount,
                              })}
                            </Text>
                            {!candidate.hasDefaultSource && !disabled && (
                              <Text fontSize="xs" color="field.red.500">
                                {t('home.designspaceNoDefaultSource')}
                              </Text>
                            )}
                          </HStack>
                          {candidate.missingSourceCount > 0 && !disabled && (
                            <Text fontSize="xs" color="field.red.500">
                              {t('home.designspaceMissingSources', {
                                count: candidate.missingSourceCount,
                              })}
                            </Text>
                          )}
                          {candidate.parseError && (
                            <Text fontSize="xs" color="field.red.500">
                              {candidate.parseError}
                            </Text>
                          )}
                        </Stack>
                      </Radio>
                    </Box>
                  )
                })}
              </Stack>
            </RadioGroup>
          </Stack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" onClick={onCancel}>
            {t('home.cancel')}
          </Button>
          <Button
            onClick={() => selectedPath && onConfirm(selectedPath)}
            isDisabled={!canConfirm}
            isLoading={isLoading}
          >
            {t('home.importSelectedDesignspace')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
