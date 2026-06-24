import { Box, Stack, Text, useDisclosure } from '@chakra-ui/react'
import { useState } from 'react'
import { BatchTransformCard } from 'src/features/fontOverview/components/BatchTransformCard'
import { ExportFontModal } from 'src/features/common/fontExport/ExportFontModal'
import { useFontExport } from 'src/features/common/fontExport/useFontExport'
import { GitHubCommitModal } from 'src/features/common/glyphInspector/components/GitHubCommitModal'
import { GlyphSummaryCard } from 'src/features/common/glyphInspector/components/GlyphSummaryCard'
import { useRightPanelModel } from 'src/features/common/glyphInspector/hooks/useRightPanelModel'
import { SelectedGlyphsCard } from 'src/features/fontOverview/components/SelectedGlyphsCard'
import { FontSettingsModal } from 'src/features/common/projectControl/FontSettingsModal'
import { ProjectControlActions } from 'src/features/common/projectControl/ProjectControlActions'
import {
  FontQualityCheckModal,
  SelectedGlyphQualityCheckModal,
} from 'src/features/common/qualityCheck/QualityCheckModal'
import type { QualityCheckMode } from 'src/features/common/qualityCheck/types'
import type { QualityScope } from 'src/lib/qualityCheck/qualityLint'
import { useStore } from 'src/store'
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
      bg="field.paper"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <Stack spacing={4}>
        <ProjectControlActions
          hasGitHubSource={panel.hasGitHubSource}
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
          <Text fontSize="sm" color="field.muted" fontFamily="mono">
            {t('fontOverview.noGlyphSelected')}
          </Text>
        ) : (
          <GlyphSummaryCard
            activeLayer={panel.activeLayer ?? null}
            availableLayers={panel.availableLayers}
            glyph={panel.glyph}
            isDirty={panel.isDirty}
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
        isOpen={exportModal.isOpen}
        canExport={fontExport.canExport}
        isExporting={fontExport.isExporting}
        loadingText={fontExport.loadingText}
        openTypeWarnings={fontExport.openTypeExportWarnings}
        glyphsWarnings={fontExport.glyphsExportWarnings}
        exportInstances={fontExport.exportInstances}
        sourceFormat={fontExport.sourceFormat}
        onClose={exportModal.onClose}
        onExport={(format, options) =>
          void fontExport.exportFont(format, options)
        }
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
      {qualityCheckMode === 'selected' ? (
        <SelectedGlyphQualityCheckModal
          isOpen={qualityCheckModal.isOpen}
          onClose={qualityCheckModal.onClose}
          selectedGlyphIds={hasSelection ? selectedGlyphIds : undefined}
        />
      ) : (
        <FontQualityCheckModal
          key={qualityCheckScope}
          isOpen={qualityCheckModal.isOpen}
          onClose={qualityCheckModal.onClose}
          initialScope={qualityCheckScope}
        />
      )}
    </Box>
  )
}
