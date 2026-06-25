import {
  Box,
  Button,
  HStack,
  Stack,
  Tabs,
  Text,
  Textarea,
  Dialog,
  Portal,
} from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import { useMemo, useRef, useState } from 'react'
import {
  SlidingTabList,
  SlidingTabsContentGroup,
  SlidingTabsRoot,
} from 'src/features/common/SlidingTabList'
import {
  GlyphPackageSelectionSummary,
  GlyphPackagePicker,
  type GlyphPackageSelection,
} from 'src/features/fontOverview/components/GlyphPackagePicker'
import { glyphNameToDisplayCharacter } from 'src/features/fontOverview/utils/glyphPackageDisplay'
import type { GlyphData } from 'src/store'
import { useTranslation } from 'react-i18next'

const emptyPackageSelection: GlyphPackageSelection = {
  glyphNames: [],
  drawnCount: 0,
  emptyGlyphNames: [],
  missingGlyphNames: [],
  packages: [],
}

interface AddGlyphModalProps {
  glyphMap: Record<string, GlyphData>
  inputValue: string
  isOpen: boolean
  onClose: () => void
  onInputChange: (value: string) => void
  onSubmitManualInput: () => void
  onSubmitGlyphNames: (glyphNames: string[]) => void
}

export function AddGlyphModal({
  glyphMap,
  inputValue,
  isOpen,
  onClose,
  onInputChange,
  onSubmitManualInput,
  onSubmitGlyphNames,
}: AddGlyphModalProps) {
  const { t } = useTranslation()

  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [isPackageConfirmOpen, setIsPackageConfirmOpen] = useState(false)
  const [packageSelection, setPackageSelection] =
    useState<GlyphPackageSelection>(emptyPackageSelection)
  const missingGlyphText = useMemo(
    () =>
      packageSelection.missingGlyphNames
        .map(glyphNameToDisplayCharacter)
        .join(', '),
    [packageSelection.missingGlyphNames]
  )

  const handleClose = () => {
    setIsPackageConfirmOpen(false)
    onClose()
  }

  const handleConfirmPackageGlyphs = () => {
    setIsPackageConfirmOpen(false)
    onSubmitGlyphNames(packageSelection.missingGlyphNames)
  }

  return (
    <>
      <Dialog.Root
        open={isOpen}
        initialFocusEl={() => inputRef.current}
        size="xl"
        placement="center"
        scrollBehavior="inside"
        onOpenChange={(e) => {
          if (!e.open) {
            handleClose()
          }
        }}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content borderRadius="sm" h="800px">
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
                    {t('fontOverview.addGlyph')}
                  </Text>
                  <SlidingTabList
                    activeIndex={activeTabIndex}
                    labels={['字集匯入', '手動輸入']}
                    layoutGroupId="add-glyph-modal-tabs"
                  />
                </HStack>
                <Dialog.Body pb={5} flex={1} minH={0}>
                  <SlidingTabsContentGroup h="100%" mt={0}>
                    <Tabs.Content value="0" p={0} h="100%" overflow="auto">
                      <GlyphPackagePicker
                        glyphMap={glyphMap}
                        onSelectionChange={setPackageSelection}
                      />
                    </Tabs.Content>
                    <Tabs.Content value="1" p={0} h="100%">
                      <Stack h="100%" gap={3}>
                        <Textarea
                          ref={inputRef}
                          placeholder={[
                            '輸入字符、glyph name、recipe 或範圍',
                            '例：字 uni8655 asmall-hira.vert A+ringcomb.lower=Aring uni4000:uni43FF',
                          ].join('\n')}
                          value={inputValue}
                          minH="480px"
                          flex={1}
                          resize="vertical"
                          fontFamily="mono"
                          onChange={(event) =>
                            onInputChange(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === 'Enter' &&
                              (event.metaKey || event.ctrlKey)
                            ) {
                              event.preventDefault()
                              onSubmitManualInput()
                            }
                          }}
                        />
                        <Text fontSize="sm" color="field.muted">
                          {t('fontOverview.glyphInputHint')}
                        </Text>
                      </Stack>
                    </Tabs.Content>
                  </SlidingTabsContentGroup>
                </Dialog.Body>
                <Dialog.Footer
                  gap={3}
                  alignItems="stretch"
                  flexDirection="column"
                >
                  <Box minW={0}>
                    {activeTabIndex === 0 && (
                      <GlyphPackageSelectionSummary
                        selection={packageSelection}
                      />
                    )}
                  </Box>
                  <HStack justify="flex-end" gap={3}>
                    <Button variant="ghost" onClick={handleClose}>
                      {t('fontOverview.cancel')}
                    </Button>
                    <Button
                      onClick={() => {
                        if (activeTabIndex === 0) {
                          setIsPackageConfirmOpen(true)
                          return
                        }

                        onSubmitManualInput()
                      }}
                    >
                      {t('fontOverview.add')}
                    </Button>
                  </HStack>
                </Dialog.Footer>
              </SlidingTabsRoot>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
      <Dialog.Root
        open={isPackageConfirmOpen}
        size="xl"
        placement="center"
        preventScroll={false}
        onOpenChange={(e) => {
          if (!e.open) {
            setIsPackageConfirmOpen(false)
          }
        }}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content borderRadius="sm" maxH="80vh">
              <DialogCloseButton />
              <Dialog.Body pt={6} pb={4} minH={0}>
                <Stack gap={3} minH={0}>
                  <Text fontSize="lg" fontWeight="900">
                    將會新增：
                  </Text>
                  <Box
                    maxH="52vh"
                    overflowY="auto"
                    overscrollBehavior="contain"
                    onWheel={(event) => event.stopPropagation()}
                    border="2px solid"
                    borderColor="field.haze"
                    borderRadius="2px"
                    p={3}
                  >
                    {missingGlyphText.length > 0 ? (
                      <Text
                        color="field.ink"
                        fontSize="lg"
                        lineHeight="1.45"
                        wordBreak="break-all"
                      >
                        {missingGlyphText}
                      </Text>
                    ) : (
                      <Text color="field.muted">
                        {t('fontOverview.noGlyphsToAdd')}
                      </Text>
                    )}
                  </Box>
                </Stack>
              </Dialog.Body>
              <Dialog.Footer gap={3}>
                <Button
                  variant="ghost"
                  onClick={() => setIsPackageConfirmOpen(false)}
                >
                  {t('fontOverview.cancel')}
                </Button>
                <Button
                  onClick={handleConfirmPackageGlyphs}
                  disabled={packageSelection.missingGlyphNames.length === 0}
                >
                  確定
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  )
}
