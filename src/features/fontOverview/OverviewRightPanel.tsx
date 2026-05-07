import { Box, Stack, Text, useDisclosure } from '@chakra-ui/react'
import { ExportFontModal } from 'src/features/common/fontExport/ExportFontModal'
import { useFontExport } from 'src/features/common/fontExport/useFontExport'
import { GitHubCommitModal } from 'src/features/common/glyphInspector/GitHubCommitModal'
import { GlyphSummaryCard } from 'src/features/common/glyphInspector/GlyphSummaryCard'
import { useRightPanelModel } from 'src/features/common/glyphInspector/useRightPanelModel'
import { ProjectSaveActions } from 'src/features/common/projectSave/ProjectSaveActions'

export function OverviewRightPanel() {
  const panel = useRightPanelModel()
  const exportModal = useDisclosure()
  const fontExport = useFontExport()

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
        <ProjectSaveActions
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
          onOpenGitHubModal={() =>
            void panel.gitHubCommitFlow.openGitHubModal()
          }
          onSaveProject={panel.handleSaveProject}
        />

        {!panel.glyph ? (
          <Text fontSize="sm" color="field.muted" fontFamily="mono">
            尚未選取字形。
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
        onClose={exportModal.onClose}
        onExport={(format) => void fontExport.exportFont(format)}
      />
      <GitHubCommitModal {...panel.gitHubCommitFlow.modalProps} />
    </Box>
  )
}
