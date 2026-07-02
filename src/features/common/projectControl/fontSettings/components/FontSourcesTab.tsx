import { useRef, useState } from 'react'
import {
  Box,
  Button,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Field,
} from '@chakra-ui/react'
import { useToast } from '@/components/ui/toast'
import type { FontAxis, FontData, FontSource } from 'src/store'
import { useStore } from 'src/store'
import { defaultFontSource } from 'src/lib/fontFormats/fontInfoSettings'
import { importBinaryFontFile } from 'src/lib/fontFormats/fontBinaryFormat'
import { buildMasterFromBinaryFont } from 'src/font/masterFromBinary'
import { addMasterFromBinaryToProject } from 'src/lib/project/addMasterFromBinary'
import { isGlyphGeometryLoaded } from 'src/lib/glyph/glyphGeometryState'
import { NumberField } from 'src/features/common/projectControl/fontSettings/components/fields'
import {
  makeId,
  parseNumber,
  stringifyJson,
  type SourceDraft,
} from 'src/features/common/projectControl/fontSettings/utils/model'
import { useTranslation } from 'react-i18next'

interface FontSourcesTabProps {
  fontData: FontData | null
  axes: FontAxis[]
  sources: SourceDraft[]
  onSourcesChange: (sources: SourceDraft[]) => void
}

interface PendingBinaryMaster {
  fontData: FontData
  name: string
  location: Record<string, number>
}

export function FontSourcesTab({
  fontData,
  axes,
  sources,
  onSourcesChange,
}: FontSourcesTabProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const projectId = useStore((state) => state.projectId)
  const applyImportedMaster = useStore((state) => state.applyImportedMaster)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pending, setPending] = useState<PendingBinaryMaster | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const updateSource = (index: number, update: Partial<SourceDraft>) => {
    onSourcesChange(
      sources.map((source, sourceIndex) =>
        sourceIndex === index ? { ...source, ...update } : source
      )
    )
  }

  const defaultAxisLocation = () =>
    Object.fromEntries(axes.map((axis) => [axis.name, axis.defaultValue]))

  const onFileSelected = async (file: File | undefined) => {
    if (!file) {
      return
    }
    try {
      const imported = await importBinaryFontFile(file)
      setPending({
        fontData: imported.fontData,
        name:
          imported.fontData.fontInfo?.familyName ||
          file.name.replace(/\.[^.]+$/, '') ||
          `Source ${sources.length + 1}`,
        location: defaultAxisLocation(),
      })
    } catch (error) {
      toast({
        title: t('projectControl.masterImportFailed'),
        description: error instanceof Error ? error.message : String(error),
        status: 'error',
        duration: 4200,
        isClosable: true,
      })
    }
  }

  const confirmImport = async () => {
    if (!pending || !projectId) {
      return
    }
    setIsImporting(true)
    try {
      const source: FontSource = {
        id: makeId('source'),
        name: pending.name || `Source ${sources.length + 1}`,
        location: pending.location,
        lineMetricsHorizontalLayout:
          pending.fontData.lineMetricsHorizontalLayout,
      }
      // Persist to the canonical glyph records (eviction-safe).
      const result = await addMasterFromBinaryToProject({
        projectId,
        binaryFontData: pending.fontData,
        source,
        now: Date.now(),
      })
      // Mirror into the live store for glyphs currently in memory.
      const loadedGlyphs = Object.values(
        useStore.getState().fontData?.glyphs ?? {}
      ).filter(isGlyphGeometryLoaded)
      const built = buildMasterFromBinaryFont({
        glyphs: loadedGlyphs,
        binaryFontData: pending.fontData,
        source,
      })
      const layersByGlyphId: Record<
        string,
        NonNullable<FontData['glyphs'][string]['layers']>[string]
      > = {}
      for (const glyph of built.glyphs) {
        const layer = glyph.layers?.[source.id]
        if (layer) {
          layersByGlyphId[glyph.id] = layer
        }
      }
      applyImportedMaster({ source, layersByGlyphId })
      // Keep the settings-modal draft in sync so "Apply" doesn't drop the source.
      onSourcesChange([
        ...sources,
        { ...source, locationText: stringifyJson(source.location) },
      ])
      setPending(null)
      toast({
        title: t('projectControl.masterImported'),
        description: t('projectControl.masterImportedDetail', {
          matched: result.matchedCount,
          unmatched: result.unmatchedGlyphIds.length,
        }),
        status: 'success',
        duration: 4200,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: t('projectControl.masterImportFailed'),
        description: error instanceof Error ? error.message : String(error),
        status: 'error',
        duration: 4200,
        isClosable: true,
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Stack gap={3}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        style={{ display: 'none' }}
        onChange={(event) => {
          void onFileSelected(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <HStack justify="space-between">
        <Text fontWeight="semibold">{t('projectControl.sourcesTitle')}</Text>
        <HStack gap={2}>
          <Button
            size="sm"
            variant="outline"
            disabled={!projectId || isImporting}
            onClick={() => fileInputRef.current?.click()}
          >
            {t('projectControl.importMasterFromFont')}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              onSourcesChange([
                ...sources,
                {
                  ...defaultFontSource(
                    makeId('source'),
                    `Source ${sources.length + 1}`,
                    {
                      lineMetricsHorizontalLayout:
                        fontData?.lineMetricsHorizontalLayout,
                    }
                  ),
                  locationText: '{}',
                },
              ])
            }
          >
            {t('projectControl.add')}
          </Button>
        </HStack>
      </HStack>

      {pending ? (
        <Box
          borderWidth="1px"
          borderColor="field.accent"
          p={3}
          borderRadius="md"
        >
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            {t('projectControl.importMasterTitle')}
          </Text>
          <SimpleGrid columns={{ base: 1, lg: 3 }} gap={3}>
            <Field.Root>
              <Field.Label fontSize="sm">
                {t('projectControl.name')}
              </Field.Label>
              <Input
                value={pending.name}
                onChange={(event) =>
                  setPending({ ...pending, name: event.target.value })
                }
              />
            </Field.Root>
            {axes.map((axis) => (
              <NumberField
                key={axis.name}
                label={axis.label || axis.name}
                min={axis.minValue}
                max={axis.maxValue}
                value={pending.location[axis.name] ?? axis.defaultValue}
                onChange={(value) =>
                  setPending({
                    ...pending,
                    location: {
                      ...pending.location,
                      [axis.name]: parseNumber(value) ?? axis.defaultValue,
                    },
                  })
                }
              />
            ))}
          </SimpleGrid>
          <Text fontSize="xs" color="field.muted" mt={2}>
            {t('projectControl.importMasterHint')}
          </Text>
          <HStack justify="flex-end" mt={3} gap={2}>
            <Button
              size="sm"
              variant="ghost"
              disabled={isImporting}
              onClick={() => setPending(null)}
            >
              {t('projectControl.close')}
            </Button>
            <Button
              size="sm"
              loading={isImporting}
              onClick={() => void confirmImport()}
            >
              {t('projectControl.createMaster')}
            </Button>
          </HStack>
        </Box>
      ) : null}

      {sources.map((source, index) => (
        <Box key={source.id} borderWidth="1px" p={3}>
          <SimpleGrid columns={{ base: 1, lg: 3 }} gap={3}>
            <Field.Root>
              <Field.Label fontSize="sm">
                {t('projectControl.name')}
              </Field.Label>
              <Input
                value={source.name}
                onChange={(event) =>
                  updateSource(index, { name: event.target.value })
                }
              />
            </Field.Root>
            <NumberField
              label={t('projectControl.italicAngle')}
              value={source.italicAngle}
              onChange={(value) =>
                updateSource(index, {
                  italicAngle: parseNumber(value) ?? 0,
                })
              }
            />
            <Field.Root>
              <Field.Label fontSize="sm">
                {t('projectControl.locationJson')}
              </Field.Label>
              <Input
                fontFamily="mono"
                value={source.locationText}
                onChange={(event) =>
                  updateSource(index, { locationText: event.target.value })
                }
              />
            </Field.Root>
          </SimpleGrid>
          <SimpleGrid columns={{ base: 1, lg: 4 }} gap={3} mt={3}>
            {(['ascender', 'descender', 'xHeight', 'capHeight'] as const).map(
              (metric) => (
                <NumberField
                  key={metric}
                  label={metric}
                  value={source.lineMetricsHorizontalLayout?.[metric]?.value}
                  onChange={(value) =>
                    updateSource(index, {
                      lineMetricsHorizontalLayout: {
                        ...(source.lineMetricsHorizontalLayout ?? {}),
                        [metric]: {
                          value: parseNumber(value) ?? 0,
                        },
                      },
                    })
                  }
                />
              )
            )}
          </SimpleGrid>
          <HStack justify="flex-end" mt={3}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onSourcesChange(
                  sources.filter((_, itemIndex) => itemIndex !== index)
                )
              }
            >
              {t('projectControl.remove')}
            </Button>
          </HStack>
        </Box>
      ))}
    </Stack>
  )
}
