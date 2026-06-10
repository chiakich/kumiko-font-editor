import {
  Box,
  HStack,
  IconButton,
  Tooltip,
  useDisclosure,
} from '@chakra-ui/react'
import {
  Check,
  Download,
  FloppyDisk,
  FontQuestion,
  Github,
  PageSearch,
  Settings,
} from 'iconoir-react'
import { AppSettingsModal } from 'src/features/common/projectControl/AppSettingsModal'
import { useTranslation } from 'react-i18next'

interface ProjectControlActionsProps {
  canSaveDraft: boolean
  hasGitHubSource: boolean
  isDraftCurrent: boolean
  isSavingToLocal: boolean
  onOpenExportModal: () => void
  onOpenFontSettingsModal: () => void
  onOpenGitHubModal: () => void
  onOpenQualityCheckModal: () => void
  onSaveProject: () => void
}

export function ProjectControlActions({
  canSaveDraft,
  hasGitHubSource,
  isDraftCurrent,
  isSavingToLocal,
  onOpenExportModal,
  onOpenFontSettingsModal,
  onOpenGitHubModal,
  onOpenQualityCheckModal,
  onSaveProject,
}: ProjectControlActionsProps) {
  const appSettingsModal = useDisclosure()
  const { t } = useTranslation()

  return (
    <>
      <HStack
        spacing={1}
        justify="flex-end"
        alignSelf="flex-end"
        px={2}
        py={1}
        bg="field.panelMuted"
        borderRadius="full"
      >
        {hasGitHubSource ? (
          <Tooltip label={t('projectControl.gitHubCommit')}>
            <IconButton
              aria-label={t('projectControl.openGitHubCommit')}
              icon={
                <Github
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
        <Tooltip label="品質檢查">
          <IconButton
            aria-label="打開品質檢查"
            icon={
              <PageSearch
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
            onClick={onOpenQualityCheckModal}
          />
        </Tooltip>
        <Tooltip label={t('settings.title')}>
          <IconButton
            aria-label={t('projectControl.openSettings')}
            icon={
              <Settings
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
            onClick={appSettingsModal.onOpen}
          />
        </Tooltip>
        <Tooltip label={t('projectControl.fontSettings')}>
          <IconButton
            aria-label={t('projectControl.openFontSettings')}
            icon={
              <FontQuestion
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
            onClick={onOpenFontSettingsModal}
          />
        </Tooltip>
        <Tooltip label={t('projectControl.export')}>
          <IconButton
            aria-label={t('projectControl.export')}
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
        <Tooltip label={t('projectControl.save')}>
          <Box position="relative">
            <IconButton
              aria-label={t('projectControl.save')}
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
                <Check
                  width={7}
                  height={7}
                  strokeWidth={3}
                  aria-hidden="true"
                />
              </Box>
            ) : null}
          </Box>
        </Tooltip>
      </HStack>
      <AppSettingsModal
        isOpen={appSettingsModal.isOpen}
        onClose={appSettingsModal.onClose}
      />
    </>
  )
}
