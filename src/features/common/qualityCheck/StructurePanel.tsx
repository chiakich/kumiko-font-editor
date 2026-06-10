import { Badge, Box, HStack, SimpleGrid, Text } from '@chakra-ui/react'

const structureGroups = [
  {
    title: '左右對稱',
    sample: '口日目田中凹凸',
    metric: '中心偏移',
    status: '待接入',
  },
  {
    title: '上下延伸',
    sample: '一二三王量',
    metric: '高度排序',
    status: '待接入',
  },
  {
    title: '框架 / 樹枝',
    sample: '国囿圃围圖',
    metric: '邊界範圍',
    status: '待接入',
  },
]

export function StructurePanel() {
  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
      {structureGroups.map((group) => (
        <Box
          key={group.title}
          borderWidth={1}
          borderColor="field.line"
          bg="field.panel"
          p={4}
        >
          <HStack justify="space-between" mb={3}>
            <Text fontWeight="900">{group.title}</Text>
            <Badge colorScheme="gray">{group.status}</Badge>
          </HStack>
          <Text fontFamily="glyph" fontSize="3xl" lineHeight="1.2" mb={3}>
            {group.sample}
          </Text>
          <Text fontSize="xs" color="field.muted" fontWeight="800">
            {group.metric}
          </Text>
        </Box>
      ))}
    </SimpleGrid>
  )
}
