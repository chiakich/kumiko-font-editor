import {
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Stack,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { FrameSelect, GraphUp, List, MessageText } from 'iconoir-react'
import { SlidingTabList } from 'src/features/common/SlidingTabList'
import { useStore } from 'src/store'
import { LintPanel } from 'src/features/common/qualityCheck/LintPanel'
import { MixedProofPanel } from 'src/features/common/qualityCheck/MixedProofPanel'
import { GrayProofPanel } from 'src/features/common/qualityCheck/GrayProofPanel'
import { StructurePanel } from 'src/features/common/qualityCheck/StructurePanel'
import {
  buildQualityReport,
  type QualityIssue,
  type QualityScope,
} from 'src/features/common/qualityCheck/qualityLint'
import { mixedProofPresets } from 'src/features/common/qualityCheck/qualityProof'

interface QualityCheckModalProps {
  isOpen: boolean
  onClose: () => void
}

const scopeOptions: Array<{ id: QualityScope; label: string }> = [
  { id: 'changed', label: '本次變更' },
  { id: 'current', label: '目前字符' },
  { id: 'font', label: '整套字體' },
]

const qualityTabLabels = [
  <TabLabel key="lint" icon={<List width={15} height={15} />}>
    Lint
  </TabLabel>,
  <TabLabel key="mixed-proof" icon={<MessageText width={15} height={15} />}>
    混排
  </TabLabel>,
  <TabLabel key="gray-proof" icon={<GraphUp width={15} height={15} />}>
    灰度
  </TabLabel>,
  <TabLabel key="structure" icon={<FrameSelect width={15} height={15} />}>
    結構
  </TabLabel>,
]

export function QualityCheckModal({ isOpen, onClose }: QualityCheckModalProps) {
  const [scope, setScope] = useState<QualityScope>('changed')
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [proofText, setProofText] = useState(mixedProofPresets[0])
  const fontData = useStore((state) => state.fontData)
  const selectedGlyphId = useStore((state) => state.selectedGlyphId)
  const localDirtyGlyphIds = useStore((state) => state.localDirtyGlyphIds)
  const localDeletedGlyphIds = useStore((state) => state.localDeletedGlyphIds)
  const addGlyphToEditor = useStore((state) => state.addGlyphToEditor)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)

  const qualityReport = useMemo(
    () =>
      buildQualityReport({
        fontData,
        scope,
        selectedGlyphId,
        dirtyGlyphIds: localDirtyGlyphIds,
        deletedGlyphIds: localDeletedGlyphIds,
      }),
    [fontData, localDeletedGlyphIds, localDirtyGlyphIds, scope, selectedGlyphId]
  )
  const { glyphs, issues, summary } = qualityReport
  const handleLocateIssue = (issue: QualityIssue) => {
    addGlyphToEditor(issue.glyphId)
    setWorkspaceView('editor')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="5xl">
      <ModalOverlay />
      <ModalContent maxH="86vh">
        <ModalHeader pr={14}>
          <Stack
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'stretch', md: 'center' }}
            justify="space-between"
            spacing={3}
          >
            <Box>
              <Text as="span">品質檢查</Text>
              <Text fontSize="xs" color="field.muted" fontWeight="800" mt={1}>
                Lint、混排、灰度與結構 proof
              </Text>
            </Box>
            <ScopeSelector scope={scope} onScopeChange={setScope} />
          </Stack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody overflowY="auto">
          <Stack spacing={4}>
            <SimpleGrid columns={{ base: 1, md: 5 }} spacing={3}>
              <SummaryTile
                label="檢查範圍"
                value={`${summary.glyphCount} glyphs`}
              />
              <SummaryTile
                label="阻擋"
                value={summary.blockingCount}
                tone="red"
              />
              <SummaryTile
                label="警告"
                value={summary.warningCount}
                tone="orange"
              />
              <SummaryTile label="提示" value={summary.infoCount} />
              <SummaryTile
                label="刪除"
                value={
                  summary.deletedCount === null ? 'N/A' : summary.deletedCount
                }
              />
            </SimpleGrid>

            <Tabs
              variant="unstyled"
              colorScheme="yellow"
              isLazy
              index={activeTabIndex}
              onChange={setActiveTabIndex}
            >
              <SlidingTabList
                activeIndex={activeTabIndex}
                labels={qualityTabLabels}
                layoutGroupId="quality-check-tabs"
              />

              <TabPanels>
                <TabPanel px={0}>
                  <LintPanel
                    issues={issues}
                    glyphCount={glyphs.length}
                    onLocateIssue={handleLocateIssue}
                  />
                </TabPanel>
                <TabPanel px={0}>
                  <MixedProofPanel
                    fontData={fontData}
                    scopedGlyphs={glyphs}
                    proofText={proofText}
                    onProofTextChange={setProofText}
                  />
                </TabPanel>
                <TabPanel px={0}>
                  <GrayProofPanel
                    fontData={fontData}
                    scopedGlyphs={glyphs}
                    proofText={proofText}
                  />
                </TabPanel>
                <TabPanel px={0}>
                  <StructurePanel />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Stack>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="ghost" onClick={onClose}>
            關閉
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
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
      borderColor="field.line"
      bg={tone ? `${tone}.50` : 'field.panel'}
      p={3}
    >
      <Text fontSize="xs" color="field.muted" fontWeight="800">
        {label}
      </Text>
      <Text fontSize="2xl" fontFamily="mono" fontWeight="900">
        {value}
      </Text>
    </Box>
  )
}

function ScopeSelector({
  scope,
  onScopeChange,
}: {
  scope: QualityScope
  onScopeChange: (scope: QualityScope) => void
}) {
  return (
    <HStack
      spacing={1}
      bg="field.panelMuted"
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
          {option.label}
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
    <HStack spacing={2}>
      {icon}
      <Text as="span">{children}</Text>
    </HStack>
  )
}
