import {
  Badge,
  Box,
  Button,
  Grid,
  GridItem,
  HStack,
  Link,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Wrap,
  WrapItem,
} from '@chakra-ui/react'
import { Plus } from 'iconoir-react'
import { useState } from 'react'
import {
  defaultGlyphPackageGroups,
  firstDefaultGlyphPackageGroupId,
  type DefaultGlyphPackage,
  type GlyphPackageGroup,
} from 'src/features/fontOverview/data/defaultGlyphPackages'
import {
  useGlyphPackageSelection,
  type GlyphPackageSelection,
} from 'src/features/fontOverview/hooks/useGlyphPackageSelection'
import type { CharsetCoverage } from 'src/lib/charsetCoverage'
import type { GlyphData } from 'src/store'
import { useTranslation } from 'react-i18next'

export type { GlyphPackageSelection } from 'src/features/fontOverview/hooks/useGlyphPackageSelection'

interface GlyphPackagePickerProps {
  glyphMap: Record<string, GlyphData>
  onSelectionChange: (selection: GlyphPackageSelection) => void
}

const groupLabelById = new Map(
  defaultGlyphPackageGroups.map((group) => [group.id, group.label])
)

const getPackagesBySection = (packages: DefaultGlyphPackage[]) => {
  const sections = new Map<string, DefaultGlyphPackage[]>()
  for (const glyphPackage of packages) {
    const sectionPackages = sections.get(glyphPackage.section) ?? []
    sectionPackages.push(glyphPackage)
    sections.set(glyphPackage.section, sectionPackages)
  }
  return Array.from(sections)
}

interface PackageCardProps {
  glyphPackage: DefaultGlyphPackage
  coverage: CharsetCoverage
  isSelected: boolean
  onToggle: () => void
}

function PackageCard({
  glyphPackage,
  coverage,
  isSelected,
  onToggle,
}: PackageCardProps) {
  const { t } = useTranslation()

  const selectedBg = 'foreground'
  const selectedColor = 'yellow.300'
  const mutedColor = isSelected ? 'muted' : 'mutedForeground'
  const percent = Math.floor(coverage.drawnRatio * 100)

  return (
    <Button
      h="auto"
      minH="148px"
      justifyContent="center"
      alignItems="center"
      whiteSpace="normal"
      variant="outline"
      borderWidth={2}
      borderColor={isSelected ? 'foreground' : 'haze'}
      bg={isSelected ? selectedBg : 'white'}
      color={isSelected ? selectedColor : 'foreground'}
      _hover={{
        bg: isSelected ? selectedBg : 'card',
        borderColor: 'foreground',
        color: isSelected ? selectedColor : 'foreground',
      }}
      _active={{
        bg: isSelected ? selectedBg : 'card',
        color: isSelected ? selectedColor : 'foreground',
      }}
      _focusVisible={{ boxShadow: '0 0 0 2px var(--chakra-colors-foreground)' }}
      onClick={onToggle}
      p={3}
      position="relative"
    >
      <Stack gap={2} align="center" textAlign="center" w="100%">
        <Stack gap={1} align="center">
          <Text fontWeight="bold" lineHeight="1.1">
            {glyphPackage.label}
          </Text>
          {isSelected && (
            <Badge
              bg="yellow.300"
              color="foreground"
              variant="solid"
              top={1}
              right={1}
              fontSize="0.625rem"
              position="absolute"
            >
              {t('fontOverview.selected')}
            </Badge>
          )}
        </Stack>
        <Text fontSize="xs" color={mutedColor} fontWeight="normal">
          {glyphPackage.description}
        </Text>
        <Stack gap={1} w="100%">
          <HStack justify="space-between" fontSize="xs" fontFamily="mono">
            <Text color={mutedColor}>{percent}%</Text>
            <Text color={mutedColor}>
              {coverage.drawnCount.toLocaleString()} /{' '}
              {coverage.total.toLocaleString()}
            </Text>
          </HStack>
          <Progress.Root
            value={percent}
            size="xs"
            borderRadius="full"
            colorPalette={percent >= 100 ? 'green' : 'yellow'}
          >
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
          <Text fontSize="xs" color={mutedColor} fontFamily="mono">
            {t('fontOverview.coverageMissing')}{' '}
            {coverage.missingGlyphNames.length.toLocaleString()}
          </Text>
        </Stack>
      </Stack>
    </Button>
  )
}

interface PackageGroupSidebarProps {
  activeGroupId: GlyphPackageGroup
  onSelectGroup: (groupId: GlyphPackageGroup) => void
}

function PackageGroupSidebar({
  activeGroupId,
  onSelectGroup,
}: PackageGroupSidebarProps) {
  return (
    <Stack gap={2}>
      {defaultGlyphPackageGroups.map((group) => {
        const isActive = activeGroupId === group.id
        return (
          <Button
            key={group.id}
            justifyContent="flex-start"
            variant="outline"
            bg={isActive ? 'foreground' : 'muted'}
            color={isActive ? 'yellow.300' : 'foreground'}
            borderColor={isActive ? 'foreground' : 'transparent'}
            _hover={{
              bg: isActive ? 'foreground' : 'card',
              color: isActive ? 'yellow.300' : 'foreground',
              borderColor: 'foreground',
            }}
            onClick={() => onSelectGroup(group.id)}
          >
            {group.label}
          </Button>
        )
      })}
    </Stack>
  )
}

interface PackageGroupSourceProps {
  groupId: GlyphPackageGroup
}

function PackageGroupSource({ groupId }: PackageGroupSourceProps) {
  const { t } = useTranslation()

  if (groupId !== 'zh-jf7000') {
    return null
  }

  return (
    <Text fontSize="xs" color="mutedForeground">
      {t('fontOverview.sourceLabel')}
      <Link
        href="https://justfont.com/jf7000"
        fontWeight="900"
        color="foreground"
        textDecoration="underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('fontOverview.jf7000Package')}
      </Link>
    </Text>
  )
}

interface PackageCardSectionProps {
  section: string
  sectionPackages: DefaultGlyphPackage[]
  coverageByPackageId: Map<string, CharsetCoverage>
  selectedPackageIds: Set<string>
  onTogglePackage: (glyphPackage: DefaultGlyphPackage) => void
}

function PackageCardSection({
  section,
  sectionPackages,
  coverageByPackageId,
  selectedPackageIds,
  onTogglePackage,
}: PackageCardSectionProps) {
  return (
    <Stack gap={2}>
      <Text
        fontSize="xs"
        color="mutedForeground"
        fontFamily="mono"
        fontWeight="900"
      >
        {section}
      </Text>
      <SimpleGrid columns={{ base: 2, md: 3, lg: 4 }} gap={2}>
        {sectionPackages.map((glyphPackage) => {
          const coverage = coverageByPackageId.get(glyphPackage.id)
          if (!coverage) {
            return null
          }
          return (
            <PackageCard
              key={glyphPackage.id}
              glyphPackage={glyphPackage}
              coverage={coverage}
              isSelected={selectedPackageIds.has(glyphPackage.id)}
              onToggle={() => onTogglePackage(glyphPackage)}
            />
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

interface PackageCardsAreaProps {
  packages: DefaultGlyphPackage[]
  coverageByPackageId: Map<string, CharsetCoverage>
  selectedPackageIds: Set<string>
  onTogglePackage: (glyphPackage: DefaultGlyphPackage) => void
}

function PackageCardsArea({
  packages,
  coverageByPackageId,
  selectedPackageIds,
  onTogglePackage,
}: PackageCardsAreaProps) {
  return (
    <Stack gap={3} w="100%">
      {getPackagesBySection(packages).map(([section, sectionPackages]) => (
        <PackageCardSection
          key={section}
          section={section}
          sectionPackages={sectionPackages}
          coverageByPackageId={coverageByPackageId}
          selectedPackageIds={selectedPackageIds}
          onTogglePackage={onTogglePackage}
        />
      ))}
    </Stack>
  )
}

interface SummaryTokenProps {
  glyphPackage: DefaultGlyphPackage
}

function SummaryToken({ glyphPackage }: SummaryTokenProps) {
  return (
    <HStack
      gap={0}
      border="2px solid"
      borderColor="foreground"
      borderRadius="2px"
      overflow="hidden"
    >
      <Text
        px={2}
        py={1}
        bg="card"
        color="foreground"
        fontSize="xs"
        fontWeight="900"
        whiteSpace="nowrap"
      >
        {groupLabelById.get(glyphPackage.group) ?? glyphPackage.group}
      </Text>
      <Text
        px={2}
        py={1}
        bg="foreground"
        color="white"
        fontSize="xs"
        fontWeight="900"
        whiteSpace="nowrap"
      >
        {glyphPackage.label}
      </Text>
    </HStack>
  )
}

interface SummaryFormulaProps {
  packages: DefaultGlyphPackage[]
}

function SummaryFormula({ packages }: SummaryFormulaProps) {
  const { t } = useTranslation()

  if (packages.length === 0) {
    return (
      <Text fontSize="sm" color="mutedForeground">
        {t('fontOverview.noneSelected')}
      </Text>
    )
  }

  return (
    <Wrap gap={2} align="center">
      {packages.map((glyphPackage, index) => (
        <WrapItem key={glyphPackage.id} alignItems="center">
          <HStack gap={2}>
            {index > 0 && <Plus width={16} height={16} />}
            <SummaryToken glyphPackage={glyphPackage} />
          </HStack>
        </WrapItem>
      ))}
    </Wrap>
  )
}

interface GlyphPackageSelectionSummaryProps {
  selection: GlyphPackageSelection
}

export function GlyphPackageSelectionSummary({
  selection,
}: GlyphPackageSelectionSummaryProps) {
  const { t } = useTranslation()

  return (
    <Box minW={0}>
      <SummaryFormula packages={selection.packages} />
      <Text fontSize="xl" fontWeight={500} color="mutedForeground" mt={2}>
        {t('fontOverview.total')}
        <Box as="span" fontWeight={700} mx={1}>
          {selection.glyphNames.length.toLocaleString()}
        </Box>
        {t('fontOverview.glyphs')} / {t('fontOverview.coverageDrawn')}
        <Box as="span" fontWeight={700} mx={1}>
          {selection.drawnCount.toLocaleString()}
        </Box>
        / {t('fontOverview.coverageEmpty')}
        <Box as="span" fontWeight={700} mx={1}>
          {selection.emptyGlyphNames.length.toLocaleString()}
        </Box>
        / {t('fontOverview.coverageMissing')}
        <Box as="span" fontWeight={800} mx={1}>
          {selection.missingGlyphNames.length.toLocaleString()}
        </Box>
      </Text>
    </Box>
  )
}

export function GlyphPackagePicker({
  glyphMap,
  onSelectionChange,
}: GlyphPackagePickerProps) {
  const [activeGroupId, setActiveGroupId] = useState<GlyphPackageGroup>(
    firstDefaultGlyphPackageGroupId
  )

  const {
    activeGroupError,
    activeGroupPackages,
    coverageByPackageId,
    isLoadingActiveGroup,
    selectedPackageIds,
    togglePackage,
  } = useGlyphPackageSelection({
    activeGroupId,
    glyphMap,
    onSelectionChange,
  })

  return (
    <Grid
      templateColumns={{
        base: '132px minmax(0, 1fr)',
        md: '160px minmax(0, 1fr)',
      }}
      gap={4}
      h="100%"
      minH={0}
    >
      <GridItem borderRight="1px solid" borderColor="muted" pr={3} minH={0}>
        <PackageGroupSidebar
          activeGroupId={activeGroupId}
          onSelectGroup={setActiveGroupId}
        />
      </GridItem>
      <GridItem minW={0} minH={0}>
        <Stack h="100%" minH={0} gap={3}>
          <Box
            flex={1}
            minH={0}
            overflow="auto"
            display="flex"
            flexDirection="column"
          >
            {activeGroupError ? (
              <Text color="red.500" fontSize="sm">
                {activeGroupError}
              </Text>
            ) : isLoadingActiveGroup && activeGroupPackages.length === 0 ? (
              <Text color="mutedForeground" fontSize="sm">
                字集載入中...
              </Text>
            ) : (
              <PackageCardsArea
                packages={activeGroupPackages}
                coverageByPackageId={coverageByPackageId}
                selectedPackageIds={selectedPackageIds}
                onTogglePackage={togglePackage}
              />
            )}
          </Box>
          <PackageGroupSource groupId={activeGroupId} />
        </Stack>
      </GridItem>
    </Grid>
  )
}
