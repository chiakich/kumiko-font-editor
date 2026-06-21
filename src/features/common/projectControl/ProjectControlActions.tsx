import {
  HStack,
  IconButton,
  Tooltip,
  useDisclosure,
  useToast,
} from '@chakra-ui/react'
import {
  Download,
  FontQuestion,
  Github,
  PageSearch,
  Settings,
  WarningTriangle,
} from 'iconoir-react'
import { AppSettingsModal } from 'src/features/common/projectControl/AppSettingsModal'
import { useFlushCurrentDraft } from 'src/features/common/projectPersistence/useFlushCurrentDraft'
import { useStore } from 'src/store'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ProjectControlActionsProps {
  hasGitHubSource: boolean
  isSavingToLocal: boolean
  onOpenExportModal: () => void
  onOpenFontSettingsModal: () => void
  onOpenGitHubModal: () => void
  onOpenQualityCheckModal: () => void
}

export function ProjectControlActions({
  hasGitHubSource,
  isSavingToLocal,
  onOpenExportModal,
  onOpenFontSettingsModal,
  onOpenGitHubModal,
  onOpenQualityCheckModal,
}: ProjectControlActionsProps) {
  const appSettingsModal = useDisclosure()
  const toast = useToast()
  const { t } = useTranslation()
  const persistenceStatus = useStore((state) => state.persistenceStatus)
  const persistenceError = useStore((state) => state.persistenceError)
  const retryLocalSave = useFlushCurrentDraft({ allowErrorRetry: true })
  const [isRetryingLocalSave, setIsRetryingLocalSave] = useState(false)
  const hasLocalSaveError = persistenceStatus === 'error'
  const localSaveErrorMessage =
    persistenceError ?? t('projectControl.localSaveFailedFallback')

  const handleRetryLocalSave = async () => {
    if (isRetryingLocalSave) {
      return
    }

    setIsRetryingLocalSave(true)
    try {
      await retryLocalSave()
      toast({
        title: t('projectControl.localSaveRetrySucceeded'),
        status: 'success',
        duration: 1800,
        isClosable: true,
      })
    } catch (error) {
      toast({
        title: t('projectControl.localSaveRetryFailed'),
        description:
          error instanceof Error ? error.message : localSaveErrorMessage,
        status: 'error',
        duration: 3600,
        isClosable: true,
      })
    } finally {
      setIsRetryingLocalSave(false)
    }
  }

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
        <Tooltip label={t('qualityCheck.title')}>
          <IconButton
            aria-label={t('qualityCheck.open')}
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
        {hasLocalSaveError ? (
          <Tooltip
            label={t('projectControl.localSaveFailedRetryTooltip', {
              message: localSaveErrorMessage,
            })}
          >
            <IconButton
              aria-label={t('projectControl.retryLocalSave')}
              icon={
                <WarningTriangle
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
              color="field.red.500"
              _hover={{ bg: 'field.red.500', color: 'field.panel' }}
              onClick={() => void handleRetryLocalSave()}
              isLoading={isRetryingLocalSave}
            />
          </Tooltip>
        ) : null}
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
      </HStack>
      <AppSettingsModal
        isOpen={appSettingsModal.isOpen}
        onClose={appSettingsModal.onClose}
      />
    </>
  )
}
