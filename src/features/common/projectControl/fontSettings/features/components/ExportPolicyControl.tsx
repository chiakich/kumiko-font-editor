import { Alert, Stack, Text, Field } from '@chakra-ui/react'
import { NativeSelect } from '@/components/ui/native-select'
import type {
  ExportPolicy,
  FeatureDiagnostic,
  OpenTypeExportWarning,
  OpenTypeFeaturesState,
} from 'src/lib/openTypeFeatures'
import {
  createCompilerRuntimeStatus,
  deriveOpenTypeExportImpactItems,
  deriveOpenTypeExportWarnings,
} from 'src/lib/openTypeFeatures'
import { ExportImpactSummary } from 'src/features/common/projectControl/fontSettings/features/components/ExportImpactSummary'
import type { TFunction } from 'i18next'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface ExportPolicyControlProps {
  diagnostics: FeatureDiagnostic[]
  state: OpenTypeFeaturesState
  onChange: (policy: ExportPolicy) => void
}

const EXPORT_POLICIES: ExportPolicy[] = [
  'rebuild-managed-layout-tables',
  'preserve-compiled-layout-tables',
  'drop-unsupported-and-rebuild',
]

type AlertStatus = 'error' | 'warning' | 'info'

const getAlertStatus = (
  severity: OpenTypeExportWarning['severity']
): AlertStatus => {
  if (severity === 'error') {
    return 'error'
  }

  if (severity === 'warning') {
    return 'warning'
  }

  return 'info'
}

export function ExportPolicyControl({
  diagnostics,
  state,
  onChange,
}: ExportPolicyControlProps) {
  const { t } = useTranslation()
  const compilerRuntimeStatus = useMemo(() => createCompilerRuntimeStatus(), [])
  const warnings = useMemo(
    () =>
      deriveOpenTypeExportWarnings(state, {
        compilerRuntimeStatus,
        diagnostics,
      }),
    [compilerRuntimeStatus, diagnostics, state]
  )
  const impactItems = useMemo(
    () => deriveOpenTypeExportImpactItems(state),
    [state]
  )

  return (
    <Stack gap={3}>
      <Field.Root>
        <Field.Label textStyle="label">
          {t('projectControl.opentypeExportPolicy')}
        </Field.Label>
        <NativeSelect
          fieldProps={{
            value: state.exportPolicy,
            onChange: (event) => onChange(event.target.value as ExportPolicy),
          }}
        >
          {EXPORT_POLICIES.map((policy) => (
            <option key={policy} value={policy}>
              {getExportPolicyLabel(policy, t)}
            </option>
          ))}
        </NativeSelect>
      </Field.Root>
      <Text fontSize="sm" color="mutedForeground">
        {t('projectControl.exportBehaviorIsExplicitBecauseCompiling')}
      </Text>
      <ExportImpactSummary items={impactItems} />
      {warnings.map((warning) => (
        <ExportWarningAlert key={warning.id} warning={warning} t={t} />
      ))}
    </Stack>
  )
}

function ExportWarningAlert({
  t,
  warning,
}: {
  t: TFunction
  warning: OpenTypeExportWarning
}) {
  const translatedWarning = translateExportWarning(warning, t)

  return (
    <Alert.Root
      status={getAlertStatus(warning.severity)}
      alignItems="flex-start"
      borderRadius="sm"
    >
      <Alert.Indicator mt={1} />
      <Stack gap={0}>
        <Alert.Title fontSize="sm">{translatedWarning.title}</Alert.Title>
        <Alert.Description fontSize="sm">
          {translatedWarning.message}
        </Alert.Description>
        {warning.details && warning.details.length > 0 && (
          <Stack as="ul" gap={1} mt={2} pl={4}>
            {warning.details.slice(0, 8).map((detail) => (
              <Text key={detail} as="li" fontSize="sm">
                {detail}
              </Text>
            ))}
            {warning.details.length > 8 && (
              <Text as="li" fontSize="sm">
                +{warning.details.length - 8} {t('projectControl.more')}
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </Alert.Root>
  )
}

function getExportPolicyLabel(policy: ExportPolicy, t: TFunction) {
  return {
    'rebuild-managed-layout-tables': t(
      'projectControl.exportPolicyRebuildManaged'
    ),
    'preserve-compiled-layout-tables': t(
      'projectControl.exportPolicyPreserveCompiled'
    ),
    'drop-unsupported-and-rebuild': t(
      'projectControl.exportPolicyDropUnsupported'
    ),
  }[policy]
}

function translateExportWarning(warning: OpenTypeExportWarning, t: TFunction) {
  const keyPrefix = `projectControl.exportWarning.${warning.code}`

  return {
    title: t(`${keyPrefix}.title`, { defaultValue: warning.title }),
    message: t(`${keyPrefix}.message`, {
      count: warning.details?.length ?? 0,
      defaultValue: warning.message,
    }),
  }
}
