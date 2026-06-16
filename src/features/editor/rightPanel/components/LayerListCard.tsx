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
  Text,
} from '@chakra-ui/react'
import { EyeClosed, EyeSolid } from 'iconoir-react'
import { useTranslation } from 'react-i18next'
import { useStore, type GlyphLayerData } from 'src/store'

interface LayerListCardProps {
  glyphId: string
  layers: GlyphLayerData[]
  activeLayerId: string | null
  onSelectLayer: (layerId: string) => void
}

function EyeToggle({
  visible,
  isDisabled = false,
  onToggle,
}: {
  visible: boolean
  isDisabled?: boolean
  onToggle: () => void
}) {
  return (
    <Box
      as="button"
      type="button"
      lineHeight={0}
      flexShrink={0}
      color={isDisabled ? 'field.muted' : 'field.ink'}
      opacity={isDisabled ? 0.4 : 1}
      cursor={isDisabled ? 'default' : 'pointer'}
      onClick={() => {
        if (!isDisabled) onToggle()
      }}
    >
      {visible ? (
        <EyeSolid width={16} height={16} />
      ) : (
        <EyeClosed width={16} height={16} />
      )}
    </Box>
  )
}

// Glyphs-style layer list: the active master (the edit surface, bold) plus
// backup layers (indented, with an actions menu), and a bottom non-editable
// reference row. The visibility eye sits on the far left of every row.
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
  const hideActiveLayer = useStore((state) => state.hideActiveLayer)
  const toggleActiveLayerHidden = useStore(
    (state) => state.toggleActiveLayerHidden
  )
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
        <Button
          size="xs"
          aria-label={t('editor.addBackupLayer')}
          onClick={() => createBackupLayer(glyphId)}
        >
          +
        </Button>
      </HStack>

      <Stack spacing={1}>
        {layers.map((layer) => {
          const isMaster = layer.type !== 'backup'
          const isActive = layer.id === activeLayerId
          const visible = isMaster
            ? !(isActive && hideActiveLayer)
            : visibleBackdropLayerIds.includes(layer.id)

          return (
            <HStack
              key={layer.id}
              spacing={2}
              px={2}
              py={1.5}
              borderRadius="sm"
              bg={isActive ? 'blackAlpha.100' : 'transparent'}
            >
              <EyeToggle
                visible={visible}
                isDisabled={isMaster && !isActive}
                onToggle={() =>
                  isMaster
                    ? toggleActiveLayerHidden()
                    : toggleBackdropLayer(layer.id)
                }
              />

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
                    <MenuItem onClick={() => duplicateLayer(glyphId, layer.id)}>
                      {t('editor.layerDuplicate')}
                    </MenuItem>
                    <MenuItem
                      onClick={() => deleteBackupLayer(glyphId, layer.id)}
                    >
                      {t('editor.layerDelete')}
                    </MenuItem>
                  </MenuList>
                </Menu>
              )}
            </HStack>
          )
        })}

        <HStack spacing={2} px={2} py={1.5} borderRadius="sm">
          <EyeToggle
            visible={referenceFontVisible}
            isDisabled={!referenceFontName}
            onToggle={() => setReferenceFontVisible(!referenceFontVisible)}
          />
          <Text
            fontSize="sm"
            color="field.muted"
            noOfLines={1}
            flex="1"
            minW={0}
          >
            {referenceFontName
              ? `${t('editor.referenceFont')} · ${referenceFontName}`
              : t('editor.referenceFont')}
          </Text>
        </HStack>
      </Stack>
    </Box>
  )
}
