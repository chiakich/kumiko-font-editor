import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadDefaultGlyphPackages,
  type DefaultGlyphPackage,
  type GlyphPackageGroup,
} from 'src/features/fontOverview/data/defaultGlyphPackages'
import {
  buildGlyphLookupMap,
  computeCharsetCoverage,
} from 'src/lib/charsetCoverage'
import type { GlyphData } from 'src/store'

export interface GlyphPackageSelection {
  glyphNames: string[]
  drawnCount: number
  emptyGlyphNames: string[]
  missingGlyphNames: string[]
  packages: DefaultGlyphPackage[]
}

interface UseGlyphPackageSelectionOptions {
  activeGroupId: GlyphPackageGroup
  glyphMap: Record<string, GlyphData>
  onSelectionChange: (selection: GlyphPackageSelection) => void
}

const EMPTY_GLYPH_PACKAGES: DefaultGlyphPackage[] = []

const getPackageGlyphNames = (packages: DefaultGlyphPackage[]) => {
  const glyphNames = new Set<string>()
  for (const glyphPackage of packages) {
    for (const glyphName of glyphPackage.glyphNames) {
      glyphNames.add(glyphName)
    }
  }
  return glyphNames
}

const addPackageDependencies = (
  nextSelectedIds: Set<string>,
  glyphPackage: DefaultGlyphPackage,
  packageById: Map<string, DefaultGlyphPackage>
) => {
  nextSelectedIds.add(glyphPackage.id)
  for (const dependencyId of glyphPackage.dependsOn) {
    const dependency = packageById.get(dependencyId)
    if (dependency) {
      addPackageDependencies(nextSelectedIds, dependency, packageById)
    }
  }
}

const removePackageDependents = (
  nextSelectedIds: Set<string>,
  removedPackageId: string,
  loadedPackages: DefaultGlyphPackage[]
) => {
  nextSelectedIds.delete(removedPackageId)
  for (const glyphPackage of loadedPackages) {
    if (
      nextSelectedIds.has(glyphPackage.id) &&
      glyphPackage.dependsOn.includes(removedPackageId)
    ) {
      removePackageDependents(nextSelectedIds, glyphPackage.id, loadedPackages)
    }
  }
}

export function useGlyphPackageSelection({
  activeGroupId,
  glyphMap,
  onSelectionChange,
}: UseGlyphPackageSelectionOptions) {
  const [selectedPackageIds, setSelectedPackageIds] = useState<Set<string>>(
    () => new Set()
  )
  const [packagesByGroup, setPackagesByGroup] = useState<
    Partial<Record<GlyphPackageGroup, DefaultGlyphPackage[]>>
  >({})
  const [errorsByGroup, setErrorsByGroup] = useState<
    Partial<Record<GlyphPackageGroup, string>>
  >({})

  useEffect(() => {
    if (packagesByGroup[activeGroupId] || errorsByGroup[activeGroupId]) {
      return
    }

    let cancelled = false

    loadDefaultGlyphPackages(activeGroupId).then(
      (packages) => {
        if (cancelled) {
          return
        }
        setPackagesByGroup((current) => ({
          ...current,
          [activeGroupId]: packages,
        }))
      },
      (error: Error) => {
        if (cancelled) {
          return
        }
        setErrorsByGroup((current) => ({
          ...current,
          [activeGroupId]: error.message,
        }))
      }
    )

    return () => {
      cancelled = true
    }
  }, [activeGroupId, errorsByGroup, packagesByGroup])

  const activeGroupPackages =
    packagesByGroup[activeGroupId] ?? EMPTY_GLYPH_PACKAGES
  const activeGroupError = errorsByGroup[activeGroupId] ?? null
  const loadedPackages = useMemo(
    () => Object.values(packagesByGroup).flat(),
    [packagesByGroup]
  )
  const packageById = useMemo(
    () =>
      new Map(
        loadedPackages.map((glyphPackage) => [glyphPackage.id, glyphPackage])
      ),
    [loadedPackages]
  )
  const glyphLookup = useMemo(() => buildGlyphLookupMap(glyphMap), [glyphMap])
  const coverageByPackageId = useMemo(
    () =>
      new Map(
        activeGroupPackages.map((glyphPackage) => [
          glyphPackage.id,
          computeCharsetCoverage(glyphPackage, glyphLookup),
        ])
      ),
    [activeGroupPackages, glyphLookup]
  )
  const selectedPackages = useMemo(
    () =>
      loadedPackages.filter((glyphPackage) =>
        selectedPackageIds.has(glyphPackage.id)
      ),
    [loadedPackages, selectedPackageIds]
  )
  const selectedGlyphNames = useMemo(
    () => getPackageGlyphNames(selectedPackages),
    [selectedPackages]
  )
  const selectedCoverage = useMemo(
    () =>
      computeCharsetCoverage(
        {
          id: 'selected',
          label: 'Selected',
          group: 'selected',
          section: 'selected',
          glyphNames: Array.from(selectedGlyphNames),
        },
        glyphLookup
      ),
    [glyphLookup, selectedGlyphNames]
  )

  useEffect(() => {
    onSelectionChange({
      glyphNames: Array.from(selectedGlyphNames),
      drawnCount: selectedCoverage.drawnCount,
      emptyGlyphNames: selectedCoverage.emptyGlyphNames,
      missingGlyphNames: selectedCoverage.missingGlyphNames,
      packages: selectedPackages,
    })
  }, [
    onSelectionChange,
    selectedCoverage,
    selectedGlyphNames,
    selectedPackages,
  ])

  const togglePackage = useCallback(
    (glyphPackage: DefaultGlyphPackage) => {
      setSelectedPackageIds((current) => {
        const nextSelectedIds = new Set(current)
        if (nextSelectedIds.has(glyphPackage.id)) {
          removePackageDependents(
            nextSelectedIds,
            glyphPackage.id,
            loadedPackages
          )
        } else {
          addPackageDependencies(nextSelectedIds, glyphPackage, packageById)
        }
        return nextSelectedIds
      })
    },
    [loadedPackages, packageById]
  )

  return {
    activeGroupError,
    activeGroupPackages,
    coverageByPackageId,
    isLoadingActiveGroup:
      !packagesByGroup[activeGroupId] && activeGroupError === null,
    selectedPackageIds,
    togglePackage,
  }
}
