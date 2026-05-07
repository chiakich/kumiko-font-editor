import {
  Box,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  useDisclosure,
} from '@chakra-ui/react'
import { ExportFontModal } from 'src/features/common/fontExport/ExportFontModal'
import { useFontExport } from 'src/features/common/fontExport/useFontExport'
import { GitHubCommitModal } from 'src/features/common/glyphInspector/GitHubCommitModal'
import { GlyphSummaryCard } from 'src/features/common/glyphInspector/GlyphSummaryCard'
import { ProjectSaveCard } from 'src/features/common/glyphInspector/ProjectSaveCard'
import { useRightPanelModel } from 'src/features/common/glyphInspector/useRightPanelModel'
import { MetricsCard } from 'src/features/editor/rightPanel/MetricsCard'
import { NodeInspectorCard } from 'src/features/editor/rightPanel/NodeInspectorCard'
import { TransformCard } from 'src/features/editor/rightPanel/TransformCard'

export function EditorRightPanel() {
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
      <Stack spacing={5}>
        {!panel.glyph ? (
          <Text fontSize="sm" color="field.muted" fontFamily="mono">
            尚未選取字形。
          </Text>
        ) : (
          <Tabs variant="enclosed" size="sm" isLazy>
            <TabList>
              <Tab>Inspect</Tab>
              <Tab>Transform</Tab>
            </TabList>
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

                  <ProjectSaveCard
                    canSaveDraft={Boolean(
                      panel.fontData &&
                      panel.projectId &&
                      panel.projectTitle &&
                      panel.isDirty
                    )}
                    hasGitHubSource={panel.hasGitHubSource}
                    isSavingToLocal={fontExport.isExporting}
                    onOpenExportModal={exportModal.onOpen}
                    onOpenGitHubModal={() =>
                      void panel.gitHubCommitFlow.openGitHubModal()
                    }
                    onSaveProject={panel.handleSaveProject}
                  />
                </Stack>
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
        onClose={exportModal.onClose}
        onExport={(format) => void fontExport.exportFont(format)}
      />
      <GitHubCommitModal {...panel.gitHubCommitFlow.modalProps} />
    </Box>
  )
}
