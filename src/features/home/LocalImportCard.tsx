import { Button, Flex, Heading, Input, Text } from '@chakra-ui/react'
import type { RefObject } from 'react'

interface LocalImportCardProps {
  folderInputRef: RefObject<HTMLInputElement | null>
  fileInputRef: RefObject<HTMLInputElement | null>
  isLoading: boolean
  onFolderUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void
  onDropUpload: (event: React.DragEvent<HTMLDivElement>) => void
}

export function LocalImportCard({
  folderInputRef,
  fileInputRef,
  isLoading,
  onFolderUpload,
  onFileUpload,
  onDropUpload,
}: LocalImportCardProps) {
  return (
    <Flex
      border="1px dashed"
      borderColor="field.line"
      p={6}
      borderRadius="sm"
      bg="field.paper"
      direction="column"
      justifyContent="center"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropUpload}
    >
      <Heading size="sm" mb={2} textTransform="uppercase">
        本地匯入
      </Heading>
      <Text fontSize="sm" color="field.muted" mb={4}>
        支援拖曳上傳（自動辨識資料夾/檔案），或手動選擇資料夾、字型檔案（.ufo/.ttf/.otf/.woff/.woff2）
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
        accept=".ufo,.ttf,.otf,.woff,.woff2,.oft"
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
          上傳資料夾
        </Button>
        <Button as="label" htmlFor="package-file-upload" cursor="pointer" flex="1">
          上傳檔案
        </Button>
      </Flex>
      {isLoading && (
        <Text fontSize="xs" color="field.red.500" mt={3} fontFamily="mono">
          大型字庫在第一次匯入時需要一些時間，請稍候...
        </Text>
      )}
    </Flex>
  )
}
