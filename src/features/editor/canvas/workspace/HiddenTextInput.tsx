import { Box } from '@chakra-ui/react'
import type { ToolId } from 'src/features/editor/canvas/workspace/types'

interface HiddenTextInputProps {
  activeToolId: ToolId
  compositionOverlayStyle: { left: number; top: number } | null
  compositionText: string
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  textInputValue: string
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
  onCompositionEnd: (event: React.CompositionEvent<HTMLTextAreaElement>) => void
  onCompositionStart: () => void
  onCompositionUpdate: (
    event: React.CompositionEvent<HTMLTextAreaElement>
  ) => void
  onSelect: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void
}

export function HiddenTextInput({
  activeToolId,
  compositionOverlayStyle,
  compositionText,
  inputRef,
  textInputValue,
  onChange,
  onCompositionEnd,
  onCompositionStart,
  onCompositionUpdate,
  onSelect,
}: HiddenTextInputProps) {
  return (
    <>
      <textarea
        ref={inputRef}
        value={textInputValue}
        onChange={onChange}
        onSelect={onSelect}
        onCompositionStart={onCompositionStart}
        onCompositionUpdate={onCompositionUpdate}
        onCompositionEnd={onCompositionEnd}
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: activeToolId === 'text' ? 'auto' : 'none',
          width: 1,
          height: 1,
          left: 0,
          top: 0,
        }}
      />
      {compositionOverlayStyle ? (
        <Box
          position="absolute"
          left={`${compositionOverlayStyle.left}px`}
          top={`${compositionOverlayStyle.top}px`}
          transform="translateX(-1px)"
          px={1}
          py={0.5}
          fontSize="20px"
          lineHeight="1.2"
          color="gray.900"
          bg="rgba(255,255,255,0.92)"
          borderRadius="sm"
          borderBottom="2px solid"
          borderColor="teal.500"
          pointerEvents="none"
          whiteSpace="pre"
        >
          {compositionText}
        </Box>
      ) : null}
    </>
  )
}
