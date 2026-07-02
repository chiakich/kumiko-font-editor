import { Button, HStack, Tabs, Text, Dialog, Portal } from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import { useState } from 'react'
import {
  SlidingTabList,
  SlidingTabsContentGroup,
  SlidingTabsRoot,
} from 'src/features/common/SlidingTabList'
import { FontBasicsTab } from 'src/features/common/projectControl/fontSettings/components/FontBasicsTab'
import { FontExportsTab } from 'src/features/common/projectControl/fontSettings/components/FontExportsTab'
import { FontFeaturesTab } from 'src/features/common/projectControl/fontSettings/components/FontFeaturesTab'
import { FontOtherTab } from 'src/features/common/projectControl/fontSettings/components/FontOtherTab'
import { FontSourcesTab } from 'src/features/common/projectControl/fontSettings/components/FontSourcesTab'
import { FontSupplementalTab } from 'src/features/common/projectControl/fontSettings/components/FontSupplementalTab'
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
} from 'src/features/common/projectControl/fontSettings/utils/model'
import { defaultFontAxes } from 'src/lib/fontFormats/fontInfoSettings'
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
import { useTranslation } from 'react-i18next'

interface FontSettingsModalProps {
  fontData: FontData | null
  isOpen: boolean
  projectTitle: string
  onClose: () => void
  onSave: (update: Partial<FontData>) => void
}

const tabLabels = ['字型', '主版', '匯出', 'OpenType', '其他', '補充']

export function FontSettingsModal({
  fontData,
  isOpen,
  projectTitle,
  onClose,
  onSave,
}: FontSettingsModalProps) {
  const { t } = useTranslation()

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
      openTypeFeatures,
      statusDefinitions,
      settings: nextSettings,
    })
    onClose()
  }

  return (
    <Dialog.Root
      open={isOpen}
      size="xl"
      scrollBehavior="inside"
      onOpenChange={(e) => {
        if (!e.open) {
          onClose()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="sm" h="90vh">
            <DialogCloseButton zIndex={2} />
            <SlidingTabsRoot
              size="sm"
              display="flex"
              flex={1}
              flexDirection="column"
              minH={0}
              value={String(activeTabIndex)}
              onValueChange={(details) =>
                setActiveTabIndex(Number(details.value))
              }
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
                  {t('projectControl.fontSettings')}
                  {projectTitle ? ` · ${projectTitle}` : ''}
                </Text>
                <SlidingTabList
                  activeIndex={activeTabIndex}
                  labels={tabLabels}
                  layoutGroupId="font-settings-modal-tabs"
                />
              </HStack>

              <Dialog.Body pb={5} flex={1} minH={0}>
                <SlidingTabsContentGroup h="100%" mt={0}>
                  <Tabs.Content value="0" p={0} h="100%" overflow="auto">
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
                  </Tabs.Content>
                  <Tabs.Content value="1" p={0} h="100%" overflow="auto">
                    <FontSourcesTab
                      fontData={fontData}
                      sources={sources}
                      onSourcesChange={setSources}
                    />
                  </Tabs.Content>
                  <Tabs.Content value="2" p={0} h="100%" overflow="auto">
                    <FontExportsTab
                      axes={axes}
                      sources={sources}
                      exports={exports}
                      onExportsChange={setExports}
                    />
                  </Tabs.Content>
                  <Tabs.Content value="3" p={0} h="100%" overflow="hidden">
                    <FontFeaturesTab
                      fontData={fontData}
                      openTypeFeatures={openTypeFeatures}
                      onOpenTypeFeaturesChange={setOpenTypeFeatures}
                    />
                  </Tabs.Content>
                  <Tabs.Content value="4" p={0} h="100%" overflow="auto">
                    <FontOtherTab
                      fontType={fontType}
                      outlineType={outlineType}
                      statusDefinitions={statusDefinitions}
                      onFontTypeChange={setFontType}
                      onOutlineTypeChange={setOutlineType}
                      onStatusDefinitionsChange={setStatusDefinitions}
                    />
                  </Tabs.Content>
                  <Tabs.Content value="5" p={0} h="100%" overflow="auto">
                    <FontSupplementalTab
                      notes={notes}
                      supplementalText={supplementalText}
                      onNotesChange={setNotes}
                      onSupplementalTextChange={setSupplementalText}
                    />
                  </Tabs.Content>
                </SlidingTabsContentGroup>
              </Dialog.Body>

              <Dialog.Footer gap={3}>
                <Button variant="ghost" onClick={onClose}>
                  {t('projectControl.close')}
                </Button>
                <Button onClick={handleSave} disabled={!fontData}>
                  {t('projectControl.apply')}
                </Button>
              </Dialog.Footer>
            </SlidingTabsRoot>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
