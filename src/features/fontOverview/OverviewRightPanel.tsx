import {
  Box,
  Button,
  HStack,
  Stack,
  Text,
  useDisclosure,
} from '@chakra-ui/react'
import { useState } from 'react'
import { PageSearch } from 'iconoir-react'
import { ExportFontModal } from 'src/features/common/fontExport/ExportFontModal'
import { useFontExport } from 'src/features/common/fontExport/useFontExport'
import { GitHubCommitModal } from 'src/features/common/glyphInspector/GitHubCommitModal'
import { GlyphSummaryCard } from 'src/features/common/glyphInspector/GlyphSummaryCard'
import { useRightPanelModel } from 'src/features/common/glyphInspector/useRightPanelModel'
import { FontSettingsModal } from 'src/features/common/projectControl/FontSettingsModal'
import { ProjectControlActions } from 'src/features/common/projectControl/ProjectControlActions'
import { QualityCheckModal } from 'src/features/common/qualityCheck/QualityCheckModal'
import type { QualityCheckMode } from 'src/features/common/qualityCheck/qualityCheckMode'
import type { QualityScope } from 'src/features/common/qualityCheck/qualityLint'
import { useStore } from 'src/store'
import { useTranslation } from 'react-i18next'

interface OverviewRightPanelProps {
  selectedGlyphIds?: string[]
}

export function OverviewRightPanel({
  selectedGlyphIds = [],
}: OverviewRightPanelProps) {
  const { t } = useTranslation()

  const panel = useRightPanelModel()
  const exportModal = useDisclosure()
  const fontSettingsModal = useDisclosure()
  const qualityCheckModal = useDisclosure()
  const [qualityCheckMode, setQualityCheckMode] =
    useState<QualityCheckMode>('font')
  const [qualityCheckScope, setQualityCheckScope] =
    useState<Exclude<QualityScope, 'selected'>>('font')
  const fontExport = useFontExport()
  const updateFontSettings = useStore((state) => state.updateFontSettings)

  const openQualityCheck = (
    mode: QualityCheckMode,
    scope: Exclude<QualityScope, 'selected'> = 'font'
  ) => {
    setQualityCheckMode(mode)
    setQualityCheckScope(scope)
    qualityCheckModal.onOpen()
  }

  const hasMultiSelection = selectedGlyphIds.length >= 2

  return (
    <Box
      p={4}
      h="100%"
      overflowY="auto"
      bg="field.paper"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <Stack spacing={4}>
        <ProjectControlActions
          canSaveDraft={Boolean(
            panel.fontData &&
            panel.projectId &&
            panel.projectTitle &&
            panel.isDirty
          )}
          hasGitHubSource={panel.hasGitHubSource}
          isDraftCurrent={Boolean(
            panel.fontData &&
            panel.projectId &&
            panel.projectTitle &&
            !panel.isDirty
          )}
          isSavingToLocal={fontExport.isExporting}
          onOpenExportModal={exportModal.onOpen}
          onOpenFontSettingsModal={fontSettingsModal.onOpen}
          onOpenGitHubModal={() =>
            void panel.gitHubCommitFlow.openGitHubModal()
          }
          onOpenQualityCheckModal={() => openQualityCheck('font')}
          onSaveProject={panel.handleSaveProject}
        />

        {hasMultiSelection ? (
          <Box borderWidth={1} borderColor="field.line" bg="field.panel" p={3}>
            <HStack justify="space-between" spacing={3}>
              <Text fontSize="sm" fontWeight="800">
                已選取 {selectedGlyphIds.length} 個字符
              </Text>
              <Button
                size="xs"
                leftIcon={<PageSearch width={14} height={14} />}
                onClick={() => openQualityCheck('selected')}
              >
                品質檢查
              </Button>
            </HStack>
            <Text fontSize="xs" color="field.muted" mt={1}>
              只對選取的字進行 Lint、混排、灰度與結構檢查。
            </Text>
          </Box>
        ) : null}

        {!panel.glyph ? (
          <Text fontSize="sm" color="field.muted" fontFamily="mono">
            {t('fontOverview.noGlyphSelected')}
          </Text>
        ) : (
          <GlyphSummaryCard
            activeLayer={panel.activeLayer ?? null}
            availableLayers={panel.availableLayers}
            glyph={panel.glyph}
            isDirty={panel.isDirty}
            selectedLayerId={panel.selectedLayerId}
            workspaceView={panel.workspaceView}
            onDeleteGlyph={panel.handleDeleteGlyph}
            onEnterEditor={() => panel.setWorkspaceView('editor')}
            onLayerChange={panel.setSelectedLayerId}
          />
        )}
      </Stack>

      <ExportFontModal
        isOpen={exportModal.isOpen}
        canExport={fontExport.canExport}
        isExporting={fontExport.isExporting}
        loadingText={fontExport.loadingText}
        openTypeWarnings={fontExport.openTypeExportWarnings}
        onClose={exportModal.onClose}
        onExport={(format) => void fontExport.exportFont(format)}
      />
      {fontSettingsModal.isOpen ? (
        <FontSettingsModal
          fontData={panel.fontData}
          isOpen={fontSettingsModal.isOpen}
          projectTitle={panel.projectTitle}
          onClose={fontSettingsModal.onClose}
          onSave={updateFontSettings}
        />
      ) : null}
      <GitHubCommitModal
        {...panel.gitHubCommitFlow.modalProps}
        qualitySummary={panel.commitQualityReport.summary}
        onOpenQualityCheck={() => openQualityCheck('font', 'changed')}
      />
      <QualityCheckModal
        key={`${qualityCheckMode}-${qualityCheckScope}`}
        isOpen={qualityCheckModal.isOpen}
        onClose={qualityCheckModal.onClose}
        mode={qualityCheckMode}
        initialScope={qualityCheckScope}
        selectedGlyphIds={
          qualityCheckMode === 'selected' ? selectedGlyphIds : undefined
        }
      />
    </Box>
  )
}
