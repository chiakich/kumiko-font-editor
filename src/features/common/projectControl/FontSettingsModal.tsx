import {
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalOverlay,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from '@chakra-ui/react'
import { useState } from 'react'
import { SlidingTabList } from 'src/features/common/SlidingTabList'
import { FontBasicsTab } from 'src/features/common/projectControl/fontSettings/FontBasicsTab'
import { FontExportsTab } from 'src/features/common/projectControl/fontSettings/FontExportsTab'
import { FontFeaturesTab } from 'src/features/common/projectControl/fontSettings/FontFeaturesTab'
import { FontOtherTab } from 'src/features/common/projectControl/fontSettings/FontOtherTab'
import { FontSourcesTab } from 'src/features/common/projectControl/fontSettings/FontSourcesTab'
import { FontSupplementalTab } from 'src/features/common/projectControl/fontSettings/FontSupplementalTab'
import {
  buildFontInfoFromDrafts,
  getInitialSettings,
  parseInteger,
  parseJsonArray,
  parseJsonRecord,
  parseLocation,
  stringifyJson,
  toExportDrafts,
  toFontInfoDraft,
  toOpenTypeDraft,
  toSourceDrafts,
} from 'src/features/common/projectControl/fontSettings/model'
import { defaultFontAxes } from 'src/lib/fontInfoSettings'
import {
  createEmptyOpenTypeFeaturesState,
  createFontFingerprint,
} from 'src/lib/openTypeFeatures'
import type {
  CrossAxisMapping,
  FontAxis,
  FontData,
  FontProjectSettings,
} from 'src/store'

interface FontSettingsModalProps {
  fontData: FontData | null
  isOpen: boolean
  projectTitle: string
  onClose: () => void
  onSave: (update: Partial<FontData>) => void
}

const tabLabels = ['字型', '主版', '匯出', '特性', '其他', '補充']

export function FontSettingsModal({
  fontData,
  isOpen,
  projectTitle,
  onClose,
  onSave,
}: FontSettingsModalProps) {
  const fontInfo = fontData?.fontInfo
  const initialAxes = fontData?.axes ?? defaultFontAxes
  const initialSettings = getInitialSettings(fontData)

  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [generalDraft, setGeneralDraft] = useState(() =>
    toFontInfoDraft(fontInfo)
  )
  const [openTypeDraft, setOpenTypeDraft] = useState(() =>
    toOpenTypeDraft(fontInfo)
  )
  const [localizedNames, setLocalizedNames] = useState(
    () => fontInfo?.localizedNames ?? {}
  )
  const [unitsPerEm, setUnitsPerEm] = useState(() =>
    String(fontData?.unitsPerEm ?? '')
  )
  const [axes, setAxes] = useState<FontAxis[]>(() => [...initialAxes.axes])
  const [mappingsText, setMappingsText] = useState(() =>
    stringifyJson(initialAxes.mappings)
  )
  const [customParametersText, setCustomParametersText] = useState(() =>
    stringifyJson(initialSettings.customParameters)
  )
  const [sources, setSources] = useState(() => toSourceDrafts(fontData))
  const [exports, setExports] = useState(() => toExportDrafts(fontData))
  const [featuresText, setFeaturesText] = useState(
    () => fontData?.features?.text ?? ''
  )
  const [openTypeFeatures, setOpenTypeFeatures] = useState(
    () =>
      fontData?.openTypeFeatures ??
      createEmptyOpenTypeFeaturesState(
        fontData ? createFontFingerprint(fontData) : null
      )
  )
  const [fontType, setFontType] = useState(
    () => initialSettings.fontType ?? 'static'
  )
  const [outlineType, setOutlineType] = useState(
    () => initialSettings.outlineType ?? 'cubic'
  )
  const [statusDefinitions, setStatusDefinitions] = useState(
    () => fontData?.statusDefinitions ?? []
  )
  const [notes, setNotes] = useState(() => initialSettings.notes ?? '')
  const [supplementalText, setSupplementalText] = useState(
    () => initialSettings.supplementalText ?? ''
  )

  const handleSave = () => {
    const nextSettings: FontProjectSettings = {
      fontType,
      outlineType,
      customParameters: parseJsonRecord(customParametersText),
      notes,
      supplementalText,
    }

    onSave({
      fontInfo: buildFontInfoFromDrafts(
        fontInfo,
        generalDraft,
        openTypeDraft,
        localizedNames
      ),
      unitsPerEm: parseInteger(unitsPerEm),
      axes: {
        axes,
        mappings: parseJsonArray<CrossAxisMapping>(mappingsText),
      },
      sources: Object.fromEntries(
        sources.map((source) => [
          source.id,
          {
            ...source,
            location: parseLocation(source.locationText),
          },
        ])
      ),
      exportInstances: exports.map((instance) => ({
        ...instance,
        location: parseLocation(instance.locationText),
      })),
      features: {
        language: 'fea',
        text: featuresText,
        customData: fontData?.features?.customData ?? {},
      },
      openTypeFeatures,
      statusDefinitions,
      settings: nextSettings,
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent borderRadius="sm" h="90vh">
        <ModalCloseButton zIndex={2} />
        <Tabs
          variant="enclosed"
          size="sm"
          display="flex"
          flex={1}
          flexDirection="column"
          minH={0}
          index={activeTabIndex}
          onChange={setActiveTabIndex}
        >
          <HStack
            align="center"
            justify="space-between"
            gap={4}
            px={6}
            pt={5}
            pb={3}
            pr={14}
          >
            <Text as="h2" fontSize="xl" fontWeight="900">
              Font Settings
              {projectTitle ? ` · ${projectTitle}` : ''}
            </Text>
            <SlidingTabList
              activeIndex={activeTabIndex}
              labels={tabLabels}
              layoutGroupId="font-settings-modal-tabs"
            />
          </HStack>

          <ModalBody pb={5} flex={1} minH={0}>
            <TabPanels h="100%">
              <TabPanel p={0} h="100%" overflow="auto">
                <FontBasicsTab
                  axes={axes}
                  customParametersText={customParametersText}
                  generalDraft={generalDraft}
                  mappingsText={mappingsText}
                  openTypeDraft={openTypeDraft}
                  unitsPerEm={unitsPerEm}
                  localizedNames={localizedNames}
                  onAxesChange={setAxes}
                  onCustomParametersTextChange={setCustomParametersText}
                  onGeneralDraftChange={setGeneralDraft}
                  onMappingsTextChange={setMappingsText}
                  onOpenTypeDraftChange={setOpenTypeDraft}
                  onUnitsPerEmChange={setUnitsPerEm}
                  onLocalizedNamesChange={setLocalizedNames}
                />
              </TabPanel>
              <TabPanel p={0} h="100%" overflow="auto">
                <FontSourcesTab
                  fontData={fontData}
                  sources={sources}
                  onSourcesChange={setSources}
                />
              </TabPanel>
              <TabPanel p={0} h="100%" overflow="auto">
                <FontExportsTab
                  exports={exports}
                  onExportsChange={setExports}
                />
              </TabPanel>
              <TabPanel p={0} h="100%" overflow="hidden">
                <FontFeaturesTab
                  fontData={fontData}
                  featuresText={featuresText}
                  openTypeFeatures={openTypeFeatures}
                  onFeaturesTextChange={setFeaturesText}
                  onOpenTypeFeaturesChange={setOpenTypeFeatures}
                />
              </TabPanel>
              <TabPanel p={0} h="100%" overflow="auto">
                <FontOtherTab
                  fontType={fontType}
                  outlineType={outlineType}
                  statusDefinitions={statusDefinitions}
                  onFontTypeChange={setFontType}
                  onOutlineTypeChange={setOutlineType}
                  onStatusDefinitionsChange={setStatusDefinitions}
                />
              </TabPanel>
              <TabPanel p={0} h="100%" overflow="auto">
                <FontSupplementalTab
                  notes={notes}
                  supplementalText={supplementalText}
                  onNotesChange={setNotes}
                  onSupplementalTextChange={setSupplementalText}
                />
              </TabPanel>
            </TabPanels>
          </ModalBody>

          <ModalFooter gap={3}>
            <Button variant="ghost" onClick={onClose}>
              關閉
            </Button>
            <Button onClick={handleSave} isDisabled={!fontData}>
              套用
            </Button>
          </ModalFooter>
        </Tabs>
      </ModalContent>
    </Modal>
  )
}
