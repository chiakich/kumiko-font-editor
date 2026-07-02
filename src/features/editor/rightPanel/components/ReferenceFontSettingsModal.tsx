import {
  Box,
  Button,
  Checkbox,
  HStack,
  Input,
  Popover,
  Slider,
  Spinner,
  Stack,
  Text,
  Dialog,
  Portal,
} from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
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
  const { i18n, t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const projectId = useStore((state) => state.projectId)
  const referenceFontName = useStore((state) => state.referenceFontName)
  const referenceFontChar = useStore((state) => state.referenceFontChar)
  const referenceFontColor = useStore((state) => state.referenceFontColor)
  const referenceFontOpacity = useStore((state) => state.referenceFontOpacity)
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
  const setReferenceFontColor = useStore((state) => state.setReferenceFontColor)
  const setReferenceFontOpacity = useStore(
    (state) => state.setReferenceFontOpacity
  )
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
      const name = loadReferenceFontFromBytes(
        buffer,
        fallbackName,
        i18n.resolvedLanguage ?? i18n.language
      )
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

  const handleResidualToggle = async (checked: boolean) => {
    if (!checked) {
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
    <Dialog.Root
      open={isOpen}
      size="md"
      onOpenChange={(e) => {
        if (!e.open) {
          onClose()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content bg="field.paper">
            <Dialog.Header>{t('editor.referenceFontSettings')}</Dialog.Header>
            <DialogCloseButton disabled={isComputingResidual} />
            <Dialog.Body>
              <Stack gap={5}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ttf,.otf,.woff"
                  style={{ display: 'none' }}
                  onChange={(event) => void handleFileChange(event)}
                />

                <Stack gap={3}>
                  {referenceFontName ? (
                    <HStack justify="space-between" align="flex-start">
                      <Box minW={0}>
                        <Text fontSize="xs" color="field.muted" mb={1}>
                          {t('editor.referenceFontCurrent')}
                        </Text>
                        <Text fontSize="sm" fontWeight="800" lineClamp={2}>
                          {referenceFontName}
                        </Text>
                      </Box>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={isComputingResidual}
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
                    disabled={isComputingResidual}
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
                    disabled={!referenceFontName || isComputingResidual}
                    value={referenceFontChar ?? ''}
                    onChange={(event) =>
                      setReferenceFontChar(event.target.value || null)
                    }
                    placeholder={t(
                      'editor.referenceFontCharOverridePlaceholder'
                    )}
                  />
                </Box>

                <Box>
                  <Text fontSize="xs" color="field.muted" mb={2}>
                    {t('editor.referenceFontAppearance')}
                  </Text>
                  <Stack gap={2}>
                    <HStack justify="space-between" gap={3}>
                      <Text fontSize="sm" fontWeight="700">
                        {t('editor.referenceFontColor')}
                      </Text>
                      <Popover.Root
                        positioning={{
                          placement: 'bottom-end',
                        }}
                      >
                        <Popover.Trigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={t('editor.referenceFontColor')}
                          >
                            <HStack gap={2}>
                              <Box
                                w="18px"
                                h="18px"
                                borderRadius="sm"
                                borderWidth={1}
                                borderColor="field.line"
                                bg={referenceFontColor}
                                opacity={referenceFontOpacity}
                              />
                              <Text fontFamily="mono" fontSize="xs">
                                {Math.round(referenceFontOpacity * 100)}%
                              </Text>
                            </HStack>
                          </Button>
                        </Popover.Trigger>
                        <Popover.Positioner>
                          <Popover.Content
                            bg="field.paper"
                            borderColor="field.line"
                            w="240px"
                          >
                            <Popover.Arrow bg="field.paper" />
                            <Popover.Body>
                              <Stack gap={3}>
                                <HStack justify="space-between">
                                  <Text fontSize="sm" fontWeight="700">
                                    {t('editor.referenceFontColor')}
                                  </Text>
                                  <Input
                                    type="color"
                                    size="sm"
                                    w="52px"
                                    h="32px"
                                    p={1}
                                    value={referenceFontColor}
                                    onChange={(event) =>
                                      setReferenceFontColor(event.target.value)
                                    }
                                  />
                                </HStack>
                                <Box>
                                  <HStack justify="space-between" mb={1}>
                                    <Text fontSize="sm" fontWeight="700">
                                      {t('editor.referenceFontOpacity')}
                                    </Text>
                                    <Text
                                      fontFamily="mono"
                                      fontSize="xs"
                                      color="field.muted"
                                    >
                                      {Math.round(referenceFontOpacity * 100)}%
                                    </Text>
                                  </HStack>
                                  <Slider.Root
                                    min={5}
                                    max={100}
                                    step={5}
                                    value={[
                                      Math.round(referenceFontOpacity * 100),
                                    ]}
                                    onValueChange={(details) =>
                                      setReferenceFontOpacity(
                                        (details.value[0] ?? 100) / 100
                                      )
                                    }
                                  >
                                    <Slider.Control>
                                      <Slider.Track bg="field.panelMuted">
                                        <Slider.Range bg="field.yellow.400" />
                                      </Slider.Track>
                                      <Slider.Thumb index={0} />
                                    </Slider.Control>
                                  </Slider.Root>
                                </Box>
                              </Stack>
                            </Popover.Body>
                          </Popover.Content>
                        </Popover.Positioner>
                      </Popover.Root>
                    </HStack>
                  </Stack>
                </Box>

                <Box opacity={isComputingResidual ? 0.65 : 1}>
                  <HStack justify="space-between" align="center" mb={1}>
                    <Checkbox.Root
                      size="sm"
                      disabled={!referenceFontName || isComputingResidual}
                      onCheckedChange={(details) =>
                        void handleResidualToggle(details.checked === true)
                      }
                      checked={isResidualChecked || isComputingResidual}
                    >
                      <Checkbox.HiddenInput />
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <Checkbox.Label>
                        {t('editor.referenceFontResidualUse')}
                      </Checkbox.Label>
                    </Checkbox.Root>
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
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                size="sm"
                onClick={onClose}
                disabled={isComputingResidual}
              >
                {t('common.done')}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
