import {
  Box,
  Button,
  Grid,
  GridItem,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalOverlay,
  Progress,
  Stack,
  Text,
  Wrap,
  WrapItem,
} from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import {
  buildGlyphLookupMap,
  computeCharsetCoverage,
  type CharsetCoverage,
} from 'src/lib/charsetCoverage'
import { defaultGlyphPackages } from 'src/features/fontOverview/defaultGlyphPackages'
import type { GlyphData } from 'src/store'
import { useTranslation } from 'react-i18next'

const MAX_RENDERED_CHIPS = 2000

const glyphNameToDisplayText = (glyphName: string) => {
  const uniMatch = glyphName.match(/^uni([0-9a-fA-F]{4,6})$/)
  const uMatch = glyphName.match(/^u([0-9a-fA-F]{5,6})$/)
  const hex = uniMatch?.[1] ?? uMatch?.[1]
  if (hex) {
    const codePoint = Number.parseInt(hex, 16)
    if (Number.isFinite(codePoint)) {
      return String.fromCodePoint(codePoint)
    }
  }
  return glyphName
}

interface CharsetCoverageModalProps {
  glyphMap: Record<string, GlyphData>
  isOpen: boolean
  onClose: () => void
  onAddGlyphNames: (glyphNames: string[]) => void
}

function CoveragePackageRow({
  coverage,
  isSelected,
  onSelect,
}: {
  coverage: CharsetCoverage
  isSelected: boolean
  onSelect: () => void
}) {
  const percent = Math.floor(coverage.drawnRatio * 100)

  return (
    <Button
      variant="outline"
      h="auto"
      p={3}
      justifyContent="stretch"
      borderWidth={2}
      borderColor={isSelected ? 'field.ink' : 'field.haze'}
      bg={isSelected ? 'field.panel' : 'white'}
      onClick={onSelect}
    >
      <Stack spacing={2} w="100%" textAlign="left">
        <HStack justify="space-between">
          <Text fontSize="sm" fontWeight="bold" noOfLines={1}>
            {coverage.label}
          </Text>
          <Text fontSize="xs" fontFamily="mono" color="field.muted">
            {percent}%
          </Text>
        </HStack>
        <Progress
          value={percent}
          size="xs"
          borderRadius="full"
          colorScheme={percent >= 100 ? 'green' : 'yellow'}
        />
        <Text fontSize="xs" color="field.muted" fontFamily="mono">
          {coverage.drawnCount.toLocaleString()} /{' '}
          {coverage.total.toLocaleString()}
        </Text>
      </Stack>
    </Button>
  )
}

function GlyphChipList({ glyphNames }: { glyphNames: string[] }) {
  const { t } = useTranslation()
  const visibleGlyphNames = glyphNames.slice(0, MAX_RENDERED_CHIPS)
  const hiddenCount = glyphNames.length - visibleGlyphNames.length

  return (
    <Box>
      <Wrap spacing={1}>
        {visibleGlyphNames.map((glyphName) => {
          const display = glyphNameToDisplayText(glyphName)
          return (
            <WrapItem key={glyphName}>
              <Box
                borderWidth={1}
                borderColor="field.haze"
                borderRadius="2px"
                px={display.length > 2 ? 2 : 1}
                minW="28px"
                textAlign="center"
                fontSize={display.length > 2 ? 'xs' : 'md'}
                fontFamily={display.length > 2 ? 'mono' : undefined}
                lineHeight="26px"
                bg="white"
                title={glyphName}
              >
                {display}
              </Box>
            </WrapItem>
          )
        })}
      </Wrap>
      {hiddenCount > 0 ? (
        <Text fontSize="xs" color="field.muted" mt={2}>
          {t('fontOverview.coverageMoreHidden', { count: hiddenCount })}
        </Text>
      ) : null}
    </Box>
  )
}

export function CharsetCoverageModal({
  glyphMap,
  isOpen,
  onClose,
  onAddGlyphNames,
}: CharsetCoverageModalProps) {
  const { t } = useTranslation()
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(
    null
  )

  const coverages = useMemo(() => {
    if (!isOpen) {
      return []
    }
    const lookup = buildGlyphLookupMap(glyphMap)
    return defaultGlyphPackages.map((charsetPackage) =>
      computeCharsetCoverage(charsetPackage, lookup)
    )
  }, [glyphMap, isOpen])

  const selectedCoverage =
    coverages.find((coverage) => coverage.packageId === selectedPackageId) ??
    coverages[0] ??
    null

  const coveragesBySection = useMemo(() => {
    const sections = new Map<string, CharsetCoverage[]>()
    for (const coverage of coverages) {
      const sectionCoverages = sections.get(coverage.section) ?? []
      sectionCoverages.push(coverage)
      sections.set(coverage.section, sectionCoverages)
    }
    return Array.from(sections)
  }, [coverages])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="6xl"
      isCentered
      scrollBehavior="inside"
    >
      <ModalOverlay />
      <ModalContent borderRadius="sm" h="800px">
        <ModalCloseButton zIndex={2} />
        <Box px={6} pt={5} pb={3}>
          <Text as="h2" fontSize="xl" fontWeight="900">
            {t('fontOverview.charsetCoverage')}
          </Text>
        </Box>
        <ModalBody pb={5} flex={1} minH={0}>
          <Grid
            templateColumns="280px minmax(0, 1fr)"
            gap={4}
            h="100%"
            minH={0}
          >
            <GridItem
              borderRight="1px solid"
              borderColor="field.panelMuted"
              pr={3}
              minH={0}
              overflow="auto"
            >
              <Stack spacing={3}>
                {coveragesBySection.map(([section, sectionCoverages]) => (
                  <Stack key={section} spacing={2}>
                    <Text
                      fontSize="xs"
                      color="field.muted"
                      fontFamily="mono"
                      fontWeight="900"
                    >
                      {section}
                    </Text>
                    {sectionCoverages.map((coverage) => (
                      <CoveragePackageRow
                        key={coverage.packageId}
                        coverage={coverage}
                        isSelected={
                          coverage.packageId === selectedCoverage?.packageId
                        }
                        onSelect={() =>
                          setSelectedPackageId(coverage.packageId)
                        }
                      />
                    ))}
                  </Stack>
                ))}
              </Stack>
            </GridItem>
            <GridItem minW={0} minH={0} overflow="auto">
              {selectedCoverage ? (
                <Stack spacing={4}>
                  <HStack spacing={6} fontFamily="mono" fontSize="sm">
                    <Text color="green.600">
                      {t('fontOverview.coverageDrawn')}{' '}
                      {selectedCoverage.drawnCount.toLocaleString()}
                    </Text>
                    <Text color="orange.500">
                      {t('fontOverview.coverageEmpty')}{' '}
                      {selectedCoverage.emptyGlyphNames.length.toLocaleString()}
                    </Text>
                    <Text color="red.500">
                      {t('fontOverview.coverageMissing')}{' '}
                      {selectedCoverage.missingGlyphNames.length.toLocaleString()}
                    </Text>
                  </HStack>

                  {selectedCoverage.missingGlyphNames.length > 0 ? (
                    <Stack spacing={2}>
                      <Text fontSize="sm" fontWeight="bold" color="red.500">
                        {t('fontOverview.coverageMissingTitle')}
                      </Text>
                      <GlyphChipList
                        glyphNames={selectedCoverage.missingGlyphNames}
                      />
                    </Stack>
                  ) : null}

                  {selectedCoverage.emptyGlyphNames.length > 0 ? (
                    <Stack spacing={2}>
                      <Text fontSize="sm" fontWeight="bold" color="orange.500">
                        {t('fontOverview.coverageEmptyTitle')}
                      </Text>
                      <GlyphChipList
                        glyphNames={selectedCoverage.emptyGlyphNames}
                      />
                    </Stack>
                  ) : null}

                  {selectedCoverage.missingGlyphNames.length === 0 &&
                  selectedCoverage.emptyGlyphNames.length === 0 ? (
                    <Text fontSize="sm" color="green.600">
                      {t('fontOverview.coverageComplete')}
                    </Text>
                  ) : null}
                </Stack>
              ) : null}
            </GridItem>
          </Grid>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="ghost" onClick={onClose}>
            {t('fontOverview.cancel')}
          </Button>
          <Button
            isDisabled={
              !selectedCoverage ||
              selectedCoverage.missingGlyphNames.length === 0
            }
            onClick={() => {
              if (selectedCoverage) {
                onAddGlyphNames(selectedCoverage.missingGlyphNames)
              }
            }}
          >
            {t('fontOverview.coverageAddMissing', {
              count: selectedCoverage?.missingGlyphNames.length ?? 0,
            })}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
