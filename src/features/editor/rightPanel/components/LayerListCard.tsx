import {
  Badge,
  Box,
  Button,
  Editable,
  EditableInput,
  EditablePreview,
  HStack,
  Heading,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Stack,
  Switch,
  Text,
} from '@chakra-ui/react'
import { useTranslation } from 'react-i18next'
import { useStore, type GlyphLayerData } from 'src/store'

interface LayerListCardProps {
  glyphId: string
  layers: GlyphLayerData[]
  activeLayerId: string | null
  onSelectLayer: (layerId: string) => void
}

// Glyphs-style layer list: the active master (the edit surface, bold) plus
// backup layers (indented, with eye/visibility and an actions menu), and a
// bottom non-editable reference row.
export function LayerListCard({
  glyphId,
  layers,
  activeLayerId,
  onSelectLayer,
}: LayerListCardProps) {
  const { t } = useTranslation()
  const createBackupLayer = useStore((state) => state.createBackupLayer)
  const duplicateLayer = useStore((state) => state.duplicateLayer)
  const deleteBackupLayer = useStore((state) => state.deleteBackupLayer)
  const renameBackupLayer = useStore((state) => state.renameBackupLayer)
  const promoteBackupToMaster = useStore((state) => state.promoteBackupToMaster)
  const visibleBackdropLayerIds = useStore(
    (state) => state.visibleBackdropLayerIds
  )
  const toggleBackdropLayer = useStore((state) => state.toggleBackdropLayer)
  const referenceFontName = useStore((state) => state.referenceFontName)
  const referenceFontVisible = useStore((state) => state.referenceFontVisible)
  const setReferenceFontVisible = useStore(
    (state) => state.setReferenceFontVisible
  )

  return (
    <Box p={4} bg="field.panel" borderRadius="sm">
      <HStack justify="space-between" mb={3}>
        <Heading size="sm" textTransform="uppercase" color="field.ink">
          {t('editor.layers')}
        </Heading>
        <Button size="xs" onClick={() => createBackupLayer(glyphId)}>
          {t('editor.addBackupLayer')}
        </Button>
      </HStack>

      <Stack spacing={1}>
        {layers.map((layer) => {
          const isMaster = layer.type !== 'backup'
          const isActive = layer.id === activeLayerId

          return (
            <HStack
              key={layer.id}
              justify="space-between"
              px={2}
              py={1.5}
              pl={isMaster ? 2 : 5}
              borderRadius="sm"
              bg={isActive ? 'blackAlpha.100' : 'transparent'}
            >
              {isMaster ? (
                <Box
                  as="button"
                  type="button"
                  flex="1"
                  minW={0}
                  textAlign="left"
                  onClick={() => onSelectLayer(layer.id)}
                >
                  <Text fontSize="sm" fontWeight="700" noOfLines={1}>
                    {layer.name || layer.id}
                  </Text>
                </Box>
              ) : (
                <Editable
                  flex="1"
                  minW={0}
                  fontSize="sm"
                  defaultValue={layer.name}
                  onSubmit={(value) =>
                    renameBackupLayer(
                      glyphId,
                      layer.id,
                      value.trim() || layer.name
                    )
                  }
                >
                  <EditablePreview noOfLines={1} />
                  <EditableInput />
                </Editable>
              )}

              {isMaster ? (
                isActive ? (
                  <Badge colorScheme="cyan" fontSize="2xs">
                    {t('editor.layerEditing')}
                  </Badge>
                ) : null
              ) : (
                <HStack spacing={1}>
                  <Switch
                    size="sm"
                    isChecked={visibleBackdropLayerIds.includes(layer.id)}
                    onChange={() => toggleBackdropLayer(layer.id)}
                  />
                  <Menu>
                    <MenuButton
                      as={Button}
                      size="xs"
                      variant="ghost"
                      px={1}
                      aria-label={t('editor.layerActions')}
                    >
                      ⋯
                    </MenuButton>
                    <MenuList>
                      <MenuItem
                        onClick={() => promoteBackupToMaster(glyphId, layer.id)}
                      >
                        {t('editor.layerUseAsMaster')}
                      </MenuItem>
                      <MenuItem
                        onClick={() => duplicateLayer(glyphId, layer.id)}
                      >
                        {t('editor.layerDuplicate')}
                      </MenuItem>
                      <MenuItem
                        onClick={() => deleteBackupLayer(glyphId, layer.id)}
                      >
                        {t('editor.layerDelete')}
                      </MenuItem>
                    </MenuList>
                  </Menu>
                </HStack>
              )}
            </HStack>
          )
        })}

        <HStack
          justify="space-between"
          px={2}
          py={1.5}
          borderRadius="sm"
          opacity={referenceFontName ? 1 : 0.6}
        >
          <Text fontSize="sm" color="field.muted" noOfLines={1}>
            {referenceFontName
              ? `${t('editor.referenceFont')} · ${referenceFontName}`
              : t('editor.referenceFont')}
          </Text>
          <Switch
            size="sm"
            isDisabled={!referenceFontName}
            isChecked={referenceFontVisible}
            onChange={(event) => setReferenceFontVisible(event.target.checked)}
          />
        </HStack>
      </Stack>
    </Box>
  )
}
