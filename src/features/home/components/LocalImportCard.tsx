import { Button, Flex, Heading, Input, Text } from '@chakra-ui/react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'

interface LocalImportCardProps {
  folderInputRef: RefObject<HTMLInputElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  isDragging: boolean
  isLoading: boolean
  onDragEnter: (event: React.DragEvent<HTMLDivElement>) => void
  onDragLeave: (event: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onFolderUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onDropUpload: (event: React.DragEvent<HTMLDivElement>) => void
}

export function LocalImportCard({
  folderInputRef,
  fileInputRef,
  isDragging,
  isLoading,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onFolderUpload,
  onFileUpload,
  onDropUpload,
}: LocalImportCardProps) {
  const { t } = useTranslation()

  return (
    <Flex
      border="1px dashed"
      borderColor={isDragging ? 'field.red.500' : 'field.line'}
      p={6}
      borderRadius="sm"
      bg={isDragging ? 'field.yellow.300' : 'field.paper'}
      direction="column"
      justifyContent="center"
      transition="background-color 120ms ease, border-color 120ms ease"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDropUpload}
    >
      <Heading size="sm" mb={2} textTransform="uppercase">
        {t('home.localImport')}
      </Heading>
      <Text fontSize="sm" color="field.muted" mb={4}>
        {t('home.localImportDescription')}
      </Text>
      <Input type="file" onChange={onFileUpload} display="none" />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        onChange={onFolderUpload}
        style={{ display: 'none' }}
        id="package-folder-upload"
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".ufo,.ttf,.otf,.woff,.woff2"
        onChange={onFileUpload}
        style={{ display: 'none' }}
        id="package-file-upload"
      />
      <Flex gap={2}>
        <Button
          as="label"
          htmlFor="package-folder-upload"
          cursor="pointer"
          isLoading={isLoading}
          loadingText="讀取與解析中..."
          flex="1"
        >
          {t('home.uploadFolder')}
        </Button>
        <Button
          as="label"
          htmlFor="package-file-upload"
          cursor="pointer"
          flex="1"
        >
          {t('home.uploadFile')}
        </Button>
      </Flex>
      {isLoading && (
        <Text fontSize="xs" color="field.red.500" mt={3} fontFamily="mono">
          {t('home.largeFontImportNotice')}
        </Text>
      )}
    </Flex>
  )
}
