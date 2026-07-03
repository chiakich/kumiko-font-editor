import { useToast } from '@/components/ui/toast'
import {
  Alert,
  Badge,
  Button,
  HStack,
  Stack,
  Text,
  Textarea,
  Separator,
  Dialog,
  Portal,
} from '@chakra-ui/react'
import { DialogCloseButton } from '@/components/ui/dialog-close-button'
import { Copy } from 'iconoir-react'
import { useMemo, type WheelEvent } from 'react'
import {
  formatFontExportErrorReport,
  type FontExportErrorReport,
} from 'src/features/common/fontExport/exportErrorReport'
import type { FeatureDiagnostic } from 'src/lib/openTypeFeatures'

interface ExportErrorModalProps {
  report: FontExportErrorReport | null
  onClose: () => void
}

const formatLabels: Record<string, string> = {
  zip: 'UFO ZIP',
  glyphs2: 'Glyphs 2',
  glyphs3: 'Glyphs 3',
  glyphspackage: 'Glyphs Package',
  'variable-otf': 'Variable OTF',
  ttf: 'TTF',
  otf: 'OTF',
  woff: 'WOFF',
  woff2: 'WOFF2',
}

const targetLabel = (diagnostic: FeatureDiagnostic) => {
  switch (diagnostic.target.kind) {
    case 'feature':
      return `feature:${diagnostic.target.featureId}`
    case 'lookup':
      return `lookup:${diagnostic.target.lookupId}`
    case 'rule':
      return `rule:${diagnostic.target.ruleId}`
    case 'class':
      return `class:${diagnostic.target.classId}`
    case 'global':
      return 'global'
  }
}

const diagnosticColor = (severity: FeatureDiagnostic['severity']) => {
  if (severity === 'error') {
    return 'red'
  }
  if (severity === 'warning') {
    return 'orange'
  }
  return 'blue'
}

const WHEEL_DELTA_LINE = 1
const WHEEL_DELTA_PAGE = 2

const getWheelDeltaY = (event: WheelEvent<HTMLTextAreaElement>) => {
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    return event.deltaY * 16
  }
  if (event.deltaMode === WHEEL_DELTA_PAGE) {
    return event.deltaY * event.currentTarget.clientHeight
  }
  return event.deltaY
}

const handleDetailWheel = (event: WheelEvent<HTMLTextAreaElement>) => {
  const target = event.currentTarget
  const maxScrollTop = target.scrollHeight - target.clientHeight

  if (maxScrollTop <= 0) {
    return
  }

  const nextScrollTop = Math.max(
    0,
    Math.min(maxScrollTop, target.scrollTop + getWheelDeltaY(event))
  )

  if (nextScrollTop === target.scrollTop) {
    return
  }

  target.scrollTop = nextScrollTop
  event.preventDefault()
  event.stopPropagation()
}

function DetailBlock({ label, text }: { label: string; text: string }) {
  const rows = Math.min(12, Math.max(4, text.split('\n').length))

  return (
    <Stack gap={2}>
      <Text fontSize="sm" fontWeight="800">
        {label}
      </Text>
      <Textarea
        aria-label={label}
        value={text}
        readOnly
        spellCheck={false}
        rows={rows}
        p={3}
        maxH="260px"
        overflowY="auto"
        overscrollBehavior="contain"
        resize="vertical"
        bg="muted"
        borderWidth="1px"
        borderRadius="sm"
        fontFamily="mono"
        fontSize="xs"
        lineHeight="1.45"
        onWheelCapture={handleDetailWheel}
      />
    </Stack>
  )
}

export function ExportErrorModal({ report, onClose }: ExportErrorModalProps) {
  const toast = useToast()
  const detailsText = useMemo(
    () => (report ? formatFontExportErrorReport(report) : ''),
    [report]
  )

  if (!report) {
    return null
  }

  const handleCopyDetails = async () => {
    try {
      await navigator.clipboard.writeText(detailsText)
      toast({
        title: '已複製錯誤詳情',
        status: 'success',
        duration: 1600,
        isClosable: true,
      })
    } catch {
      toast({
        title: '無法複製錯誤詳情',
        status: 'warning',
        duration: 2200,
        isClosable: true,
      })
    }
  }

  return (
    <Dialog.Root
      open
      size="xl"
      scrollBehavior="inside"
      onOpenChange={(e) => {
        if (!e.open) {
          onClose()
        }
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxH="86vh">
            <Dialog.Header pr={14}>
              <Stack gap={1}>
                <Text>匯出失敗</Text>
                <HStack gap={2} flexWrap="wrap">
                  {report.formats.map((format) => (
                    <Badge key={format} colorPalette="red">
                      {formatLabels[format] ?? format}
                    </Badge>
                  ))}
                </HStack>
              </Stack>
            </Dialog.Header>
            <DialogCloseButton />
            <Dialog.Body>
              <Stack gap={4}>
                <Alert.Root
                  status="error"
                  variant="subtle"
                  alignItems="flex-start"
                  borderRadius="md"
                >
                  <Alert.Indicator mt={1} />
                  <Stack gap={1}>
                    <Alert.Title fontSize="sm">錯誤摘要</Alert.Title>
                    <Alert.Description fontSize="sm">
                      {report.message}
                    </Alert.Description>
                  </Stack>
                </Alert.Root>

                {report.diagnostics.length > 0 ? (
                  <Stack gap={2}>
                    <Text fontSize="sm" fontWeight="800">
                      Diagnostics
                    </Text>
                    {report.diagnostics.map((diagnostic) => (
                      <Stack
                        key={diagnostic.id}
                        gap={1}
                        p={3}
                        borderWidth="1px"
                        borderRadius="sm"
                      >
                        <HStack gap={2}>
                          <Badge
                            colorPalette={diagnosticColor(diagnostic.severity)}
                          >
                            {diagnostic.severity}
                          </Badge>
                          <Text
                            fontSize="xs"
                            color="mutedForeground"
                            fontFamily="mono"
                          >
                            {targetLabel(diagnostic)}
                          </Text>
                        </HStack>
                        <Text fontSize="sm">{diagnostic.message}</Text>
                      </Stack>
                    ))}
                  </Stack>
                ) : null}

                {report.rawCompilerOutput ? (
                  <DetailBlock
                    label="fontTools / compiler output"
                    text={report.rawCompilerOutput}
                  />
                ) : null}

                {report.stack ? (
                  <>
                    <Separator />
                    <DetailBlock label="Stack trace" text={report.stack} />
                  </>
                ) : null}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="ghost" onClick={() => void handleCopyDetails()}>
                <Copy width={18} height={18} strokeWidth={1.9} aria-hidden />
                複製詳情
              </Button>
              <Button ml={3} onClick={onClose}>
                關閉
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
