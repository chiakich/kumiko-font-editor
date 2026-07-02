import { useRef, useState } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  HStack,
  Input,
  Portal,
  SimpleGrid,
  Stack,
  Text,
  NativeSelect,
} from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import { useToast } from '@/components/ui/toast'
import { useStore } from 'src/store'
import type { FontAxis, FontData, FontSource } from 'src/store'
import {
  addMasterToProject,
  type AddMasterMethod,
} from 'src/lib/project/addMasterFromBinary'
import {
  parseMasterCandidates,
  type MasterCandidate,
} from 'src/lib/project/masterImportSource'
import {
  buildImportedMasterLayer,
  createImportedGlyphIndex,
} from 'src/font/masterFromBinary'
import {
  buildCopiedMasterLayer,
  buildEmptyMasterLayer,
} from 'src/font/masterLayerBuilders'
import { getGlyphMasterLayerForSource } from 'src/font/designspaceLocation'
import { isGlyphGeometryLoaded } from 'src/lib/glyph/glyphGeometryState'
import {
  makeId,
  parseNumber,
  type SourceDraft,
} from 'src/features/common/projectControl/fontSettings/utils/model'
import { useTranslation } from 'react-i18next'

interface AddMasterModalProps {
  isOpen: boolean
  axes: FontAxis[]
  sources: SourceDraft[]
  onClose: () => void
  onMasterAdded: (source: FontSource) => void
}

// Compute the new master's layer for each in-memory (loaded) glyph, mirroring the
// canonical write so the current view updates without a reload.
const buildLoadedGlyphLayers = (
  glyphs: FontData['glyphs'],
  method: AddMasterMethod,
  source: FontSource,
  importedGlyphs: Record<string, (typeof glyphs)[string]> | null,
  baseSourceId: string | null,
  offsetDistance: number
) => {
  const index =
    method === 'font' && importedGlyphs
      ? createImportedGlyphIndex(importedGlyphs)
      : null
  const layersByGlyphId: Record<
    string,
    NonNullable<(typeof glyphs)[string]['layers']>[string]
  > = {}
  for (const glyph of Object.values(glyphs)) {
    if (!isGlyphGeometryLoaded(glyph)) {
      continue
    }
    if (method === 'font') {
      const imported = index?.resolve(glyph)
      if (imported) {
        layersByGlyphId[glyph.id] = buildImportedMasterLayer(source, imported)
      }
      continue
    }
    const base = baseSourceId
      ? getGlyphMasterLayerForSource(glyph, baseSourceId)
      : null
    if (!base) {
      continue
    }
    layersByGlyphId[glyph.id] =
      method === 'copy'
        ? buildCopiedMasterLayer(source, base, offsetDistance)
        : buildEmptyMasterLayer(source, base)
  }
  return layersByGlyphId
}

export function AddMasterModal({
  isOpen,
  axes,
  sources,
  onClose,
  onMasterAdded,
}: AddMasterModalProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const projectId = useStore((state) => state.projectId)
  const applyImportedMaster = useStore((state) => state.applyImportedMaster)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)

  const [method, setMethod] = useState<AddMasterMethod>('font')
  const [name, setName] = useState('')
  const [location, setLocation] = useState<Record<string, number>>(() =>
    Object.fromEntries(axes.map((axis) => [axis.name, axis.defaultValue]))
  )
  const [candidates, setCandidates] = useState<MasterCandidate[]>([])
  const [candidateId, setCandidateId] = useState<string>('')
  const [createNewGlyphs, setCreateNewGlyphs] = useState(false)
  const [baseSourceId, setBaseSourceId] = useState<string>(sources[0]?.id ?? '')
  const [offsetDistance, setOffsetDistance] = useState('0')
  const [isBusy, setIsBusy] = useState(false)

  const selectedCandidate =
    candidates.find((candidate) => candidate.id === candidateId) ??
    candidates[0]

  const onFilesSelected = async (files: File[]) => {
    if (files.length === 0) {
      return
    }
    setIsBusy(true)
    try {
      const parsed = await parseMasterCandidates(files)
      setCandidates(parsed.candidates)
      const first = parsed.candidates[0]
      setCandidateId(first?.id ?? '')
      if (first) {
        setName(first.name)
        if (first.location) {
          setLocation((current) => ({ ...current, ...first.location }))
        }
      }
    } catch (error) {
      toast({
        title: t('projectControl.masterImportFailed'),
        description: error instanceof Error ? error.message : String(error),
        status: 'error',
        duration: 4200,
        isClosable: true,
      })
    } finally {
      setIsBusy(false)
    }
  }

  const confirm = async () => {
    if (!projectId) {
      return
    }
    if (method === 'font' && !selectedCandidate) {
      return
    }
    if ((method === 'empty' || method === 'copy') && !baseSourceId) {
      return
    }
    setIsBusy(true)
    try {
      const source: FontSource = {
        id: makeId('source'),
        name: name || 'Master',
        location,
        ...(method === 'font' && selectedCandidate?.lineMetrics
          ? { lineMetricsHorizontalLayout: selectedCandidate.lineMetrics }
          : {}),
      }

      const importedGlyphs = selectedCandidate?.glyphs ?? null
      const distance = parseNumber(offsetDistance) ?? 0
      const result = await addMasterToProject({
        projectId,
        source,
        now: Date.now(),
        method,
        importedGlyphs: importedGlyphs ?? undefined,
        createNewGlyphs: method === 'font' ? createNewGlyphs : false,
        baseSourceId: method === 'font' ? undefined : baseSourceId,
        offsetDistance: distance,
      })

      const layersByGlyphId = buildLoadedGlyphLayers(
        useStore.getState().fontData?.glyphs ?? {},
        method,
        source,
        importedGlyphs,
        method === 'font' ? null : baseSourceId,
        distance
      )
      applyImportedMaster({
        source,
        layersByGlyphId,
        newGlyphs: result.createdGlyphs,
      })
      onMasterAdded(source)
      toast({
        title: t('projectControl.masterAdded'),
        description: t('projectControl.masterAddedDetail', {
          matched: result.matchedCount,
          created: result.createdGlyphs.length,
        }),
        status: 'success',
        duration: 4200,
        isClosable: true,
      })
      onClose()
    } catch (error) {
      toast({
        title: t('projectControl.masterImportFailed'),
        description: error instanceof Error ? error.message : String(error),
        status: 'error',
        duration: 4200,
        isClosable: true,
      })
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Dialog.Root
      open={isOpen}
      size="lg"
      onOpenChange={(event) => {
        if (!event.open) {
          onClose()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="sm">
            <DialogCloseButton zIndex={2} />
            <Dialog.Header>
              <Dialog.Title>{t('projectControl.addMaster')}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2,.glyphs"
                style={{ display: 'none' }}
                onChange={(event) => {
                  void onFilesSelected(Array.from(event.target.files ?? []))
                  event.target.value = ''
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                /* @ts-expect-error non-standard directory picker attributes */
                webkitdirectory=""
                directory=""
                multiple
                style={{ display: 'none' }}
                onChange={(event) => {
                  void onFilesSelected(Array.from(event.target.files ?? []))
                  event.target.value = ''
                }}
              />
              <Stack gap={4}>
                <Field.Root>
                  <Field.Label fontSize="sm">
                    {t('projectControl.addMasterMethod')}
                  </Field.Label>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field
                      value={method}
                      onChange={(event) =>
                        setMethod(event.target.value as AddMasterMethod)
                      }
                    >
                      <option value="font">
                        {t('projectControl.addMasterFromFont')}
                      </option>
                      <option value="empty">
                        {t('projectControl.addMasterEmpty')}
                      </option>
                      <option value="copy">
                        {t('projectControl.addMasterCopy')}
                      </option>
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>

                {method === 'font' ? (
                  <Stack gap={3}>
                    <HStack gap={2}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {t('projectControl.chooseFile')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => folderInputRef.current?.click()}
                      >
                        {t('projectControl.chooseFolder')}
                      </Button>
                    </HStack>
                    {candidates.length > 1 ? (
                      <Field.Root>
                        <Field.Label fontSize="sm">
                          {t('projectControl.chooseMaster')}
                        </Field.Label>
                        <NativeSelect.Root size="sm">
                          <NativeSelect.Field
                            value={candidateId}
                            onChange={(event) => {
                              setCandidateId(event.target.value)
                              const next = candidates.find(
                                (candidate) =>
                                  candidate.id === event.target.value
                              )
                              if (next) {
                                setName(next.name)
                                if (next.location) {
                                  setLocation((current) => ({
                                    ...current,
                                    ...next.location,
                                  }))
                                }
                              }
                            }}
                          >
                            {candidates.map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.name}
                              </option>
                            ))}
                          </NativeSelect.Field>
                          <NativeSelect.Indicator />
                        </NativeSelect.Root>
                      </Field.Root>
                    ) : null}
                    <Checkbox.Root
                      checked={createNewGlyphs}
                      onCheckedChange={(details) =>
                        setCreateNewGlyphs(details.checked === true)
                      }
                    >
                      <Checkbox.HiddenInput />
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <Checkbox.Label>
                        {t('projectControl.createNewGlyphsForExtras')}
                      </Checkbox.Label>
                    </Checkbox.Root>
                  </Stack>
                ) : (
                  <Field.Root>
                    <Field.Label fontSize="sm">
                      {t('projectControl.baseMaster')}
                    </Field.Label>
                    <NativeSelect.Root size="sm">
                      <NativeSelect.Field
                        value={baseSourceId}
                        onChange={(event) =>
                          setBaseSourceId(event.target.value)
                        }
                      >
                        {sources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.name}
                          </option>
                        ))}
                      </NativeSelect.Field>
                      <NativeSelect.Indicator />
                    </NativeSelect.Root>
                  </Field.Root>
                )}

                {method === 'copy' ? (
                  <Field.Root>
                    <Field.Label fontSize="sm">
                      {t('projectControl.outlineOffset')}
                    </Field.Label>
                    <Input
                      value={offsetDistance}
                      onChange={(event) =>
                        setOffsetDistance(event.target.value)
                      }
                    />
                  </Field.Root>
                ) : null}

                <Field.Root>
                  <Field.Label fontSize="sm">
                    {t('projectControl.name')}
                  </Field.Label>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field.Root>

                {axes.length > 0 ? (
                  <SimpleGrid columns={{ base: 1, lg: 3 }} gap={3}>
                    {axes.map((axis) => (
                      <Field.Root key={axis.name}>
                        <Field.Label fontSize="sm">
                          {axis.label || axis.name}
                        </Field.Label>
                        <Input
                          value={String(
                            location[axis.name] ?? axis.defaultValue
                          )}
                          onChange={(event) =>
                            setLocation((current) => ({
                              ...current,
                              [axis.name]:
                                parseNumber(event.target.value) ??
                                axis.defaultValue,
                            }))
                          }
                        />
                      </Field.Root>
                    ))}
                  </SimpleGrid>
                ) : null}

                {method === 'font' ? (
                  <Text fontSize="xs" color="field.muted">
                    {t('projectControl.importMasterHint')}
                  </Text>
                ) : null}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer gap={3}>
              <Button variant="ghost" onClick={onClose} disabled={isBusy}>
                {t('projectControl.close')}
              </Button>
              <Button
                onClick={() => void confirm()}
                loading={isBusy}
                disabled={
                  method === 'font'
                    ? !selectedCandidate
                    : !baseSourceId || sources.length === 0
                }
              >
                {t('projectControl.createMaster')}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
