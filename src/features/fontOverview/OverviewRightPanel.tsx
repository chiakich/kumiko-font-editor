import { Box, Stack, Text, useDisclosure } from '@chakra-ui/react'
import { ExportFontModal } from 'src/features/common/fontExport/ExportFontModal'
import { useFontExport } from 'src/features/common/fontExport/useFontExport'
import { GitHubCommitModal } from 'src/features/common/glyphInspector/GitHubCommitModal'
import { GlyphSummaryCard } from 'src/features/common/glyphInspector/GlyphSummaryCard'
import { useRightPanelModel } from 'src/features/common/glyphInspector/useRightPanelModel'
import { FontSettingsModal } from 'src/features/common/projectControl/FontSettingsModal'
import { ProjectControlActions } from 'src/features/common/projectControl/ProjectControlActions'
import { QualityCheckModal } from 'src/features/common/qualityCheck/QualityCheckModal'
import { useStore } from 'src/store'
import { useTranslation } from 'react-i18next'

export function OverviewRightPanel() {
  const { t } = useTranslation()

  const panel = useRightPanelModel()
  const exportModal = useDisclosure()
  const fontSettingsModal = useDisclosure()
  const qualityCheckModal = useDisclosure()
  const fontExport = useFontExport()
  const updateFontSettings = useStore((state) => state.updateFontSettings)

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
          onOpenQualityCheckModal={qualityCheckModal.onOpen}
          onSaveProject={panel.handleSaveProject}
        />

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
        onOpenQualityCheck={qualityCheckModal.onOpen}
      />
      <QualityCheckModal
        isOpen={qualityCheckModal.isOpen}
        onClose={qualityCheckModal.onClose}
      />
    </Box>
  )
}
