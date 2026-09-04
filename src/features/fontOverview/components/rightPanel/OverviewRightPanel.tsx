import { Box, Stack, Text, useDisclosure } from '@chakra-ui/react'
import { useState } from 'react'
import { BatchTransformCard } from '@/features/fontOverview/components/rightPanel/BatchTransformCard'
import { ExportErrorModal } from '@/features/common/fontExport/ExportErrorModal'
import { ExportFontModal } from '@/features/common/fontExport/ExportFontModal'
import { useFontExport } from '@/features/common/fontExport/useFontExport'
import { GitHubCommitModal } from '@/features/common/glyphInspector/components/GitHubCommitModal'
import { GlyphSummaryCard } from '@/features/common/glyphInspector/components/GlyphSummaryCard'
import { useRightPanelModel } from '@/features/common/glyphInspector/hooks/useRightPanelModel'
import { SelectedGlyphsCard } from '@/features/fontOverview/components/rightPanel/SelectedGlyphsCard'
import { FontSettingsModal } from '@/features/common/projectControl/FontSettingsModal'
import { ProjectControlActions } from '@/features/common/projectControl/ProjectControlActions'
import {
  FontQualityCheckModal,
  SelectedGlyphQualityCheckModal,
} from '@/features/common/qualityCheck/QualityCheckModal'
import type { QualityCheckMode } from '@/features/common/qualityCheck/types'
import type { QualityScope } from '@/lib/qualityCheck/qualityLint'
import { useStore } from '@/store'
import { useTranslation } from 'react-i18next'

interface OverviewRightPanelProps {
  selectedGlyphIds?: string[]
  onDeleteSelectedGlyphs: () => void
  onEnterEditor: (glyphId: string) => void
}

export function OverviewRightPanel({
  selectedGlyphIds = [],
  onDeleteSelectedGlyphs,
  onEnterEditor,
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

  const hasSelection = selectedGlyphIds.length > 0
  const hasMultiSelection = selectedGlyphIds.length >= 2
  const handleEnterSelectedGlyphs = () => {
    const primaryGlyphId = selectedGlyphIds[0]
    if (primaryGlyphId) {
      onEnterEditor(primaryGlyphId)
    }
  }
  const handleOpenSelectedQualityCheck = () => {
    if (hasSelection) {
      openQualityCheck('selected')
    }
  }

  return (
    <Box
      p={4}
      h="100%"
      overflowY="auto"
      bg="background"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <Stack gap={4}>
        <ProjectControlActions
          hasGitHubSource={panel.hasGitHubSource}
          gitStatus={{
            pendingChangeCount: panel.gitHubCommitFlow.pendingChangeCount,
            conflictCount: panel.gitHubCommitFlow.conflictCount,
            hasSubmitError: panel.gitHubCommitFlow.hasSubmitError,
            isSubmitting: panel.gitHubCommitFlow.isSubmitting,
            isSignedIn: Boolean(panel.gitHubCommitFlow.modalProps.githubViewer),
          }}
          versionMenu={panel.gitHubCommitFlow.versionMenuProps}
          isSavingToLocal={fontExport.isExporting}
          onOpenExportModal={exportModal.onOpen}
          onOpenFontSettingsModal={fontSettingsModal.onOpen}
          onOpenGitHubModal={() =>
            void panel.gitHubCommitFlow.openGitHubModal()
          }
          onOpenQualityCheckModal={() => openQualityCheck('font')}
        />

        {hasMultiSelection ? (
          <>
            <SelectedGlyphsCard
              selectedGlyphCount={selectedGlyphIds.length}
              onDeleteGlyphs={onDeleteSelectedGlyphs}
              onEnterEditor={handleEnterSelectedGlyphs}
              onOpenQualityCheck={handleOpenSelectedQualityCheck}
            />
            <BatchTransformCard selectedGlyphIds={selectedGlyphIds} />
          </>
        ) : !panel.glyph ? (
          <Text fontSize="sm" color="mutedForeground" fontFamily="mono">
            {t('fontOverview.noGlyphSelected')}
          </Text>
        ) : (
          <GlyphSummaryCard
            activeLayer={panel.activeLayer ?? null}
            availableLayers={panel.availableLayers}
            glyph={panel.glyph}
            workspaceView={panel.workspaceView}
            onDeleteGlyph={panel.handleDeleteGlyph}
            onEnterEditor={() => {
              if (panel.glyph) {
                onEnterEditor(panel.glyph.id)
              }
            }}
            onGlyphColorChange={panel.handleGlyphColorChange}
            onOpenQualityCheck={handleOpenSelectedQualityCheck}
            onLayerChange={panel.setSelectedLayerId}
          />
        )}
      </Stack>
      <ExportFontModal
        isOpen={exportModal.open}
        canExport={fontExport.canExport}
        isExporting={fontExport.isExporting}
        loadingText={fontExport.loadingText}
        openTypeWarnings={fontExport.openTypeExportWarnings}
        glyphsWarnings={fontExport.glyphsExportWarnings}
        exportInstances={fontExport.exportInstances}
        canExportVariableFont={fontExport.canExportVariableFont}
        exportPolicy={fontExport.exportPolicy}
        sourceFormat={fontExport.sourceFormat}
        onClose={exportModal.onClose}
        onExport={(format, options) =>
          void fontExport.exportFont(format, options)
        }
        onExportPolicyChange={fontExport.setExportPolicy}
      />
      <ExportErrorModal
        report={fontExport.exportErrorReport}
        onClose={fontExport.closeExportErrorReport}
      />
      {fontSettingsModal.open ? (
        <FontSettingsModal
          fontData={panel.fontData}
          isOpen={fontSettingsModal.open}
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
      {qualityCheckMode === 'selected' ? (
        <SelectedGlyphQualityCheckModal
          isOpen={qualityCheckModal.open}
          onClose={qualityCheckModal.onClose}
          selectedGlyphIds={hasSelection ? selectedGlyphIds : undefined}
        />
      ) : (
        <FontQualityCheckModal
          key={qualityCheckScope}
          isOpen={qualityCheckModal.open}
          onClose={qualityCheckModal.onClose}
          initialScope={qualityCheckScope}
        />
      )}
    </Box>
  )
}
