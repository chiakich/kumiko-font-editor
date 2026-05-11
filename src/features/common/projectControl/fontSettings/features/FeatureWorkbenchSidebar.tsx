import { Badge, Button, HStack, Stack, Text } from '@chakra-ui/react'
import type { ReactNode } from 'react'
import type {
  FeatureDiagnostic,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'

export type FeatureWorkbenchSelection =
  | { kind: 'prelude' }
  | { kind: 'workflow' }
  | { kind: 'classes' }
  | { kind: 'feature'; featureId: string }

interface FeatureWorkbenchSidebarProps {
  diagnostics: FeatureDiagnostic[]
  selected: FeatureWorkbenchSelection
  state: OpenTypeFeaturesState
  suggestionsCount: number
  onSelect: (selection: FeatureWorkbenchSelection) => void
}

export function FeatureWorkbenchSidebar({
  diagnostics,
  selected,
  state,
  suggestionsCount,
  onSelect,
}: FeatureWorkbenchSidebarProps) {
  return (
    <Stack
      spacing={4}
      borderRightWidth={{ base: 0, lg: '1px' }}
      pr={{ base: 0, lg: 4 }}
      minW={0}
    >
      <SidebarSection title="前置">
        <SidebarButton
          isSelected={selected.kind === 'prelude'}
          label="Prelude"
          detail={`${state.languagesystems.length} language systems`}
          onClick={() => onSelect({ kind: 'prelude' })}
        />
      </SidebarSection>

      <SidebarSection title="工作流程">
        <SidebarButton
          isSelected={selected.kind === 'workflow'}
          label="Workflow"
          detail={`${suggestionsCount} suggestions / ${state.unsupportedLookups.length} unsupported`}
          badge={diagnosticsForWorkflow(diagnostics)}
          onClick={() => onSelect({ kind: 'workflow' })}
        />
      </SidebarSection>

      <SidebarSection title="類別">
        <SidebarButton
          isSelected={selected.kind === 'classes'}
          label="Classes"
          detail={`${state.glyphClasses.length} glyph / ${state.markClasses.length} mark`}
          onClick={() => onSelect({ kind: 'classes' })}
        />
      </SidebarSection>

      <SidebarSection title="特性">
        {state.features.length === 0 ? (
          <Text fontSize="sm" color="field.muted">
            No features yet.
          </Text>
        ) : (
          state.features.map((feature) => (
            <SidebarButton
              key={feature.id}
              isSelected={
                selected.kind === 'feature' && selected.featureId === feature.id
              }
              label={feature.tag}
              detail={`${feature.entries.length} entries`}
              badge={diagnosticsForFeature(diagnostics, feature.id)}
              onClick={() =>
                onSelect({ kind: 'feature', featureId: feature.id })
              }
            />
          ))
        )}
      </SidebarSection>
    </Stack>
  )
}

function SidebarSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <Stack spacing={2}>
      <Text fontSize="xs" fontWeight="900" color="field.muted">
        {title}
      </Text>
      {children}
    </Stack>
  )
}

function SidebarButton({
  badge = 0,
  detail,
  isSelected,
  label,
  onClick,
}: {
  badge?: number
  detail: string
  isSelected: boolean
  label: string
  onClick: () => void
}) {
  return (
    <Button
      h="auto"
      justifyContent="flex-start"
      p={3}
      textAlign="left"
      variant={isSelected ? 'solid' : 'ghost'}
      whiteSpace="normal"
      onClick={onClick}
    >
      <Stack spacing={1} align="stretch" w="100%">
        <HStack justify="space-between" minW={0}>
          <Text fontFamily="mono" fontWeight="900" noOfLines={1}>
            {label}
          </Text>
          {badge > 0 ? <Badge colorScheme="yellow">{badge}</Badge> : null}
        </HStack>
        <Text fontSize="xs" color={isSelected ? undefined : 'field.muted'}>
          {detail}
        </Text>
      </Stack>
    </Button>
  )
}

function diagnosticsForFeature(
  diagnostics: FeatureDiagnostic[],
  featureId: string
) {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.target.kind === 'feature' &&
      diagnostic.target.featureId === featureId
  ).length
}

function diagnosticsForWorkflow(diagnostics: FeatureDiagnostic[]) {
  return diagnostics.filter((diagnostic) => diagnostic.target.kind === 'global')
    .length
}
