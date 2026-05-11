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
import { GitHubCommitModal } from 'src/features/common/glyphInspector/GitHubCommitModal'
import { GlyphSummaryCard } from 'src/features/common/glyphInspector/GlyphSummaryCard'
import { useRightPanelModel } from 'src/features/common/glyphInspector/useRightPanelModel'
import { SlidingTabList } from 'src/features/common/SlidingTabList'
import { FontSettingsModal } from 'src/features/common/projectControl/FontSettingsModal'
import { ProjectControlActions } from 'src/features/common/projectControl/ProjectControlActions'
import { MetricsCard } from 'src/features/editor/rightPanel/MetricsCard'
import { NodeInspectorCard } from 'src/features/editor/rightPanel/NodeInspectorCard'
import { TransformCard } from 'src/features/editor/rightPanel/TransformCard'
import { BehaviorsPanel } from 'src/features/editor/rightPanel/behaviors/BehaviorsPanel'
import { useStore } from 'src/store'

export function EditorRightPanel() {
  const panel = useRightPanelModel()
  const exportModal = useDisclosure()
  const fontSettingsModal = useDisclosure()
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
          onSaveProject={panel.handleSaveProject}
        />

        {!panel.glyph ? (
          <Text fontSize="sm" color="field.muted" fontFamily="mono">
            尚未選取字形。
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
                    selectedLayerId={panel.selectedLayerId}
                    workspaceView={panel.workspaceView}
                    onDeleteGlyph={panel.handleDeleteGlyph}
                    onEnterEditor={() => panel.setWorkspaceView('editor')}
                    onLayerChange={panel.setSelectedLayerId}
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
                    onMetricsChange={panel.handleMetricsChange}
                  />
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
      <GitHubCommitModal {...panel.gitHubCommitFlow.modalProps} />
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
