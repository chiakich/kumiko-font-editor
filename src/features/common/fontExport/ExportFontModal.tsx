import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormLabel,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalOverlay,
  Select,
  Stack,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { SlidingTabList } from 'src/features/common/SlidingTabList'
import type { GlyphsExportWarning } from 'src/lib/fontFormats/glyphsExport'
import type {
  ExportPolicy,
  OpenTypeExportWarning,
} from 'src/lib/openTypeFeatures'
import { requiresDropUnsupportedConfirmation } from 'src/lib/openTypeFeatures/exportPolicy'
import type { ProjectSourceFormat } from 'src/lib/project/projectFormats'
import type { FontExportInstance } from 'src/store'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

export type FontExportFormat =
  | 'zip'
  | 'glyphs2'
  | 'glyphs3'
  | 'glyphspackage'
  | 'variable-otf'
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
  canExportVariableFont?: boolean
  exportPolicy?: ExportPolicy | null
  // Source format of the open project; gates the .glyphspackage round-trip option.
  sourceFormat?: ProjectSourceFormat | null
  onClose: () => void
  onExport: (formats: FontExportFormat[], options?: FontExportOptions) => void
  onExportPolicyChange?: (policy: ExportPolicy) => void
}

const exportOptions: Array<{
  format: FontExportFormat
  label: string
  description: string
  group: 'source' | 'font'
  // When set, only show this option for the matching project source format.
  sourceFormat?: ProjectSourceFormat
  requiresVariableFont?: boolean
}> = [
  {
    format: 'zip',
    label: 'UFO (ZIP)',
    description: '可再匯入或交給其他字型工具編輯。',
    group: 'source',
  },
  {
    format: 'glyphs2',
    label: 'Glyphs 2 (.glyphs)',
    description: '匯出 Glyphs 2 相容檔案，使用 paths/components 結構。',
    group: 'source',
  },
  {
    format: 'glyphs3',
    label: 'Glyphs 3 (.glyphs)',
    description: '匯出 Glyphs 3 相容檔案，使用 shapes 與 tuple nodes。',
    group: 'source',
  },
  {
    format: 'glyphspackage',
    label: 'Glyphs Package (ZIP)',
    description: '回存 .glyphspackage 內容，打包成 ZIP。',
    group: 'source',
    sourceFormat: 'glyphspackage',
  },
  {
    format: 'variable-otf',
    label: 'Variable OTF',
    description:
      '使用 fontTools 建立含 fvar/CFF2 variation tables 的可變字型。',
    group: 'font',
    requiresVariableFont: true,
  },
  {
    format: 'ttf',
    label: 'TTF',
    description: 'TrueType 字型檔。',
    group: 'font',
  },
  {
    format: 'otf',
    label: 'OTF',
    description: 'OpenType 字型檔。',
    group: 'font',
  },
  {
    format: 'woff',
    label: 'WOFF',
    description: '網頁字型格式。',
    group: 'font',
  },
  {
    format: 'woff2',
    label: 'WOFF2',
    description: '壓縮率較高的網頁字型格式。',
    group: 'font',
  },
]

const exportOptionGroups: Array<{
  id: 'source' | 'font'
  label: string
  description: string
}> = [
  {
    id: 'source',
    label: '工作檔',
    description: '保留編輯結構，適合備份、同步或交給其他字型工具。',
  },
  {
    id: 'font',
    label: '字型檔',
    description: '產生可安裝或可在網頁使用的字型輸出。',
  },
]

const binaryFormats = new Set<FontExportFormat>(['ttf', 'otf', 'woff', 'woff2'])
const fontOutputFormats = new Set<FontExportFormat>([
  'variable-otf',
  'ttf',
  'otf',
  'woff',
  'woff2',
])

const isBinaryFormat = (format: FontExportFormat) => binaryFormats.has(format)
const isFontOutputFormat = (format: FontExportFormat) =>
  fontOutputFormats.has(format)

const exportPolicies: Array<{
  value: ExportPolicy
  label: string
  description: string
}> = [
  {
    value: 'rebuild-managed-layout-tables',
    label: '套用目前編輯',
    description:
      '用 Kumiko 目前的 OpenType feature 編輯重建輸出字型；匯入但無法表示的 lookup 可能不會保留。',
  },
  {
    value: 'preserve-compiled-layout-tables',
    label: '沿用原始表',
    description:
      '保留匯入字型原本已編譯的 GSUB/GPOS/GDEF；目前在 Kumiko 裡的 feature 編輯不會輸出。',
  },
  {
    value: 'drop-unsupported-and-rebuild',
    label: '捨棄不支援項目後套用',
    description:
      '先移除 Kumiko 無法編輯或無法表示的 imported lookups，再輸出目前可重建的 feature 編輯。',
  },
]

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
  const { t } = useTranslation()

  if (warnings.length === 0) {
    return null
  }

  return (
    <Stack spacing={2}>
      {warnings.map((warning) => {
        const translatedWarning = translateExportWarning(warning, t)

        return (
          <Alert
            key={warning.id}
            status={getAlertStatus(warning.severity)}
            variant="subtle"
            alignItems="flex-start"
            borderRadius="md"
          >
            <AlertIcon mt={1} />
            <Stack spacing={0}>
              <AlertTitle fontSize="sm">{translatedWarning.title}</AlertTitle>
              <AlertDescription fontSize="sm">
                {translatedWarning.message}
              </AlertDescription>
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
        )
      })}
    </Stack>
  )
}

function translateExportWarning(warning: OpenTypeExportWarning, t: TFunction) {
  const keyPrefix = `projectControl.exportWarning.${warning.code}`

  return {
    title: t(`${keyPrefix}.title`, { defaultValue: warning.title }),
    message: t(`${keyPrefix}.message`, {
      count: warning.details?.length ?? 0,
      defaultValue: warning.message,
    }),
  }
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
  canExportVariableFont = false,
  exportPolicy = null,
  sourceFormat = null,
  onClose,
  onExport,
  onExportPolicyChange,
}: ExportFontModalProps) {
  const { t } = useTranslation()

  const visibleOptions = exportOptions.filter(
    (option) =>
      (!option.sourceFormat || option.sourceFormat === sourceFormat) &&
      (!option.requiresVariableFont || canExportVariableFont)
  )
  const visibleOptionGroups = exportOptionGroups
    .map((group) => ({
      ...group,
      options: visibleOptions.filter((option) => option.group === group.id),
    }))
    .filter((group) => group.options.length > 0)
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
  const [activeExportTabIndex, setActiveExportTabIndex] = useState(0)
  const needsDropUnsupportedConfirmation =
    requiresDropUnsupportedConfirmation(openTypeWarnings)
  const hasSelectedBinaryFormat = selectedFormats.some(isBinaryFormat)
  const hasSelectedFontOutputFormat = selectedFormats.some(isFontOutputFormat)
  const needsVisibleDropUnsupportedConfirmation =
    hasSelectedFontOutputFormat && needsDropUnsupportedConfirmation
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
  const selectedExportPolicy = exportPolicies.find(
    (policy) => policy.value === exportPolicy
  )
  const exportTabLabels = visibleOptionGroups.map((group) => {
    const selectedFormatCount = group.options.filter((option) =>
      selectedFormats.includes(option.format)
    ).length

    return selectedFormatCount > 0
      ? `${group.label} (${selectedFormatCount})`
      : group.label
  })
  const canSubmit =
    canExport &&
    selectedFormats.length > 0 &&
    !isExporting &&
    hasBinaryTarget &&
    (!needsVisibleDropUnsupportedConfirmation || confirmedDropUnsupported)

  const closeModal = () => {
    setConfirmedDropUnsupported(false)
    setIncludeDefaultBinary(true)
    setExcludedInstanceIds([])
    setActiveExportTabIndex(0)
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

  const renderOptionGroup = (
    group: (typeof visibleOptionGroups)[number] | undefined
  ) => {
    if (!group) {
      return null
    }

    return (
      <Stack spacing={3}>
        <Stack spacing={0}>
          <Text fontSize="sm" fontWeight="semibold">
            {group.label}
          </Text>
          <Text fontSize="xs" color="field.muted">
            {group.description}
          </Text>
        </Stack>
        <Stack spacing={1}>
          {group.options.map((option) => {
            const isSelected = selectedFormats.includes(option.format)
            return (
              <Button
                key={option.format}
                h="auto"
                minH="58px"
                justifyContent="flex-start"
                alignItems="flex-start"
                whiteSpace="normal"
                variant="unstyled"
                p={3}
                borderRadius="md"
                bg={isSelected ? 'field.panelMuted' : 'transparent'}
                _hover={{ bg: 'field.panelMuted' }}
                _focusVisible={{
                  boxShadow: '0 0 0 2px var(--chakra-colors-field-accent)',
                }}
                isDisabled={!canExport || isExporting}
                onClick={() => toggleFormat(option.format)}
              >
                <Stack spacing={0.5} align="flex-start" textAlign="left">
                  <HStack spacing={2}>
                    <Checkbox isChecked={isSelected} pointerEvents="none" />
                    <Text fontWeight="semibold">{option.label}</Text>
                  </HStack>
                  <Text
                    pl={6}
                    fontSize="xs"
                    fontWeight="normal"
                    color="field.muted"
                  >
                    {option.description}
                  </Text>
                </Stack>
              </Button>
            )
          })}
        </Stack>
      </Stack>
    )
  }

  const renderFontOutputSettings = () => (
    <>
      {hasSelectedFontOutputFormat && exportPolicy ? (
        <>
          <Divider />
          <Stack spacing={3}>
            <FormControl>
              <FormLabel fontSize="sm">OpenType features 輸出方式</FormLabel>
              <Select
                size="sm"
                value={exportPolicy}
                isDisabled={!canExport || isExporting || !onExportPolicyChange}
                onChange={(event) =>
                  onExportPolicyChange?.(event.target.value as ExportPolicy)
                }
              >
                {exportPolicies.map((policy) => (
                  <option key={policy.value} value={policy.value}>
                    {policy.label}
                  </option>
                ))}
              </Select>
              <Text mt={1.5} fontSize="xs" color="field.muted">
                {selectedExportPolicy?.description ??
                  '選擇字型檔匯出時，決定 OpenType features 要如何寫進輸出字型。'}
              </Text>
            </FormControl>
            <OpenTypeExportWarnings warnings={openTypeWarnings} />
            {needsVisibleDropUnsupportedConfirmation && (
              <DropUnsupportedConfirmation
                isChecked={confirmedDropUnsupported}
                onChange={setConfirmedDropUnsupported}
              />
            )}
          </Stack>
        </>
      ) : !hasSelectedFontOutputFormat ? (
        <Text fontSize="sm" color="field.muted">
          選擇字型檔後，可設定 OpenType features 的輸出方式與靜態 instance。
        </Text>
      ) : null}

      {hasSelectedBinaryFormat && exportableInstances.length > 0 ? (
        <>
          <Divider />
          <Stack spacing={3}>
            <Text fontSize="sm" fontWeight="semibold">
              靜態 instance
            </Text>
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
      ) : null}
    </>
  )

  const renderGroupPanel = (group: (typeof visibleOptionGroups)[number]) => (
    <Stack spacing={3}>
      {renderOptionGroup(group)}
      {group.id === 'source' ? (
        <GlyphsExportWarnings warnings={visibleGlyphsWarnings} />
      ) : (
        renderFontOutputSettings()
      )}
    </Stack>
  )

  return (
    <Modal isOpen={isOpen} onClose={closeModal} size="3xl">
      <ModalOverlay />
      <ModalContent maxH="86vh" overflow="hidden">
        <ModalCloseButton zIndex={2} />
        <Tabs
          variant="enclosed"
          size="sm"
          display="flex"
          flexDirection="column"
          flex={1}
          maxH="inherit"
          minH={0}
          index={activeExportTabIndex}
          onChange={setActiveExportTabIndex}
        >
          <HStack
            align="center"
            justify="space-between"
            gap={4}
            px={6}
            pt={5}
            pb={3}
            pr={14}
          >
            <Text as="h2" fontSize="xl" fontWeight="900">
              {t('fontExport.exportFont')}
            </Text>
            <SlidingTabList
              activeIndex={activeExportTabIndex}
              labels={exportTabLabels}
              layoutGroupId="font-export-modal-tabs"
            />
          </HStack>
          <ModalBody pb={5} overflowY="auto" flex={1} minH={0}>
            <TabPanels>
              {visibleOptionGroups.map((group) => (
                <TabPanel key={group.id} p={0}>
                  {renderGroupPanel(group)}
                </TabPanel>
              ))}
            </TabPanels>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="ghost"
              onClick={closeModal}
              isDisabled={isExporting}
            >
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
        </Tabs>
      </ModalContent>
    </Modal>
  )
}
