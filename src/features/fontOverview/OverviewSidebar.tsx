import {
  Box,
  Button,
  Checkbox,
  Divider,
  Heading,
  HStack,
  Input,
  Select,
  Stack,
  Tag,
  Text,
  VStack,
} from '@chakra-ui/react'
import type { OverviewGroupBy } from 'src/lib/glyphOverview'
import type { GlyphData } from 'src/store'

interface OverviewSection {
  id: string
  label: string
  glyphs: GlyphData[]
}

interface OverviewSidebarProps {
  currentSearchQuery: string
  groupBy: OverviewGroupBy
  glyphInputValue: string
  isAddingGlyphs: boolean
  overviewGlyphCount: number
  projectTitle: string
  sections: OverviewSection[]
  selectedSectionId: string
  showOnlyEmptyGlyphs: boolean
  onCancelAddGlyphs: () => void
  onCloseProject: () => void
  onGlyphInputChange: (value: string) => void
  onGlyphInputSubmit: () => void
  onGroupingChange: (value: OverviewGroupBy) => void
  onSearchQueryChange: (value: string) => void
  onSectionSelect: (sectionId: string) => void
  onShowOnlyEmptyGlyphsChange: (value: boolean) => void
  onToggleAddGlyphs: () => void
}

export function OverviewSidebar({
  currentSearchQuery,
  groupBy,
  glyphInputValue,
  isAddingGlyphs,
  overviewGlyphCount,
  projectTitle,
  sections,
  selectedSectionId,
  showOnlyEmptyGlyphs,
  onCancelAddGlyphs,
  onCloseProject,
  onGlyphInputChange,
  onGlyphInputSubmit,
  onGroupingChange,
  onSearchQueryChange,
  onSectionSelect,
  onShowOnlyEmptyGlyphsChange,
  onToggleAddGlyphs,
}: OverviewSidebarProps) {
  return (
    <Box
      p={4}
      h="100%"
      display="flex"
      flexDirection="column"
      bg="field.paper"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <VStack align="stretch" spacing={3} mb={4}>
        <HStack justify="space-between" align="flex-start">
          <Box>
            <Text
              fontSize="xs"
              textTransform="uppercase"
              letterSpacing="0.16em"
              color="field.muted"
              mb={1}
              fontFamily="mono"
              fontWeight="900"
            >
              Kumiko Font Editor
            </Text>
            <Heading
              color="field.ink"
              fontSize="38px"
              lineHeight="0.86"
              letterSpacing="0"
            >
              所有字符
            </Heading>
            <Text fontSize="sm" color="field.muted" mt={2} noOfLines={2}>
              {projectTitle}
            </Text>
          </Box>
          <Button size="sm" variant="ghost" onClick={onCloseProject}>
            ⬅︎ 首頁
          </Button>
        </HStack>

        <Box>
          {!isAddingGlyphs ? (
            <Button
              size="sm"
              variant="outline"
              width="full"
              onClick={onToggleAddGlyphs}
            >
              ＋ 新增字符
            </Button>
          ) : (
            <Stack spacing={2}>
              <Input
                placeholder="輸入字符或 uni8655 uni8656"
                value={glyphInputValue}
                onChange={(event) => onGlyphInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    onGlyphInputSubmit()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancelAddGlyphs()
                  }
                }}
              />
              <HStack>
                <Button size="sm" flex={1} onClick={onGlyphInputSubmit}>
                  新增
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancelAddGlyphs}>
                  取消
                </Button>
              </HStack>
            </Stack>
          )}
        </Box>

        <Input
          placeholder="搜尋字符、glyph name 或 unicode"
          value={currentSearchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />

        <Box>
          <Text fontSize="xs" color="field.muted" mb={1} fontFamily="mono">
            Grouping
          </Text>
          <Select
            size="sm"
            value={groupBy}
            onChange={(event) =>
              onGroupingChange(event.target.value as OverviewGroupBy)
            }
          >
            <option value="script">語系 / Script</option>
            <option value="block">Unicode Block</option>
            <option value="none">不分組</option>
          </Select>
        </Box>

        <HStack justify="space-between">
          <Text fontSize="sm" color="field.muted" fontFamily="mono">
            目前共 {overviewGlyphCount.toLocaleString()} 個字符
          </Text>
          <Tag size="sm" variant="subtle">
            Overview
          </Tag>
        </HStack>

        <Checkbox
          isChecked={showOnlyEmptyGlyphs}
          onChange={(event) =>
            onShowOnlyEmptyGlyphsChange(event.target.checked)
          }
          size="sm"
          color="field.ink"
        >
          只看空白待編輯字符
        </Checkbox>
      </VStack>

      <Divider mb={4} borderColor="field.haze" opacity={0.55} />

      <Box flex={1} minH={0} bg="white" borderRadius="sm" overflow="auto" p={2}>
        <VStack align="stretch" spacing={1}>
          <Button
            justifyContent="space-between"
            variant={selectedSectionId === 'all' ? 'solid' : 'ghost'}
            color="field.ink"
            fontWeight="900"
            onClick={() => onSectionSelect('all')}
          >
            <Text noOfLines={1}>全部</Text>
            <Tag size="sm">{overviewGlyphCount}</Tag>
          </Button>

          {sections.map((section) => (
            <Button
              key={section.id}
              justifyContent="space-between"
              variant={selectedSectionId === section.id ? 'solid' : 'ghost'}
              color="field.ink"
              fontWeight="900"
              onClick={() => onSectionSelect(section.id)}
            >
              <Text noOfLines={1}>{section.label}</Text>
              <Tag size="sm">{section.glyphs.length}</Tag>
            </Button>
          ))}
        </VStack>
      </Box>
    </Box>
  )
}
