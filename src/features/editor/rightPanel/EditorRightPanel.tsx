import {
  Box,
  Stack,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  useDisclosure,
} from '@chakra-ui/react'
import { useState } from 'react'
import { ExportFontModal } from 'src/features/common/fontExport/ExportFontModal'
import { useFontExport } from 'src/features/common/fontExport/useFontExport'
import { GitHubCommitModal } from 'src/features/common/glyphInspector/components/GitHubCommitModal'
import { GlyphSummaryCard } from 'src/features/common/glyphInspector/components/GlyphSummaryCard'
import { useRightPanelModel } from 'src/features/common/glyphInspector/hooks/useRightPanelModel'
import { SlidingTabList } from 'src/features/common/SlidingTabList'
import { FontSettingsModal } from 'src/features/common/projectControl/FontSettingsModal'
import { ProjectControlActions } from 'src/features/common/projectControl/ProjectControlActions'
import { FontQualityCheckModal } from 'src/features/common/qualityCheck/QualityCheckModal'
import { DesignspaceLocationControl } from 'src/features/editor/canvas/workspace/components/DesignspaceLocationControl'
import { GlyphInsightCard } from 'src/features/editor/rightPanel/components/GlyphInsightCard'
import { MetricsCard } from 'src/features/editor/rightPanel/components/MetricsCard'
import { LayerListCard } from 'src/features/editor/rightPanel/components/LayerListCard'
import { NodeInspectorCard } from 'src/features/editor/rightPanel/components/NodeInspectorCard'
import { ReferenceFontCard } from 'src/features/editor/rightPanel/components/ReferenceFontCard'
import { TransformCard } from 'src/features/editor/rightPanel/components/TransformCard'
import { BehaviorsPanel } from 'src/features/editor/rightPanel/behaviors/BehaviorsPanel'
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
      bg="field.paper"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <Stack spacing={5}>
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
          <Text fontSize="sm" color="field.muted" fontFamily="mono">
            {t('editor.noGlyphSelected')}
          </Text>
        ) : (
          <Tabs
            variant="unstyled"
            size="sm"
            isLazy
            index={activeTabIndex}
            onChange={setActiveTabIndex}
          >
            <SlidingTabList
              activeIndex={activeTabIndex}
              labels={rightPanelTabLabels}
              layoutGroupId="editor-right-panel-tabs"
            />
            <TabPanels>
              <TabPanel px={0} pb={0}>
                <Stack spacing={4}>
                  <GlyphSummaryCard
                    activeLayer={panel.activeLayer ?? null}
                    availableLayers={panel.availableLayers}
                    glyph={panel.glyph}
                    isDirty={panel.isDirty}
                    workspaceView={panel.workspaceView}
                    showLayerSelect={false}
                    onDeleteGlyph={panel.handleDeleteGlyph}
                    onEnterEditor={() => panel.setWorkspaceView('editor')}
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

                  <ReferenceFontCard />
                </Stack>
              </TabPanel>
              <TabPanel px={0} pb={0}>
                <Stack spacing={4}>
                  <TransformCard
                    glyph={panel.glyph}
                    selectedNodeIds={panel.selectedNodeIds}
                    onMoveSelection={panel.handleMoveSelection}
                    onPathOperation={panel.handlePathOperation}
                  />
                </Stack>
              </TabPanel>
              <TabPanel px={0} pb={0}>
                <BehaviorsPanel fontData={panel.fontData} glyph={panel.glyph} />
              </TabPanel>
            </TabPanels>
          </Tabs>
        )}
      </Stack>

      <ExportFontModal
        isOpen={exportModal.isOpen}
        canExport={fontExport.canExport}
        isExporting={fontExport.isExporting}
        loadingText={fontExport.loadingText}
        openTypeWarnings={fontExport.openTypeExportWarnings}
        glyphsWarnings={fontExport.glyphsExportWarnings}
        sourceFormat={fontExport.sourceFormat}
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
      <FontQualityCheckModal
        isOpen={qualityCheckModal.isOpen}
        onClose={qualityCheckModal.onClose}
      />
    </Box>
  )
}

const rightPanelTabLabels = [
  <Text key="inspect" as="span" fontSize="xs" fontWeight="800">
    Inspect
  </Text>,
  <Text key="transform" as="span" fontSize="xs" fontWeight="800">
    Transform
  </Text>,
  <Text key="behaviors" as="span" fontSize="xs" fontWeight="800">
    Behaviors
  </Text>,
]
