import {
  Alert,
  Button,
  Checkbox,
  HStack,
  NativeSelect,
  Stack,
  Tabs,
  Text,
  Separator,
  Field,
  Dialog,
  Portal,
} from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import { useMemo, useState } from 'react'
import {
  SlidingTabList,
  SlidingTabsContentGroup,
  SlidingTabsRoot,
} from 'src/features/common/SlidingTabList'
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
    <Alert.Root
      status="warning"
      variant="subtle"
      alignItems="flex-start"
      borderRadius="md"
    >
      <Alert.Indicator mt={1} />
      <Stack gap={1}>
        <Alert.Title fontSize="sm">Glyphs 3 component transform</Alert.Title>
        <Alert.Description fontSize="sm">
          匯出會用 matrix transform 保留 sheared components，請在 Glyphs
          重新開啟確認。
        </Alert.Description>
        <Stack as="ul" gap={1} mt={2} pl={4}>
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
    </Alert.Root>
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
    <Stack gap={2}>
      {warnings.map((warning) => {
        const translatedWarning = translateExportWarning(warning, t)

        return (
          <Alert.Root
            key={warning.id}
            status={getAlertStatus(warning.severity)}
            variant="subtle"
            alignItems="flex-start"
            borderRadius="md"
          >
            <Alert.Indicator mt={1} />
            <Stack gap={0}>
              <Alert.Title fontSize="sm">{translatedWarning.title}</Alert.Title>
              <Alert.Description fontSize="sm">
                {translatedWarning.message}
              </Alert.Description>
              {warning.details && warning.details.length > 0 && (
                <Stack as="ul" gap={1} mt={2} pl={4}>
                  {warning.details.map((detail) => (
                    <Text key={detail} as="li" fontSize="sm">
                      {detail}
                    </Text>
                  ))}
                </Stack>
              )}
            </Stack>
          </Alert.Root>
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
    <Checkbox.Root
      colorPalette="red"
      onCheckedChange={(details) => onChange(details.checked === true)}
      checked={isChecked}
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label>
        <Text as="span" fontSize="sm">
          {t('fontExport.iUnderstandUnsupportedImportedOpentypeLookups')}
        </Text>
      </Checkbox.Label>
    </Checkbox.Root>
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
      <Stack gap={3}>
        <Stack gap={0}>
          <Text fontSize="sm" fontWeight="semibold">
            {group.label}
          </Text>
          <Text fontSize="xs" color="mutedForeground">
            {group.description}
          </Text>
        </Stack>
        <Stack gap={1}>
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
                p={3}
                borderRadius="md"
                bg={isSelected ? 'muted' : 'transparent'}
                _hover={{ bg: 'muted' }}
                _focusVisible={{
                  boxShadow: '0 0 0 2px var(--chakra-colors-primary)',
                }}
                disabled={!canExport || isExporting}
                onClick={() => toggleFormat(option.format)}
                unstyled
              >
                <Stack gap={0.5} align="flex-start" textAlign="left">
                  <HStack gap={2}>
                    <Checkbox.Root pointerEvents="none" checked={isSelected}>
                      <Checkbox.HiddenInput />
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox.Root>
                    <Text fontWeight="semibold">{option.label}</Text>
                  </HStack>
                  <Text
                    pl={6}
                    fontSize="xs"
                    fontWeight="normal"
                    color="mutedForeground"
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
          <Separator />
          <Stack gap={3}>
            <Field.Root>
              <Field.Label textStyle="label">
                OpenType features 輸出方式
              </Field.Label>
              <NativeSelect.Root
                size="sm"
                disabled={!canExport || isExporting || !onExportPolicyChange}
              >
                <NativeSelect.Field
                  value={exportPolicy}
                  onChange={(event) =>
                    onExportPolicyChange?.(event.target.value as ExportPolicy)
                  }
                >
                  {exportPolicies.map((policy) => (
                    <option key={policy.value} value={policy.value}>
                      {policy.label}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Text mt={1.5} fontSize="xs" color="mutedForeground">
                {selectedExportPolicy?.description ??
                  '選擇字型檔匯出時，決定 OpenType features 要如何寫進輸出字型。'}
              </Text>
            </Field.Root>
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
        <Text fontSize="sm" color="mutedForeground">
          選擇字型檔後，可設定 OpenType features 的輸出方式與靜態 instance。
        </Text>
      ) : null}

      {hasSelectedBinaryFormat && exportableInstances.length > 0 ? (
        <>
          <Separator />
          <Stack gap={3}>
            <Text fontSize="sm" fontWeight="semibold">
              靜態 instance
            </Text>
            <Checkbox.Root
              disabled={!canExport || isExporting}
              onCheckedChange={(details) =>
                setIncludeDefaultBinary(details.checked === true)
              }
              checked={includeDefaultBinary}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Label>
                <Text as="span" fontSize="sm">
                  目前字型
                </Text>
              </Checkbox.Label>
            </Checkbox.Root>
            <Stack gap={2}>
              {exportableInstances.map((instance) => (
                <Checkbox.Root
                  key={instance.id}
                  disabled={!canExport || isExporting}
                  onCheckedChange={() => toggleInstance(instance.id)}
                  checked={selectedInstanceIds.includes(instance.id)}
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>
                    <Stack gap={0}>
                      <Text as="span" fontSize="sm">
                        {instance.name || instance.styleName}
                      </Text>
                      <Text
                        as="span"
                        fontSize="xs"
                        color="mutedForeground"
                        fontFamily="mono"
                      >
                        {JSON.stringify(instance.location)}
                      </Text>
                    </Stack>
                  </Checkbox.Label>
                </Checkbox.Root>
              ))}
            </Stack>
          </Stack>
        </>
      ) : null}
    </>
  )

  const renderGroupPanel = (group: (typeof visibleOptionGroups)[number]) => (
    <Stack gap={3}>
      {renderOptionGroup(group)}
      {group.id === 'source' ? (
        <GlyphsExportWarnings warnings={visibleGlyphsWarnings} />
      ) : (
        renderFontOutputSettings()
      )}
    </Stack>
  )

  return (
    <Dialog.Root
      open={isOpen}
      size="xl"
      onOpenChange={(e) => {
        if (!e.open) {
          closeModal()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxH="86vh" overflow="hidden">
            <DialogCloseButton zIndex={2} />
            <SlidingTabsRoot
              size="sm"
              display="flex"
              flexDirection="column"
              flex={1}
              maxH="inherit"
              minH={0}
              value={String(activeExportTabIndex)}
              onValueChange={(details) =>
                setActiveExportTabIndex(Number(details.value))
              }
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
              <Dialog.Body pb={5} overflowY="auto" flex={1} minH={0}>
                <SlidingTabsContentGroup mt={0}>
                  {visibleOptionGroups.map((group, index) => (
                    <Tabs.Content key={group.id} value={String(index)} p={0}>
                      {renderGroupPanel(group)}
                    </Tabs.Content>
                  ))}
                </SlidingTabsContentGroup>
              </Dialog.Body>
              <Dialog.Footer>
                <Button
                  variant="ghost"
                  onClick={closeModal}
                  disabled={isExporting}
                >
                  {t('fontExport.close')}
                </Button>
                <Button
                  ml={3}
                  disabled={!canSubmit}
                  loading={isExporting}
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
              </Dialog.Footer>
            </SlidingTabsRoot>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
