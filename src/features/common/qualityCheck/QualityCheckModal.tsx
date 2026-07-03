import {
  Badge,
  Box,
  Button,
  HStack,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Dialog,
  Portal,
} from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { FrameSelect, GraphUp, List, MessageText } from 'iconoir-react'
import {
  SlidingTabList,
  SlidingTabsContentGroup,
  SlidingTabsRoot,
} from 'src/features/common/SlidingTabList'
import { useStore } from 'src/store'
import { LintPanel } from 'src/features/common/qualityCheck/components/LintPanel'
import { MixedProofPanel } from 'src/features/common/qualityCheck/components/MixedProofPanel'
import { GrayProofPanel } from 'src/features/common/qualityCheck/components/GrayProofPanel'
import { StructurePanel } from 'src/features/common/qualityCheck/components/StructurePanel'
import type { QualityCheckMode } from 'src/features/common/qualityCheck/types'
import {
  buildQualityReport,
  type QualityIssue,
  type QualityReport,
  type QualityScope,
} from 'src/lib/qualityCheck/qualityLint'
import { mixedProofPresets } from 'src/lib/qualityCheck/qualityProof'
import { useTranslation } from 'react-i18next'

interface QualityCheckModalProps {
  isOpen: boolean
  onClose: () => void
  /** 'font'＝右上角入口檢查全部字；'selected'＝總覽複選後只檢查選取的字 */
  mode?: QualityCheckMode
  initialScope?: Exclude<QualityScope, 'selected'>
  selectedGlyphIds?: string[]
}

const scopeOptions: Array<{
  id: Exclude<QualityScope, 'current' | 'selected'>
  labelKey: string
}> = [
  { id: 'changed', labelKey: 'qualityCheck.scope.changed' },
  { id: 'font', labelKey: 'qualityCheck.scope.font' },
]

const EMPTY_SELECTED_GLYPH_IDS: string[] = []

const scopeLabelKeys: Record<QualityScope, string> = {
  changed: 'qualityCheck.scope.changed',
  current: 'qualityCheck.scope.current',
  selected: 'qualityCheck.scope.selected',
  font: 'qualityCheck.scope.font',
}

const EMPTY_QUALITY_REPORT: QualityReport = {
  glyphs: [],
  issues: [],
  summary: {
    glyphCount: 0,
    blockingCount: 0,
    warningCount: 0,
    infoCount: 0,
    deletedCount: null,
    hasBlockingIssues: false,
  },
}

type FontQualityScope = Exclude<QualityScope, 'current' | 'selected'>

export function QualityCheckModal({
  isOpen,
  onClose,
  mode = 'font',
  initialScope = 'changed',
  selectedGlyphIds = EMPTY_SELECTED_GLYPH_IDS,
}: QualityCheckModalProps) {
  if (mode === 'selected') {
    return (
      <SelectedGlyphQualityCheckModal
        isOpen={isOpen}
        onClose={onClose}
        selectedGlyphIds={selectedGlyphIds}
      />
    )
  }

  return (
    <FontQualityCheckModal
      isOpen={isOpen}
      onClose={onClose}
      initialScope={initialScope}
    />
  )
}

export function FontQualityCheckModal({
  isOpen,
  onClose,
  initialScope = 'changed',
}: Pick<QualityCheckModalProps, 'isOpen' | 'onClose' | 'initialScope'>) {
  const [scope, setScope] = useState<FontQualityScope>(
    initialScope === 'font' ? 'font' : 'changed'
  )

  return (
    <QualityCheckDialog
      isOpen={isOpen}
      onClose={onClose}
      scope={scope}
      scopeControl={<ScopeSelector scope={scope} onScopeChange={setScope} />}
    />
  )
}

export function SelectedGlyphQualityCheckModal({
  isOpen,
  onClose,
  selectedGlyphIds = EMPTY_SELECTED_GLYPH_IDS,
}: Pick<QualityCheckModalProps, 'isOpen' | 'onClose' | 'selectedGlyphIds'>) {
  return (
    <QualityCheckDialog
      isOpen={isOpen}
      onClose={onClose}
      scope="selected"
      selectedGlyphIds={selectedGlyphIds}
    />
  )
}

function QualityCheckDialog({
  isOpen,
  onClose,
  scope,
  selectedGlyphIds = EMPTY_SELECTED_GLYPH_IDS,
  scopeControl = null,
}: {
  isOpen: boolean
  onClose: () => void
  scope: QualityScope
  selectedGlyphIds?: string[]
  scopeControl?: ReactNode
}) {
  const { t } = useTranslation()
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [proofText, setProofText] = useState(mixedProofPresets[0])
  const fontData = useStore((state) => state.fontData)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const localDirtyGlyphIds = useStore((state) => state.localDirtyGlyphIds)
  const localDeletedGlyphIds = useStore((state) => state.localDeletedGlyphIds)
  const addGlyphToEditor = useStore((state) => state.addGlyphToEditor)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)
  const isWholeFontScope = scope === 'font'
  const scopeLabel = t(scopeLabelKeys[scope])
  const qualityTabLabels = [
    <TabLabel key="lint" icon={<List width={15} height={15} />}>
      {t('qualityCheck.tabs.lint')}
    </TabLabel>,
    <TabLabel key="mixed-proof" icon={<MessageText width={15} height={15} />}>
      {t('qualityCheck.tabs.mixedProof')}
    </TabLabel>,
    <TabLabel key="gray-proof" icon={<GraphUp width={15} height={15} />}>
      {t('qualityCheck.tabs.grayProof')}
    </TabLabel>,
    <TabLabel key="structure" icon={<FrameSelect width={15} height={15} />}>
      {t('qualityCheck.tabs.structure')}
    </TabLabel>,
  ]
  const [qualityReport, setQualityReport] =
    useState<QualityReport>(EMPTY_QUALITY_REPORT)
  const [isReportPending, setIsReportPending] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setActiveTabIndex(0)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isOpen, scope])

  useEffect(() => {
    let reportTimeoutId: number | undefined

    const stateTimeoutId = window.setTimeout(() => {
      if (!isOpen) {
        setQualityReport(EMPTY_QUALITY_REPORT)
        setIsReportPending(false)
        return
      }

      setIsReportPending(true)
      setQualityReport(EMPTY_QUALITY_REPORT)
      reportTimeoutId = window.setTimeout(() => {
        setQualityReport(
          buildQualityReport({
            fontData,
            scope,
            selectedGlyphId,
            selectedGlyphIds,
            dirtyGlyphIds: localDirtyGlyphIds,
            deletedGlyphIds: localDeletedGlyphIds,
          })
        )
        setIsReportPending(false)
      }, 0)
    }, 0)

    return () => {
      window.clearTimeout(stateTimeoutId)
      if (reportTimeoutId !== undefined) {
        window.clearTimeout(reportTimeoutId)
      }
    }
  }, [
    fontData,
    isOpen,
    localDeletedGlyphIds,
    localDirtyGlyphIds,
    scope,
    selectedGlyphId,
    selectedGlyphIds,
  ])

  const { glyphs, issues, summary } = qualityReport
  const displayValue = (value: number | string) =>
    isReportPending ? '...' : value
  const displayGlyphCount = isReportPending
    ? '...'
    : t('qualityCheck.summary.glyphCount', { count: summary.glyphCount })
  const handleLocateGlyph = (glyphId: string) => {
    addGlyphToEditor(glyphId)
    setWorkspaceView('editor')
  }
  const handleLocateIssue = (issue: QualityIssue) => {
    handleLocateGlyph(issue.glyphId)
  }

  return (
    <Dialog.Root
      open={isOpen}
      size="xl"
      onOpenChange={(e) => {
        if (!e.open) {
          onClose()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxH="86vh">
            <Dialog.Header pr={14}>
              <Stack
                direction={{ base: 'column', md: 'row' }}
                align={{ base: 'stretch', md: 'center' }}
                justify="space-between"
                gap={3}
              >
                <Box>
                  <HStack gap={3} align="center">
                    <Text as="span">{t('qualityCheck.title')}</Text>
                    {!isWholeFontScope ? (
                      <Badge colorPalette="orange">
                        {scopeLabel} {isReportPending ? '...' : glyphs.length}
                      </Badge>
                    ) : null}
                  </HStack>
                  <Text
                    fontSize="xs"
                    color="mutedForeground"
                    fontWeight="800"
                    mt={1}
                  >
                    {isWholeFontScope
                      ? t('qualityCheck.description.font')
                      : t('qualityCheck.description.focused', {
                          scope: scopeLabel,
                        })}
                  </Text>
                </Box>
                {scopeControl}
              </Stack>
            </Dialog.Header>
            <DialogCloseButton />
            <Dialog.Body overflowY="auto">
              <Stack gap={4}>
                <SimpleGrid
                  columns={{
                    base: 1,
                    md: summary.deletedCount === null ? 5 : 6,
                  }}
                  gap={3}
                >
                  <SummaryTile
                    label={t('qualityCheck.summary.scope')}
                    value={scopeLabel}
                  />
                  <SummaryTile
                    label={t('qualityCheck.summary.glyphs')}
                    value={displayGlyphCount}
                  />
                  <SummaryTile
                    label={t('qualityCheck.summary.blocking')}
                    value={displayValue(summary.blockingCount)}
                    tone="red"
                  />
                  <SummaryTile
                    label={t('qualityCheck.summary.warning')}
                    value={displayValue(summary.warningCount)}
                    tone="orange"
                  />
                  <SummaryTile
                    label={t('qualityCheck.summary.info')}
                    value={displayValue(summary.infoCount)}
                  />
                  {summary.deletedCount === null ? null : (
                    <SummaryTile
                      label={t('qualityCheck.summary.deleted')}
                      value={displayValue(summary.deletedCount)}
                    />
                  )}
                </SimpleGrid>

                <SlidingTabsRoot
                  colorPalette="yellow"
                  value={String(activeTabIndex)}
                  onValueChange={(details) =>
                    setActiveTabIndex(Number(details.value))
                  }
                >
                  <SlidingTabList
                    activeIndex={activeTabIndex}
                    labels={qualityTabLabels}
                    layoutGroupId="quality-check-tabs"
                    w="100%"
                  />

                  <SlidingTabsContentGroup>
                    <Tabs.Content value="0" px={0}>
                      {isReportPending ? (
                        <ReportLoadingPanel />
                      ) : (
                        <LintPanel
                          issues={issues}
                          glyphCount={glyphs.length}
                          onLocateIssue={handleLocateIssue}
                        />
                      )}
                    </Tabs.Content>
                    <Tabs.Content value="1" px={0}>
                      <MixedProofPanel
                        fontData={fontData}
                        scopedGlyphs={glyphs}
                        scope={scope}
                        proofText={proofText}
                        onProofTextChange={setProofText}
                      />
                    </Tabs.Content>
                    <Tabs.Content value="2" px={0}>
                      <GrayProofPanel
                        fontData={fontData}
                        scopedGlyphs={glyphs}
                        scope={scope}
                      />
                    </Tabs.Content>
                    <Tabs.Content value="3" px={0}>
                      <StructurePanel
                        fontData={fontData}
                        scopedGlyphs={glyphs}
                        scope={scope}
                        onLocateGlyph={handleLocateGlyph}
                      />
                    </Tabs.Content>
                  </SlidingTabsContentGroup>
                </SlidingTabsRoot>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer gap={3}>
              <Button variant="ghost" onClick={onClose}>
                {t('common.close')}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone?: 'red' | 'orange'
}) {
  return (
    <Box
      borderWidth={1}
      borderColor="border"
      bg={tone ? `${tone}.50` : 'card'}
      p={3}
    >
      <Text fontSize="xs" color="mutedForeground" fontWeight="800">
        {label}
      </Text>
      <Text fontSize="2xl" fontFamily="mono" fontWeight="900">
        {value}
      </Text>
    </Box>
  )
}

function ReportLoadingPanel() {
  const { t } = useTranslation()

  return (
    <Box borderWidth={1} borderColor="border" bg="card" p={6}>
      <Text fontSize="sm" color="mutedForeground" fontWeight="800">
        {t('qualityCheck.loadingReport')}
      </Text>
    </Box>
  )
}

function ScopeSelector({
  scope,
  onScopeChange,
}: {
  scope: FontQualityScope
  onScopeChange: (scope: FontQualityScope) => void
}) {
  const { t } = useTranslation()

  return (
    <HStack
      gap={1}
      bg="muted"
      borderRadius="full"
      p={1}
      w={{ base: '100%', md: 'fit-content' }}
      overflowX="auto"
    >
      {scopeOptions.map((option) => (
        <Button
          key={option.id}
          size="xs"
          flexShrink={0}
          borderRadius="full"
          variant={scope === option.id ? 'solid' : 'ghost'}
          onClick={() => onScopeChange(option.id)}
        >
          {t(option.labelKey)}
        </Button>
      ))}
    </HStack>
  )
}

function TabLabel({
  icon,
  children,
}: {
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <HStack gap={2}>
      {icon}
      <Text as="span">{children}</Text>
    </HStack>
  )
}
