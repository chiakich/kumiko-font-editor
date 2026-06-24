import {
  Box,
  Button,
  Checkbox,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  clearReferenceFont,
  getReferenceFontBytes,
  loadReferenceFontFromBytes,
} from 'src/lib/referenceFont/referenceFontStore'
import {
  deleteReferenceFont,
  loadReferenceFontRecord,
  saveReferenceFont,
} from 'src/lib/referenceFont/referenceFontPersistence'
import { buildReferenceResidualData } from 'src/lib/referenceFont/referenceResidualWorkerClient'
import { useStore } from 'src/store'

interface ReferenceFontSettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ReferenceFontSettingsModal({
  isOpen,
  onClose,
}: ReferenceFontSettingsModalProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const projectId = useStore((state) => state.projectId)
  const referenceFontName = useStore((state) => state.referenceFontName)
  const referenceFontChar = useStore((state) => state.referenceFontChar)
  const residualEnabled = useStore(
    (state) => state.referenceFontResidualEnabled
  )
  const residualStatus = useStore((state) => state.referenceFontResidualStatus)
  const residualError = useStore((state) => state.referenceFontResidualError)
  const residualSummary = useStore(
    (state) => state.referenceFontResidualSummary
  )
  const setReferenceFontName = useStore((state) => state.setReferenceFontName)
  const setReferenceFontVisible = useStore(
    (state) => state.setReferenceFontVisible
  )
  const setReferenceFontChar = useStore((state) => state.setReferenceFontChar)
  const setReferenceFontResidualComputing = useStore(
    (state) => state.setReferenceFontResidualComputing
  )
  const setReferenceFontResidualReady = useStore(
    (state) => state.setReferenceFontResidualReady
  )
  const setReferenceFontResidualError = useStore(
    (state) => state.setReferenceFontResidualError
  )
  const clearReferenceFontResidual = useStore(
    (state) => state.clearReferenceFontResidual
  )

  const isComputingResidual = residualStatus === 'computing'
  const isResidualChecked = residualEnabled && residualStatus === 'ready'

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    setError(null)
    clearReferenceFontResidual()
    try {
      const buffer = await file.arrayBuffer()
      const fallbackName = file.name.replace(/\.[^.]+$/, '')
      const name = loadReferenceFontFromBytes(buffer, fallbackName)
      setReferenceFontName(name)
      setReferenceFontVisible(true)
      setReferenceFontChar(null)
      if (projectId) {
        await saveReferenceFont(projectId, name, buffer)
      }
    } catch {
      setError(t('editor.referenceFontLoadFailed'))
    }
  }

  const handleClear = () => {
    clearReferenceFont()
    clearReferenceFontResidual()
    setReferenceFontName(null)
    setReferenceFontVisible(false)
    setReferenceFontChar(null)
    setError(null)
    if (projectId) {
      void deleteReferenceFont(projectId)
    }
  }

  const loadReferenceBytesForResidual = async () => {
    const loadedBytes = getReferenceFontBytes()
    if (loadedBytes) {
      return loadedBytes
    }
    if (!projectId) {
      return null
    }
    const record = await loadReferenceFontRecord(projectId)
    return record?.fontBytes ?? null
  }

  const handleResidualToggle = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!event.target.checked) {
      clearReferenceFontResidual()
      return
    }
    if (!referenceFontName) {
      return
    }

    setError(null)
    setReferenceFontResidualComputing()
    try {
      const fontBytes = await loadReferenceBytesForResidual()
      if (!fontBytes) {
        throw new Error(t('editor.referenceFontResidualNoFont'))
      }
      const result = await buildReferenceResidualData(
        referenceFontName,
        fontBytes
      )
      setReferenceFontResidualReady(result.referenceData, {
        source: referenceFontName,
        sampleCount: result.sampleCount,
        entryCount: result.entryCount,
      })
    } catch (error) {
      setReferenceFontResidualError(
        error instanceof Error
          ? error.message
          : t('editor.referenceFontResidualBuildFailed')
      )
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <ModalOverlay />
      <ModalContent bg="field.paper">
        <ModalHeader>{t('editor.referenceFontSettings')}</ModalHeader>
        <ModalCloseButton isDisabled={isComputingResidual} />
        <ModalBody>
          <Stack spacing={5}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ttf,.otf,.woff"
              style={{ display: 'none' }}
              onChange={(event) => void handleFileChange(event)}
            />

            <Stack spacing={3}>
              {referenceFontName ? (
                <HStack justify="space-between" align="flex-start">
                  <Box minW={0}>
                    <Text fontSize="xs" color="field.muted" mb={1}>
                      {t('editor.referenceFontCurrent')}
                    </Text>
                    <Text fontSize="sm" fontWeight="800" noOfLines={2}>
                      {referenceFontName}
                    </Text>
                  </Box>
                  <Button
                    size="xs"
                    variant="ghost"
                    isDisabled={isComputingResidual}
                    onClick={handleClear}
                  >
                    {t('editor.clearReferenceFont')}
                  </Button>
                </HStack>
              ) : (
                <Text fontSize="sm" color="field.muted">
                  {t('editor.referenceFontNoFontLoaded')}
                </Text>
              )}

              <Button
                size="sm"
                alignSelf="flex-start"
                isDisabled={isComputingResidual}
                onClick={() => fileInputRef.current?.click()}
              >
                {referenceFontName
                  ? t('editor.referenceFontReplace')
                  : t('editor.loadReferenceFont')}
              </Button>
            </Stack>

            <Box>
              <Text fontSize="xs" color="field.muted" mb={1}>
                {t('editor.referenceFontCharOverride')}
              </Text>
              <Input
                size="sm"
                maxLength={2}
                isDisabled={!referenceFontName || isComputingResidual}
                value={referenceFontChar ?? ''}
                onChange={(event) =>
                  setReferenceFontChar(event.target.value || null)
                }
                placeholder={t('editor.referenceFontCharOverridePlaceholder')}
              />
            </Box>

            <Box opacity={isComputingResidual ? 0.65 : 1}>
              <HStack justify="space-between" align="center" mb={1}>
                <Checkbox
                  size="sm"
                  isChecked={isResidualChecked || isComputingResidual}
                  isDisabled={!referenceFontName || isComputingResidual}
                  onChange={(event) => void handleResidualToggle(event)}
                >
                  {t('editor.referenceFontResidualUse')}
                </Checkbox>
                {isComputingResidual ? (
                  <Spinner size="sm" color="field.yellow.400" />
                ) : null}
              </HStack>
              <Text fontSize="xs" color="field.muted">
                {t('editor.referenceFontResidualDescription')}
              </Text>
              {residualSummary && isResidualChecked ? (
                <Text fontSize="xs" color="green.500" mt={2}>
                  {t('editor.referenceFontResidualReady', {
                    count: residualSummary.entryCount.toLocaleString(),
                  })}
                </Text>
              ) : null}
              {residualError ? (
                <Text fontSize="xs" color="red.400" mt={2}>
                  {residualError}
                </Text>
              ) : null}
            </Box>

            {error ? (
              <Text fontSize="xs" color="red.400">
                {error}
              </Text>
            ) : null}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button size="sm" onClick={onClose} isDisabled={isComputingResidual}>
            {t('common.done')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
