import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Button,
  Checkbox,
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
} from '@chakra-ui/react'
import { useState } from 'react'
import type { OpenTypeExportWarning } from 'src/lib/openTypeFeatures'

export type FontExportFormat = 'zip' | 'ttf' | 'otf' | 'woff' | 'woff2'

interface ExportFontModalProps {
  isOpen: boolean
  canExport: boolean
  isExporting: boolean
  loadingText: string
  openTypeWarnings?: OpenTypeExportWarning[]
  onClose: () => void
  onExport: (formats: FontExportFormat[]) => void
}

const exportOptions: Array<{
  format: FontExportFormat
  label: string
  description: string
}> = [
  {
    format: 'zip',
    label: 'UFO (ZIP)',
    description: '可再匯入或交給其他字型工具編輯。',
  },
  {
    format: 'ttf',
    label: 'TTF',
    description: 'TrueType 字型檔。',
  },
  {
    format: 'otf',
    label: 'OTF',
    description: 'OpenType 字型檔。',
  },
  {
    format: 'woff',
    label: 'WOFF',
    description: '網頁字型格式。',
  },
  {
    format: 'woff2',
    label: 'WOFF2',
    description: '壓縮率較高的網頁字型格式。',
  },
]

const getAlertStatus = (severity: OpenTypeExportWarning['severity']) => {
  if (severity === 'error') {
    return 'error'
  }
  if (severity === 'warning') {
    return 'warning'
  }
  return 'info'
}

function OpenTypeExportWarnings({
  warnings,
}: {
  warnings: OpenTypeExportWarning[]
}) {
  if (warnings.length === 0) {
    return null
  }

  return (
    <Stack spacing={2}>
      {warnings.map((warning) => (
        <Alert
          key={warning.id}
          status={getAlertStatus(warning.severity)}
          variant="subtle"
          alignItems="flex-start"
          borderRadius="md"
        >
          <AlertIcon mt={1} />
          <Stack spacing={0}>
            <AlertTitle fontSize="sm">{warning.title}</AlertTitle>
            <AlertDescription fontSize="sm">{warning.message}</AlertDescription>
          </Stack>
        </Alert>
      ))}
    </Stack>
  )
}

export function ExportFontModal({
  isOpen,
  canExport,
  isExporting,
  loadingText,
  openTypeWarnings = [],
  onClose,
  onExport,
}: ExportFontModalProps) {
  const [selectedFormats, setSelectedFormats] = useState<FontExportFormat[]>([
    'zip',
  ])
  const canSubmit = canExport && selectedFormats.length > 0 && !isExporting

  const toggleFormat = (format: FontExportFormat) => {
    setSelectedFormats((current) =>
      current.includes(format)
        ? current.filter((item) => item !== format)
        : [...current, format]
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>匯出字型</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={3}>
            <OpenTypeExportWarnings warnings={openTypeWarnings} />
            {exportOptions.map((option) => (
              <Button
                key={option.format}
                h="auto"
                minH="88px"
                justifyContent="flex-start"
                alignItems="flex-start"
                whiteSpace="normal"
                variant="unstyled"
                p={4}
                borderColor={
                  selectedFormats.includes(option.format)
                    ? 'field.accent'
                    : undefined
                }
                isDisabled={!canExport || isExporting}
                onClick={() => toggleFormat(option.format)}
              >
                <Stack spacing={1} align="flex-start" textAlign="left">
                  <HStack spacing={2}>
                    <Checkbox
                      isChecked={selectedFormats.includes(option.format)}
                      pointerEvents="none"
                    />
                    <Text fontWeight="semibold">{option.label}</Text>
                  </HStack>
                  <Text fontSize="sm" fontWeight="normal" color="gray.500">
                    {option.description}
                  </Text>
                </Stack>
              </Button>
            ))}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose} isDisabled={isExporting}>
            關閉
          </Button>
          <Button
            ml={3}
            isDisabled={!canSubmit}
            isLoading={isExporting}
            loadingText={loadingText}
            onClick={() => onExport(selectedFormats)}
          >
            匯出
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
