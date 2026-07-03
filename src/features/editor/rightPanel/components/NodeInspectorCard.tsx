import {
  Box,
  Button,
  Grid,
  GridItem,
  Heading,
  Input,
  Stack,
  Tag,
  Text,
} from '@chakra-ui/react'
import SmoothNodeIcon from 'src/assets/icons/SmoothNodeIcon.svg?react'
import CornerNodeIcon from 'src/assets/icons/CornerNodeIcon.svg?react'
import type { NodeType, SelectedSegmentState } from 'src/store'
import { useTranslation } from 'react-i18next'

interface NodeInspectorCardProps {
  effectiveNodeType: NodeType | undefined
  isEndpointNode: boolean
  isOnCurveNode: boolean
  nodeRef: { pathId: string; nodeId: string } | null
  selectedNode: { x: number; y: number } | null
  selectedSegment: SelectedSegmentState | null
  onCoordinateChange: (axis: 'x' | 'y', value: string) => void
  onConvertSelectedSegment: () => void
  onNodeTypeChange: (type: NodeType) => void
}

export function NodeInspectorCard({
  effectiveNodeType,
  isEndpointNode,
  isOnCurveNode,
  nodeRef,
  selectedNode,
  selectedSegment,
  onCoordinateChange,
  onConvertSelectedSegment,
  onNodeTypeChange,
}: NodeInspectorCardProps) {
  const { t } = useTranslation()

  return (
    <Box p={4} bg="card" borderRadius="sm">
      <Heading size="sm" mb={3} textTransform="uppercase" color="foreground">
        {t('editor.nodeView')}
      </Heading>
      {!selectedNode || !nodeRef ? (
        selectedSegment ? (
          <Stack gap={3}>
            <Text fontSize="sm" color="foreground" fontFamily="mono">
              {t('editor.segment')}{' '}
              <Tag.Root size="sm" ml={2}>
                {selectedSegment.pathId}
              </Tag.Root>
            </Text>
            <Text fontSize="sm" color="mutedForeground">
              {t('editor.highlightedSegmentPrefix')}
              {selectedSegment.type === 'line' ? '直線' : '曲線'}。
            </Text>
            {selectedSegment.type === 'line' ? (
              <Button size="sm" onClick={onConvertSelectedSegment}>
                {t('editor.convertToCurve')}
              </Button>
            ) : (
              <Text fontSize="sm" color="mutedForeground">
                {t('editor.segmentAlreadyCurve')}
              </Text>
            )}
          </Stack>
        ) : (
          <Text fontSize="sm" color="mutedForeground">
            {t('editor.noNodeSelectedHint')}
          </Text>
        )
      ) : (
        <Stack gap={3}>
          <Text fontSize="sm" color="foreground" fontFamily="mono">
            {t('editor.path')}{' '}
            <Tag.Root size="sm" ml={2}>
              {nodeRef.pathId}
            </Tag.Root>
          </Text>

          <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={3}>
            <GridItem>
              <Text
                fontSize="xs"
                color="mutedForeground"
                mb={1}
                fontFamily="mono"
              >
                X
              </Text>
              <Input
                size="sm"
                type="number"
                value={selectedNode.x}
                onChange={(event) =>
                  onCoordinateChange('x', event.target.value)
                }
              />
            </GridItem>
            <GridItem>
              <Text
                fontSize="xs"
                color="mutedForeground"
                mb={1}
                fontFamily="mono"
              >
                Y
              </Text>
              <Input
                size="sm"
                type="number"
                value={selectedNode.y}
                onChange={(event) =>
                  onCoordinateChange('y', event.target.value)
                }
              />
            </GridItem>
          </Grid>

          {!isOnCurveNode ? (
            <Text fontSize="sm" color="mutedForeground">
              {t('editor.selectedHandleNoNodeType')}
            </Text>
          ) : (
            <Stack gap={2}>
              <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={2}>
                <Button
                  size="sm"
                  variant={effectiveNodeType === 'corner' ? 'solid' : 'outline'}
                  onClick={() => onNodeTypeChange('corner')}
                >
                  <CornerNodeIcon />
                  {t('editor.corner')}
                </Button>
                <Button
                  size="sm"
                  variant={effectiveNodeType === 'smooth' ? 'solid' : 'outline'}
                  onClick={() => onNodeTypeChange('smooth')}
                  disabled={isEndpointNode}
                >
                  <SmoothNodeIcon />
                  {t('editor.smooth')}
                </Button>
              </Grid>
              <Text fontSize="xs" color="mutedForeground">
                {isEndpointNode
                  ? '開放路徑的起點與終點只有一根手把，所以固定為折線。'
                  : effectiveNodeType === 'smooth'
                    ? '平滑節點的兩根手把會連動，維持曲線方向。'
                    : '折線節點的兩根手把可分開移動，會視為折線轉折。'}
              </Text>
            </Stack>
          )}
        </Stack>
      )}
    </Box>
  )
}
