import {
  Badge,
  Box,
  Button,
  Code,
  HStack,
  RadioGroup,
  Stack,
  Text,
  Dialog,
  Portal,
} from '@chakra-ui/react'
import { RadioItem } from '@/components/ui/radio'
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
    <Dialog.Root
      open={isOpen}
      size="xl"
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
          <Dialog.Content borderRadius="lg">
            <Dialog.Header>{t('home.chooseDesignspaceTitle')}</Dialog.Header>
            <Dialog.Body>
              <Stack gap={4}>
                <Text fontSize="sm" color="mutedForeground">
                  {t('home.chooseDesignspaceDescription')}
                </Text>

                <RadioGroup.Root
                  value={selectedPath}
                  onValueChange={(details) =>
                    setSelection({
                      key: candidateKey,
                      path: details.value ?? '',
                    })
                  }
                >
                  <Stack gap={3}>
                    {candidates.map((candidate) => {
                      const { axes } = candidateSummary(candidate)
                      const disabled = Boolean(candidate.parseError)
                      return (
                        <Box
                          key={candidate.relativePath}
                          border="1px solid"
                          borderColor={
                            candidate.relativePath === selectedPath
                              ? 'destructive'
                              : 'border'
                          }
                          bg={
                            candidate.relativePath === selectedPath
                              ? 'yellow.300'
                              : 'background'
                          }
                          borderRadius="sm"
                          p={3}
                        >
                          <RadioItem
                            value={candidate.relativePath}
                            disabled={disabled}
                            alignItems="flex-start"
                            controlProps={{ mt: 1 }}
                          >
                            <Stack gap={2} pl={1}>
                              <HStack gap={2} align="center" wrap="wrap">
                                <Code fontSize="xs">
                                  {candidate.relativePath}
                                </Code>
                                {candidate.recommended && (
                                  <Badge colorPalette="green">
                                    {t('home.recommendedDesignspace')}
                                  </Badge>
                                )}
                                {disabled && (
                                  <Badge colorPalette="red">
                                    {t('home.unreadableDesignspace')}
                                  </Badge>
                                )}
                              </HStack>
                              <HStack gap={3} wrap="wrap">
                                <Text fontSize="xs" color="mutedForeground">
                                  {t('home.designspaceAxes', { axes })}
                                </Text>
                                <Text fontSize="xs" color="mutedForeground">
                                  {t('home.designspaceSources', {
                                    count: candidate.sourceCount,
                                    matched: candidate.matchedSourceCount,
                                  })}
                                </Text>
                                {!candidate.hasDefaultSource && !disabled && (
                                  <Text fontSize="xs" color="destructive">
                                    {t('home.designspaceNoDefaultSource')}
                                  </Text>
                                )}
                              </HStack>
                              {candidate.missingSourceCount > 0 &&
                                !disabled && (
                                  <Text fontSize="xs" color="destructive">
                                    {t('home.designspaceMissingSources', {
                                      count: candidate.missingSourceCount,
                                    })}
                                  </Text>
                                )}
                              {candidate.parseError && (
                                <Text fontSize="xs" color="destructive">
                                  {candidate.parseError}
                                </Text>
                              )}
                            </Stack>
                          </RadioItem>
                        </Box>
                      )
                    })}
                  </Stack>
                </RadioGroup.Root>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer gap={2}>
              <Button variant="ghost" onClick={onCancel}>
                {t('home.cancel')}
              </Button>
              <Button
                onClick={() => selectedPath && onConfirm(selectedPath)}
                disabled={!canConfirm}
                loading={isLoading}
              >
                {t('home.importSelectedDesignspace')}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
