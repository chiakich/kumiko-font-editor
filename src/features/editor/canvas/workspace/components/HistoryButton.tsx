import { Button } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import { Redo, Undo } from 'iconoir-react'

interface HistoryButtonProps {
  action: 'undo' | 'redo'
  isDisabled: boolean
  onClick: () => void
}

export function HistoryButton({
  action,
  isDisabled,
  onClick,
}: HistoryButtonProps) {
  const Icon = action === 'undo' ? Undo : Redo
  const label = action === 'undo' ? 'Undo' : 'Redo'

  return (
    <Tooltip content={label}>
      <Button
        size="xs"
        minW={8}
        h={8}
        px={0}
        variant="ghost"
        color="whiteAlpha.900"
        onClick={onClick}
        disabled={isDisabled}
        aria-label={label}
      >
        <Icon width={18} height={18} strokeWidth={1.9} aria-hidden="true" />
      </Button>
    </Tooltip>
  )
}
