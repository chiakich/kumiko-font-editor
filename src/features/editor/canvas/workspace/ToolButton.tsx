import { Button, Tooltip } from '@chakra-ui/react'
import type { ToolId } from 'src/features/editor/canvas/workspace/types'
import { TOOL_ICONS } from 'src/features/editor/canvas/workspace/toolIcons'

interface ToolButtonProps {
  isActive: boolean
  label: string
  shortcut: string
  status: 'ready'
  toolId: ToolId
  onSelect: (toolId: ToolId) => void
}

export function ToolButton({
  isActive,
  label,
  shortcut,
  status,
  toolId,
  onSelect,
}: ToolButtonProps) {
  const ToolIcon = TOOL_ICONS[toolId]

  return (
    <Tooltip label={`${label} (${shortcut})`}>
      <Button
        size="xs"
        minW={8}
        h={8}
        px={0}
        borderRadius="sm"
        variant={isActive ? 'solid' : 'ghost'}
        bg={
          isActive
            ? undefined
            : status === 'ready'
              ? 'whiteAlpha.100'
              : 'field.red.400'
        }
        color={
          isActive ? undefined : status === 'ready' ? 'whiteAlpha.900' : 'black'
        }
        onClick={() => onSelect(toolId)}
        aria-label={label}
      >
        <ToolIcon width={18} height={18} strokeWidth={1.9} aria-hidden="true" />
      </Button>
    </Tooltip>
  )
}
