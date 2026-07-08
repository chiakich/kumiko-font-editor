import { Box, Stack, Tabs, Text, useDisclosure } from '@chakra-ui/react'
import { useState } from 'react'
import { ExportErrorModal } from 'src/features/common/fontExport/ExportErrorModal'
import { ExportFontModal } from 'src/features/common/fontExport/ExportFontModal'
import { useFontExport } from 'src/features/common/fontExport/useFontExport'
import { GitHubCommitModal } from 'src/features/common/glyphInspector/components/GitHubCommitModal'
import { GlyphSummaryCard } from 'src/features/common/glyphInspector/components/GlyphSummaryCard'
import { useRightPanelModel } from 'src/features/common/glyphInspector/hooks/useRightPanelModel'
import {
  SlidingTabList,
  SlidingTabsContentGroup,
  SlidingTabsRoot,
} from 'src/features/common/SlidingTabList'
import { FontSettingsModal } from 'src/features/common/projectControl/FontSettingsModal'
import { ProjectControlActions } from 'src/features/common/projectControl/ProjectControlActions'
import { FontQualityCheckModal } from 'src/features/common/qualityCheck/QualityCheckModal'
import { DesignspaceLocationControl } from 'src/features/editor/canvas/workspace/components/DesignspaceLocationControl'
import { GlyphInsightCard } from 'src/features/editor/rightPanel/components/GlyphInsightCard'
import { InterpolationDiagnosticsCard } from 'src/features/editor/rightPanel/components/InterpolationDiagnosticsCard'
import { MetricsCard } from 'src/features/editor/rightPanel/components/MetricsCard'
import { LayerListCard } from 'src/features/editor/rightPanel/components/LayerListCard'
import { NodeInspectorCard } from 'src/features/editor/rightPanel/components/NodeInspectorCard'
import { TransformCard } from 'src/features/editor/rightPanel/components/TransformCard'
import { BehaviorsPanel } from 'src/features/editor/rightPanel/behaviors/BehaviorsPanel'
import { KerningPanel } from 'src/features/editor/rightPanel/kerning/KerningPanel'
import { useStore } from 'src/store'
import { useTranslation } from 'react-i18next'

export function EditorRightPanel() {
  const { t } = useTranslation()

  const panel = useRightPanelModel()
  const exportModal = useDisclosure()
  const fontSettingsModal = useDisclosure()
  const qualityCheckModal = useDisclosure()
  const fontExport = useFontExport()
  const updateFontSettings = useStore((state) => state.updateFontSettings)
  const [activeTabIndex, setActiveTabIndex] = useState(0)

  return (
    <Box
      p={4}
      h="100%"
      overflowY="auto"
      bg="background"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <Stack gap={5}>
        <ProjectControlActions
          hasGitHubSource={panel.hasGitHubSource}
          isSavingToLocal={fontExport.isExporting}
          onOpenExportModal={exportModal.onOpen}
          onOpenFontSettingsModal={fontSettingsModal.onOpen}
          onOpenGitHubModal={() =>
            void panel.gitHubCommitFlow.openGitHubModal()
          }
          onOpenQualityCheckModal={qualityCheckModal.onOpen}
        />

        {!panel.glyph ? (
          <Text fontSize="sm" color="mutedForeground" fontFamily="mono">
            {t('editor.noGlyphSelected')}
          </Text>
        ) : (
          <SlidingTabsRoot
            size="sm"
            value={String(activeTabIndex)}
            onValueChange={(details) =>
              setActiveTabIndex(Number(details.value))
            }
          >
            <SlidingTabList
              activeIndex={activeTabIndex}
              labels={rightPanelTabLabels}
              layoutGroupId="editor-right-panel-tabs"
              w="100%"
            />
            <SlidingTabsContentGroup mt={4}>
              <Tabs.Content value="0" px={0} pb={0}>
                <Stack gap={4}>
                  <GlyphSummaryCard
                    activeLayer={panel.activeLayer ?? null}
                    availableLayers={panel.availableLayers}
                    glyph={panel.glyph}
                    isDirty={panel.isDirty}
                    workspaceView={panel.workspaceView}
                    showLayerSelect={false}
                    onDeleteGlyph={panel.handleDeleteGlyph}
                    onEnterEditor={() => panel.setWorkspaceView('editor')}
                    onGlyphColorChange={panel.handleGlyphColorChange}
                    onLayerChange={panel.setSelectedLayerId}
                  />

                  <LayerListCard
                    glyphId={panel.glyph.id}
                    layers={panel.availableLayers}
                    activeLayerId={
                      panel.glyph.activeLayerId ?? 'public.default'
                    }
                    onSelectLayer={panel.selectLayer}
                  />

                  <DesignspaceLocationControl />

                  <InterpolationDiagnosticsCard
                    diagnostics={panel.interpolationDiagnostics}
                  />

                  <NodeInspectorCard
                    effectiveNodeType={panel.effectiveNodeType}
                    isEndpointNode={panel.isEndpointNode}
                    isOnCurveNode={panel.isOnCurveNode}
                    nodeRef={panel.nodeRef}
                    selectedNode={panel.selectedNode ?? null}
                    selectedSegment={panel.selectedSegment}
                    onCoordinateChange={panel.handleCoordinateChange}
                    onConvertSelectedSegment={
                      panel.handleConvertSelectedSegment
                    }
                    onNodeTypeChange={panel.handleNodeTypeChange}
                  />

                  <MetricsCard
                    displayedMetrics={panel.displayedMetrics}
                    isReadOnly={panel.isInterpolatedPreview}
                    onMetricsChange={panel.handleMetricsChange}
                  />

                  <GlyphInsightCard />
                </Stack>
              </Tabs.Content>
              <Tabs.Content value="1" px={0} pb={0}>
                <Stack gap={4}>
                  <TransformCard
                    glyph={panel.glyph}
                    selectedNodeIds={panel.selectedNodeIds}
                    onMoveSelection={panel.handleMoveSelection}
                    onPathOperation={panel.handlePathOperation}
                    onOutlineOffset={panel.handleOutlineOffset}
                  />
                </Stack>
              </Tabs.Content>
              <Tabs.Content value="2" px={0} pb={0}>
                <BehaviorsPanel fontData={panel.fontData} glyph={panel.glyph} />
              </Tabs.Content>
              <Tabs.Content value="3" px={0} pb={0}>
                <KerningPanel fontData={panel.fontData} />
              </Tabs.Content>
            </SlidingTabsContentGroup>
          </SlidingTabsRoot>
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
        onOpenQualityCheck={qualityCheckModal.onOpen}
      />
      <FontQualityCheckModal
        isOpen={qualityCheckModal.open}
        onClose={qualityCheckModal.onClose}
      />
    </Box>
  )
}

const rightPanelTabLabels = [
  <Text
    key="inspect"
    as="span"
    display="inline-flex"
    alignItems="center"
    fontSize="xs"
    fontWeight="800"
    lineHeight={1}
  >
    Inspect
  </Text>,
  <Text
    key="transform"
    as="span"
    display="inline-flex"
    alignItems="center"
    fontSize="xs"
    fontWeight="800"
    lineHeight={1}
  >
    Transform
  </Text>,
  <Text
    key="behaviors"
    as="span"
    display="inline-flex"
    alignItems="center"
    fontSize="xs"
    fontWeight="800"
    lineHeight={1}
  >
    Behaviors
  </Text>,
  <Text
    key="kerning"
    as="span"
    display="inline-flex"
    alignItems="center"
    fontSize="xs"
    fontWeight="800"
    lineHeight={1}
  >
    Kerning
  </Text>,
]
