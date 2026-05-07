import { Box, HStack, IconButton, Tooltip } from '@chakra-ui/react'
import { Check, Download, FloppyDisk, GithubCircle } from 'iconoir-react'

interface ProjectSaveActionsProps {
  canSaveDraft: boolean
  hasGitHubSource: boolean
  isDraftCurrent: boolean
  isSavingToLocal: boolean
  onOpenExportModal: () => void
  onOpenGitHubModal: () => void
  onSaveProject: () => void
}

export function ProjectSaveActions({
  canSaveDraft,
  hasGitHubSource,
  isDraftCurrent,
  isSavingToLocal,
  onOpenExportModal,
  onOpenGitHubModal,
  onSaveProject,
}: ProjectSaveActionsProps) {
  return (
    <HStack
      spacing={1}
      justify="flex-end"
      alignSelf="flex-end"
      px={2}
      py={1}
      bg="field.yellow.400"
      borderRadius="full"
    >
      {hasGitHubSource ? (
        <Tooltip label="GitHub / Commit">
          <IconButton
            aria-label="開啟 GitHub commit modal"
            icon={
              <GithubCircle
                width={18}
                height={18}
                strokeWidth={1.9}
                aria-hidden="true"
              />
            }
            size="sm"
            minW={9}
            h={9}
            px={0}
            borderRadius="full"
            variant="ghost"
            color="field.ink"
            _hover={{ bg: 'field.ink', color: 'field.paper' }}
            onClick={onOpenGitHubModal}
          />
        </Tooltip>
      ) : null}
      <Tooltip label="匯出">
        <IconButton
          aria-label="匯出"
          icon={
            <Download
              width={18}
              height={18}
              strokeWidth={1.9}
              aria-hidden="true"
            />
          }
          size="sm"
          minW={9}
          h={9}
          px={0}
          borderRadius="full"
          variant="ghost"
          color="field.ink"
          _hover={{ bg: 'field.ink', color: 'field.paper' }}
          onClick={onOpenExportModal}
          isDisabled={isSavingToLocal}
        />
      </Tooltip>
      <Tooltip label="儲存">
        <Box position="relative">
          <IconButton
            aria-label="儲存"
            icon={
              <FloppyDisk
                width={18}
                height={18}
                strokeWidth={1.9}
                aria-hidden="true"
              />
            }
            size="sm"
            minW={9}
            h={9}
            px={0}
            borderRadius="full"
            variant="ghost"
            color="field.ink"
            _hover={{ bg: 'field.ink', color: 'field.paper' }}
            onClick={onSaveProject}
            isDisabled={!canSaveDraft || isSavingToLocal}
          />
          {isDraftCurrent ? (
            <Box
              position="absolute"
              right="5px"
              bottom="5px"
              display="grid"
              placeItems="center"
              boxSize={3}
              bg="green.400"
              color="gray.950"
              borderRadius="full"
              borderWidth="1px"
              borderColor="gray.900"
              pointerEvents="none"
            >
              <Check width={7} height={7} strokeWidth={3} aria-hidden="true" />
            </Box>
          ) : null}
        </Box>
      </Tooltip>
    </HStack>
  )
}
