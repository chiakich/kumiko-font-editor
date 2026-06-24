import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Button,
  Checkbox,
  Divider,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import type { GlyphsExportWarning } from 'src/lib/fontFormats/glyphsExport'
import type { OpenTypeExportWarning } from 'src/lib/openTypeFeatures'
import { requiresDropUnsupportedConfirmation } from 'src/lib/openTypeFeatures/exportPolicy'
import type { ProjectSourceFormat } from 'src/lib/project/projectFormats'
import type { FontExportInstance } from 'src/store'
import { useTranslation } from 'react-i18next'

export type FontExportFormat =
  | 'zip'
  | 'glyphs2'
  | 'glyphs3'
  | 'glyphspackage'
  | 'ttf'
  | 'otf'
  | 'woff'
  | 'woff2'

export interface FontExportOptions {
  includeDefaultBinary?: boolean
  instanceIds?: string[]
}

interface ExportFontModalProps {
  isOpen: boolean
  canExport: boolean
  isExporting: boolean
  loadingText: string
  openTypeWarnings?: OpenTypeExportWarning[]
  glyphsWarnings?: GlyphsExportWarning[]
  exportInstances?: FontExportInstance[]
  // Source format of the open project; gates the .glyphspackage round-trip option.
  sourceFormat?: ProjectSourceFormat | null
  onClose: () => void
  onExport: (formats: FontExportFormat[], options?: FontExportOptions) => void
}

const exportOptions: Array<{
  format: FontExportFormat
  label: string
  description: string
  // When set, only show this option for the matching project source format.
  sourceFormat?: ProjectSourceFormat
}> = [
  {
    format: 'zip',
    label: 'UFO (ZIP)',
    description: '可再匯入或交給其他字型工具編輯。',
  },
  {
    format: 'glyphs2',
    label: 'Glyphs 2 (.glyphs)',
    description: '匯出 Glyphs 2 相容檔案，使用 paths/components 結構。',
  },
  {
    format: 'glyphs3',
    label: 'Glyphs 3 (.glyphs)',
    description: '匯出 Glyphs 3 相容檔案，使用 shapes 與 tuple nodes。',
  },
  {
    format: 'glyphspackage',
    label: 'Glyphs Package (ZIP)',
    description: '回存 .glyphspackage 內容，打包成 ZIP。',
    sourceFormat: 'glyphspackage',
  },
  {
    format: 'ttf',
    label: 'TTF',
    description: 'TrueType 字型檔。',
  },
  {
    format: 'otf',
    label: 'OTF',
    description: 'OpenType 字型檔。',
  },
  {
    format: 'woff',
    label: 'WOFF',
    description: '網頁字型格式。',
  },
  {
    format: 'woff2',
    label: 'WOFF2',
    description: '壓縮率較高的網頁字型格式。',
  },
]

const binaryFormats = new Set<FontExportFormat>(['ttf', 'otf', 'woff', 'woff2'])

const isBinaryFormat = (format: FontExportFormat) => binaryFormats.has(format)

type ExportWarningSeverity = OpenTypeExportWarning['severity']

const getAlertStatus = (severity: ExportWarningSeverity) => {
  if (severity === 'error') {
    return 'error'
  }
  if (severity === 'warning') {
    return 'warning'
  }
  return 'info'
}

function GlyphsExportWarnings({
  warnings,
}: {
  warnings: GlyphsExportWarning[]
}) {
  if (warnings.length === 0) {
    return null
  }

  const previewWarnings = warnings.slice(0, 5)
  const hiddenCount = warnings.length - previewWarnings.length

  return (
    <Alert
      status="warning"
      variant="subtle"
      alignItems="flex-start"
      borderRadius="md"
    >
      <AlertIcon mt={1} />
      <Stack spacing={1}>
        <AlertTitle fontSize="sm">Glyphs 3 component transform</AlertTitle>
        <AlertDescription fontSize="sm">
          匯出會用 matrix transform 保留 sheared components，請在 Glyphs
          重新開啟確認。
        </AlertDescription>
        <Stack as="ul" spacing={1} mt={2} pl={4}>
          {previewWarnings.map((warning) => (
            <Text
              key={`${warning.glyphId}:${warning.layerId}:${warning.componentId}`}
              as="li"
              fontSize="sm"
            >
              {warning.glyphId} / {warning.layerId} / {warning.componentId}
            </Text>
          ))}
          {hiddenCount > 0 && (
            <Text as="li" fontSize="sm">
              還有 {hiddenCount} 個 component
            </Text>
          )}
        </Stack>
      </Stack>
    </Alert>
  )
}

function OpenTypeExportWarnings({
  warnings,
}: {
  warnings: OpenTypeExportWarning[]
}) {
  if (warnings.length === 0) {
    return null
  }

  return (
    <Stack spacing={2}>
      {warnings.map((warning) => (
        <Alert
          key={warning.id}
          status={getAlertStatus(warning.severity)}
          variant="subtle"
          alignItems="flex-start"
          borderRadius="md"
        >
          <AlertIcon mt={1} />
          <Stack spacing={0}>
            <AlertTitle fontSize="sm">{warning.title}</AlertTitle>
            <AlertDescription fontSize="sm">{warning.message}</AlertDescription>
            {warning.details && warning.details.length > 0 && (
              <Stack as="ul" spacing={1} mt={2} pl={4}>
                {warning.details.map((detail) => (
                  <Text key={detail} as="li" fontSize="sm">
                    {detail}
                  </Text>
                ))}
              </Stack>
            )}
          </Stack>
        </Alert>
      ))}
    </Stack>
  )
}

function DropUnsupportedConfirmation({
  isChecked,
  onChange,
}: {
  isChecked: boolean
  onChange: (isChecked: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <Checkbox
      colorScheme="red"
      isChecked={isChecked}
      onChange={(event) => onChange(event.target.checked)}
    >
      <Text as="span" fontSize="sm">
        {t('fontExport.iUnderstandUnsupportedImportedOpentypeLookups')}
      </Text>
    </Checkbox>
  )
}

export function ExportFontModal({
  isOpen,
  canExport,
  isExporting,
  loadingText,
  openTypeWarnings = [],
  glyphsWarnings = [],
  exportInstances = [],
  sourceFormat = null,
  onClose,
  onExport,
}: ExportFontModalProps) {
  const { t } = useTranslation()

  const visibleOptions = exportOptions.filter(
    (option) => !option.sourceFormat || option.sourceFormat === sourceFormat
  )
  const exportableInstances = useMemo(
    () => exportInstances.filter((instance) => instance.export !== false),
    [exportInstances]
  )

  const [selectedFormats, setSelectedFormats] = useState<FontExportFormat[]>([
    'zip',
  ])
  const [includeDefaultBinary, setIncludeDefaultBinary] = useState(true)
  const [excludedInstanceIds, setExcludedInstanceIds] = useState<string[]>([])
  const [confirmedDropUnsupported, setConfirmedDropUnsupported] =
    useState(false)
  const needsDropUnsupportedConfirmation =
    requiresDropUnsupportedConfirmation(openTypeWarnings)
  const hasSelectedBinaryFormat = selectedFormats.some(isBinaryFormat)
  const selectedInstanceIds = exportableInstances
    .map((instance) => instance.id)
    .filter((instanceId) => !excludedInstanceIds.includes(instanceId))
  const selectedBinaryTargetCount =
    (includeDefaultBinary ? 1 : 0) + selectedInstanceIds.length
  const hasBinaryTarget =
    !hasSelectedBinaryFormat || selectedBinaryTargetCount > 0
  const showsGlyphs3Warnings =
    selectedFormats.includes('glyphs3') ||
    selectedFormats.includes('glyphspackage')
  const visibleGlyphsWarnings = showsGlyphs3Warnings ? glyphsWarnings : []
  const canSubmit =
    canExport &&
    selectedFormats.length > 0 &&
    !isExporting &&
    hasBinaryTarget &&
    (!needsDropUnsupportedConfirmation || confirmedDropUnsupported)

  const closeModal = () => {
    setConfirmedDropUnsupported(false)
    setIncludeDefaultBinary(true)
    setExcludedInstanceIds([])
    onClose()
  }

  const toggleFormat = (format: FontExportFormat) => {
    setSelectedFormats((current) =>
      current.includes(format)
        ? current.filter((item) => item !== format)
        : [...current, format]
    )
  }

  const toggleInstance = (instanceId: string) => {
    setExcludedInstanceIds((current) =>
      current.includes(instanceId)
        ? current.filter((item) => item !== instanceId)
        : [...current, instanceId]
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={closeModal} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t('fontExport.exportFont')}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={3}>
            <OpenTypeExportWarnings warnings={openTypeWarnings} />
            <GlyphsExportWarnings warnings={visibleGlyphsWarnings} />
            {needsDropUnsupportedConfirmation && (
              <DropUnsupportedConfirmation
                isChecked={confirmedDropUnsupported}
                onChange={setConfirmedDropUnsupported}
              />
            )}
            {visibleOptions.map((option) => (
              <Button
                key={option.format}
                h="auto"
                minH="88px"
                justifyContent="flex-start"
                alignItems="flex-start"
                whiteSpace="normal"
                variant="unstyled"
                p={4}
                borderColor={
                  selectedFormats.includes(option.format)
                    ? 'field.accent'
                    : undefined
                }
                isDisabled={!canExport || isExporting}
                onClick={() => toggleFormat(option.format)}
              >
                <Stack spacing={1} align="flex-start" textAlign="left">
                  <HStack spacing={2}>
                    <Checkbox
                      isChecked={selectedFormats.includes(option.format)}
                      pointerEvents="none"
                    />
                    <Text fontWeight="semibold">{option.label}</Text>
                  </HStack>
                  <Text fontSize="sm" fontWeight="normal" color="gray.500">
                    {option.description}
                  </Text>
                </Stack>
              </Button>
            ))}
            {hasSelectedBinaryFormat && exportableInstances.length > 0 && (
              <>
                <Divider />
                <Stack spacing={3}>
                  <Text fontWeight="semibold">Binary 靜態輸出</Text>
                  <Checkbox
                    isChecked={includeDefaultBinary}
                    isDisabled={!canExport || isExporting}
                    onChange={(event) =>
                      setIncludeDefaultBinary(event.target.checked)
                    }
                  >
                    <Text as="span" fontSize="sm">
                      目前字型
                    </Text>
                  </Checkbox>
                  <Stack spacing={2}>
                    {exportableInstances.map((instance) => (
                      <Checkbox
                        key={instance.id}
                        isChecked={selectedInstanceIds.includes(instance.id)}
                        isDisabled={!canExport || isExporting}
                        onChange={() => toggleInstance(instance.id)}
                      >
                        <Stack spacing={0}>
                          <Text as="span" fontSize="sm">
                            {instance.name || instance.styleName}
                          </Text>
                          <Text
                            as="span"
                            fontSize="xs"
                            color="field.muted"
                            fontFamily="mono"
                          >
                            {JSON.stringify(instance.location)}
                          </Text>
                        </Stack>
                      </Checkbox>
                    ))}
                  </Stack>
                </Stack>
              </>
            )}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={closeModal} isDisabled={isExporting}>
            {t('fontExport.close')}
          </Button>
          <Button
            ml={3}
            isDisabled={!canSubmit}
            isLoading={isExporting}
            loadingText={loadingText}
            onClick={() =>
              onExport(selectedFormats, {
                includeDefaultBinary,
                instanceIds: selectedInstanceIds,
              })
            }
          >
            {t('fontExport.export')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
