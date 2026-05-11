import { Badge, Box, HStack, Stack, Text } from '@chakra-ui/react'

const UPCOMING_SECTIONS = [['Anchors', 'Mark attachment points']] as const

export function BehaviorPlaceholderSections() {
  return (
    <Stack spacing={2}>
      {UPCOMING_SECTIONS.map(([label, detail]) => (
        <Box
          key={label}
          borderWidth="1px"
          borderColor="field.panelMuted"
          bg="field.panel"
          px={3}
          py={2}
        >
          <HStack justify="space-between" align="center">
            <Stack spacing={0}>
              <Text fontSize="sm" fontWeight="semibold">
                {label}
              </Text>
              <Text fontSize="xs" color="field.muted">
                {detail}
              </Text>
            </Stack>
            <Badge colorScheme="gray">Later</Badge>
          </HStack>
        </Box>
      ))}
    </Stack>
  )
}
