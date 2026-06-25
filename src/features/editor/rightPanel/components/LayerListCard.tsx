import {
  Badge,
  Box,
  Button,
  HStack,
  Heading,
  IconButton,
  Input,
  Menu,
  Stack,
  Text,
  useDisclosure,
  Portal,
} from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { EyeClosed, EyeSolid, Settings } from 'iconoir-react'
import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  LayerColorContextMenu,
  LayerColorDot,
} from 'src/features/editor/rightPanel/components/LayerListCard/LayerColorControls'
import { ReferenceFontSettingsModal } from 'src/features/editor/rightPanel/components/ReferenceFontSettingsModal'
import { useStore, type GlyphLayerData } from 'src/store'

interface LayerListCardProps {
  glyphId: string
  layers: GlyphLayerData[]
  activeLayerId: string | null
  onSelectLayer: (layerId: string) => void
}

interface LayerColorMenuState {
  layerId: string
  x: number
  y: number
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
      lineHeight={0}
      flexShrink={0}
      color={isDisabled ? 'field.muted' : 'field.ink'}
      opacity={isDisabled ? 0.4 : 1}
      cursor={isDisabled ? 'default' : 'pointer'}
      asChild
    >
      <button
        type="button"
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation()
          if (!isDisabled) onToggle()
        }}
      >
        {visible ? (
          <EyeSolid width={16} height={16} />
        ) : (
          <EyeClosed width={16} height={16} />
        )}
      </button>
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
  const referenceFontSettings = useDisclosure()
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [layerColorMenu, setLayerColorMenu] =
    useState<LayerColorMenuState | null>(null)
  const createBackupLayer = useStore((state) => state.createBackupLayer)
  const sources = useStore((state) => state.fontData?.sources)
  const createGlyphMasterLayer = useStore(
    (state) => state.createGlyphMasterLayer
  )
  const setActiveMasterId = useStore((state) => state.setActiveMasterId)
  const duplicateLayer = useStore((state) => state.duplicateLayer)
  const deleteBackupLayer = useStore((state) => state.deleteBackupLayer)
  const renameBackupLayer = useStore((state) => state.renameBackupLayer)
  const promoteBackupToMaster = useStore((state) => state.promoteBackupToMaster)
  const setLayerColor = useStore((state) => state.setLayerColor)
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
  const layerColorMenuLayer =
    layers.find((layer) => layer.id === layerColorMenu?.layerId) ?? null
  const submitRename = (layer: GlyphLayerData) => {
    const name = renameValue.trim() || layer.name
    setRenamingLayerId(null)
    setRenameValue('')
    if (name !== layer.name) {
      renameBackupLayer(glyphId, layer.id, name)
    }
  }

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
      <Stack gap={1}>
        {layers.map((layer) => {
          const isMaster = layer.type !== 'backup'
          const isActive = layer.id === activeLayerId
          const visible = isActive
            ? !hideActiveLayer
            : visibleBackdropLayerIds.includes(layer.id)
          const rowBg = isActive ? 'blackAlpha.100' : 'transparent'
          const rowBorderColor = isActive ? 'field.yellow.400' : 'transparent'

          return (
            <HStack
              key={layer.id}
              gap={2}
              px={2}
              py={1.5}
              borderRadius="sm"
              bg={rowBg}
              borderLeft="3px solid"
              borderColor={rowBorderColor}
              cursor="default"
              onClick={() => onSelectLayer(layer.id)}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setLayerColorMenu({
                  layerId: layer.id,
                  x: event.clientX,
                  y: event.clientY,
                })
              }}
            >
              <EyeToggle
                visible={visible}
                onToggle={() =>
                  isActive
                    ? toggleActiveLayerHidden()
                    : toggleBackdropLayer(layer.id)
                }
              />
              <LayerColorDot color={layer.color} />
              {isMaster ? (
                <Box flex="1" minW={0} textAlign="left" asChild>
                  <button type="button">
                    <Text fontSize="sm" fontWeight="700" lineClamp={1}>
                      {layer.name || layer.id}
                    </Text>
                  </button>
                </Box>
              ) : (
                <Box flex="1" minW={0} ml={4}>
                  {renamingLayerId === layer.id ? (
                    <Input
                      size="xs"
                      autoFocus
                      value={renameValue}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={() => submitRename(layer)}
                      onKeyDown={(
                        event: ReactKeyboardEvent<HTMLInputElement>
                      ) => {
                        if (event.key === 'Enter') {
                          event.currentTarget.blur()
                        }
                        if (event.key === 'Escape') {
                          setRenamingLayerId(null)
                          setRenameValue('')
                        }
                      }}
                    />
                  ) : (
                    <Text
                      w="100%"
                      minW={0}
                      textAlign="left"
                      fontSize="sm"
                      color="field.ink"
                      lineClamp={1}
                      asChild
                    >
                      <button
                        type="button"
                        onDoubleClick={(event) => {
                          event.stopPropagation()
                          setRenamingLayerId(layer.id)
                          setRenameValue(layer.name)
                        }}
                      >
                        {layer.name}
                      </button>
                    </Text>
                  )}
                </Box>
              )}
              {isActive ? (
                <Badge colorPalette="cyan" fontSize="2xs">
                  {t('editor.layerEditing')}
                </Badge>
              ) : null}
              {!isMaster ? (
                <Menu.Root>
                  <Menu.Trigger asChild>
                    <Button
                      size="xs"
                      variant="ghost"
                      px={1}
                      aria-label={t('editor.layerActions')}
                      onClick={(event) => event.stopPropagation()}
                    >
                      ⋯
                    </Button>
                  </Menu.Trigger>
                  <Portal>
                    <Menu.Positioner>
                      <Menu.Content>
                        <Menu.Item
                          onSelect={() =>
                            promoteBackupToMaster(glyphId, layer.id)
                          }
                          value="item-0"
                        >
                          {t('editor.layerUseAsMaster')}
                        </Menu.Item>
                        <Menu.Item
                          onSelect={() => duplicateLayer(glyphId, layer.id)}
                          value="item-1"
                        >
                          {t('editor.layerDuplicate')}
                        </Menu.Item>
                        <Menu.Item
                          onSelect={() => deleteBackupLayer(glyphId, layer.id)}
                          value="item-2"
                        >
                          {t('editor.layerDelete')}
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Positioner>
                  </Portal>
                </Menu.Root>
              ) : null}
            </HStack>
          )
        })}

        {Object.values(sources ?? {})
          .filter((source) => !layers.some((layer) => layer.id === source.id))
          .map((source) => (
            <HStack
              key={`missing-${source.id}`}
              gap={2}
              px={2}
              py={1.5}
              borderRadius="sm"
              borderLeft="3px solid"
              borderColor="transparent"
              opacity={0.6}
            >
              <Box w="16px" flexShrink={0} />
              <Text
                flex="1"
                minW={0}
                fontSize="sm"
                fontStyle="italic"
                color="field.muted"
                lineClamp={1}
              >
                {source.name}
              </Text>
              <Button
                size="xs"
                variant="ghost"
                px={1}
                aria-label={`${t('editor.addBackupLayer')} ${source.name}`}
                title={source.name}
                onClick={() => {
                  createGlyphMasterLayer(glyphId, source.id)
                  setActiveMasterId(source.id)
                }}
              >
                +
              </Button>
            </HStack>
          ))}

        <HStack gap={2} px={2} py={1.5} borderRadius="sm">
          <EyeToggle
            visible={referenceFontVisible}
            isDisabled={!referenceFontName}
            onToggle={() => setReferenceFontVisible(!referenceFontVisible)}
          />
          <Text
            fontSize="sm"
            color="field.muted"
            lineClamp={1}
            flex="1"
            minW={0}
          >
            {referenceFontName
              ? `${t('editor.referenceFont')} · ${referenceFontName}`
              : t('editor.referenceFont')}
          </Text>
          <Tooltip content={t('editor.referenceFontSettings')}>
            <IconButton
              size="xs"
              variant="ghost"
              aria-label={t('editor.referenceFontSettings')}
              onClick={(event) => {
                event.stopPropagation()
                referenceFontSettings.onOpen()
              }}
            >
              <Settings width={16} height={16} />
            </IconButton>
          </Tooltip>
        </HStack>
      </Stack>
      <ReferenceFontSettingsModal
        isOpen={referenceFontSettings.open}
        onClose={referenceFontSettings.onClose}
      />
      {layerColorMenu && layerColorMenuLayer ? (
        <LayerColorContextMenu
          layer={layerColorMenuLayer}
          position={{ x: layerColorMenu.x, y: layerColorMenu.y }}
          onClose={() => setLayerColorMenu(null)}
          onSelect={(color) =>
            setLayerColor(glyphId, layerColorMenuLayer.id, color)
          }
        />
      ) : null}
    </Box>
  )
}
