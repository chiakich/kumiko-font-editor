import { Box, HStack, IconButton, Stack, Text } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { ArrowLeft } from 'iconoir-react'
import { useTranslation } from 'react-i18next'
import { FontFeaturesTab } from 'src/features/common/projectControl/fontSettings/components/FontFeaturesTab'
import {
  createEmptyOpenTypeFeaturesState,
  createFontFingerprint,
  type OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import { useStore } from 'src/store'

// The OpenType feature workspace as a first-class view: same feature model the
// settings modal edits, but full screen and writing straight into the project
// (dirty + auto draft save) instead of a modal-local draft behind an Apply.
export function FeatureWorkspaceScreen() {
  const { t } = useTranslation()
  const fontData = useStore((state) => state.fontData)
  const projectTitle = useStore((state) => state.projectTitle)
  const updateFontSettings = useStore((state) => state.updateFontSettings)
  const setWorkspaceView = useStore((state) => state.setWorkspaceView)

  if (!fontData) {
    return null
  }

  const openTypeFeatures =
    fontData.openTypeFeatures ??
    createEmptyOpenTypeFeaturesState(createFontFingerprint(fontData))

  const handleChange = (next: OpenTypeFeaturesState) => {
    updateFontSettings({ openTypeFeatures: next })
  }

  return (
    <Stack h="100dvh" gap={0} bg="background" color="foreground">
      <HStack
        gap={3}
        px={4}
        py={2.5}
        borderBottomWidth="1px"
        borderColor="controlBorder"
        flexShrink={0}
      >
        <Tooltip content={t('featureWorkspace.backToOverview')}>
          <IconButton
            aria-label={t('featureWorkspace.backToOverview')}
            size="sm"
            variant="ghost"
            borderRadius="full"
            onClick={() => setWorkspaceView('overview')}
          >
            <ArrowLeft width={18} height={18} aria-hidden="true" />
          </IconButton>
        </Tooltip>
        <Stack gap={0} minW={0}>
          <Text fontSize="sm" fontWeight={800} lineClamp={1}>
            {t('featureWorkspace.title')}
          </Text>
          <Text fontSize="xs" color="mutedForeground" lineClamp={1}>
            {projectTitle}
          </Text>
        </Stack>
      </HStack>
      <Box flexGrow={1} minH={0} px={4} py={3}>
        <FontFeaturesTab
          fontData={fontData}
          openTypeFeatures={openTypeFeatures}
          onOpenTypeFeaturesChange={handleChange}
        />
      </Box>
    </Stack>
  )
}
