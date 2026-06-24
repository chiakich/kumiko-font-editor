import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Button,
  Divider,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@chakra-ui/react'
import { Copy } from 'iconoir-react'
import { useMemo } from 'react'
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

function DetailBlock({ label, text }: { label: string; text: string }) {
  const rows = Math.min(12, Math.max(4, text.split('\n').length))

  return (
    <Stack spacing={2}>
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
        resize="vertical"
        bg="field.panelMuted"
        borderWidth="1px"
        borderRadius="sm"
        fontFamily="mono"
        fontSize="xs"
        lineHeight="1.45"
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
    <Modal isOpen onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent maxH="86vh">
        <ModalHeader pr={14}>
          <Stack spacing={1}>
            <Text>匯出失敗</Text>
            <HStack spacing={2} flexWrap="wrap">
              {report.formats.map((format) => (
                <Badge key={format} colorScheme="red">
                  {formatLabels[format] ?? format}
                </Badge>
              ))}
            </HStack>
          </Stack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            <Alert
              status="error"
              variant="subtle"
              alignItems="flex-start"
              borderRadius="md"
            >
              <AlertIcon mt={1} />
              <Stack spacing={1}>
                <AlertTitle fontSize="sm">錯誤摘要</AlertTitle>
                <AlertDescription fontSize="sm">
                  {report.message}
                </AlertDescription>
              </Stack>
            </Alert>

            {report.diagnostics.length > 0 ? (
              <Stack spacing={2}>
                <Text fontSize="sm" fontWeight="800">
                  Diagnostics
                </Text>
                {report.diagnostics.map((diagnostic) => (
                  <Stack
                    key={diagnostic.id}
                    spacing={1}
                    p={3}
                    borderWidth="1px"
                    borderRadius="sm"
                  >
                    <HStack spacing={2}>
                      <Badge colorScheme={diagnosticColor(diagnostic.severity)}>
                        {diagnostic.severity}
                      </Badge>
                      <Text fontSize="xs" color="field.muted" fontFamily="mono">
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
                <Divider />
                <DetailBlock label="Stack trace" text={report.stack} />
              </>
            ) : null}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="ghost"
            leftIcon={
              <Copy width={18} height={18} strokeWidth={1.9} aria-hidden />
            }
            onClick={() => void handleCopyDetails()}
          >
            複製詳情
          </Button>
          <Button ml={3} onClick={onClose}>
            關閉
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
