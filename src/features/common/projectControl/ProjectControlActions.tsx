import { useToast } from '@/components/ui/toast'
import { Box, HStack, IconButton, useDisclosure } from '@chakra-ui/react'
import { Tooltip } from '@/components/ui/tooltip'
import {
  CheckCircle,
  ClockRotateRight,
  Download,
  FontQuestion,
  Github,
  PageSearch,
  Settings,
  WarningTriangle,
} from 'iconoir-react'
import { AppSettingsModal } from 'src/features/common/projectControl/AppSettingsModal'
import { useFlushCurrentDraft } from 'src/hooks/useFlushCurrentDraft'
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
  const localSaveStatus =
    persistenceStatus === 'queued' ||
    persistenceStatus === 'saving' ||
    persistenceStatus === 'saved'
      ? persistenceStatus
      : null
  const localSaveStatusLabel = localSaveStatus
    ? t(`projectControl.localSaveStatus.${localSaveStatus}`)
    : ''

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
        gap={1}
        justify="flex-end"
        alignSelf="flex-end"
        px={2}
        py={1}
        bg="muted"
        borderRadius="full"
      >
        {hasGitHubSource ? (
          <Tooltip content={t('projectControl.gitHubCommit')}>
            <IconButton
              aria-label={t('projectControl.openGitHubCommit')}
              size="sm"
              minW={9}
              h={9}
              px={0}
              borderRadius="full"
              variant="ghost"
              color="foreground"
              _hover={{ bg: 'foreground', color: 'background' }}
              onClick={onOpenGitHubModal}
            >
              <Github
                width={18}
                height={18}
                strokeWidth={1.9}
                aria-hidden="true"
              />
            </IconButton>
          </Tooltip>
        ) : null}
        <Tooltip content={t('qualityCheck.title')}>
          <IconButton
            aria-label={t('qualityCheck.open')}
            size="sm"
            minW={9}
            h={9}
            px={0}
            borderRadius="full"
            variant="ghost"
            color="foreground"
            _hover={{ bg: 'foreground', color: 'background' }}
            onClick={onOpenQualityCheckModal}
          >
            <PageSearch
              width={18}
              height={18}
              strokeWidth={1.9}
              aria-hidden="true"
            />
          </IconButton>
        </Tooltip>
        <Tooltip content={t('settings.title')}>
          <IconButton
            aria-label={t('projectControl.openSettings')}
            size="sm"
            minW={9}
            h={9}
            px={0}
            borderRadius="full"
            variant="ghost"
            color="foreground"
            _hover={{ bg: 'foreground', color: 'background' }}
            onClick={appSettingsModal.onOpen}
          >
            <Settings
              width={18}
              height={18}
              strokeWidth={1.9}
              aria-hidden="true"
            />
          </IconButton>
        </Tooltip>
        <Tooltip content={t('projectControl.fontSettings')}>
          <IconButton
            aria-label={t('projectControl.openFontSettings')}
            size="sm"
            minW={9}
            h={9}
            px={0}
            borderRadius="full"
            variant="ghost"
            color="foreground"
            _hover={{ bg: 'foreground', color: 'background' }}
            onClick={onOpenFontSettingsModal}
          >
            <FontQuestion
              width={18}
              height={18}
              strokeWidth={1.9}
              aria-hidden="true"
            />
          </IconButton>
        </Tooltip>
        {hasLocalSaveError ? (
          <Tooltip
            content={t('projectControl.localSaveFailedRetryTooltip', {
              message: localSaveErrorMessage,
            })}
          >
            <IconButton
              aria-label={t('projectControl.retryLocalSave')}
              size="sm"
              minW={9}
              h={9}
              px={0}
              borderRadius="full"
              variant="ghost"
              color="destructive"
              _hover={{ bg: 'destructive', color: 'card' }}
              onClick={() => void handleRetryLocalSave()}
              loading={isRetryingLocalSave}
            >
              <WarningTriangle
                width={18}
                height={18}
                strokeWidth={1.9}
                aria-hidden="true"
              />
            </IconButton>
          </Tooltip>
        ) : null}
        {localSaveStatus ? (
          <Tooltip content={localSaveStatusLabel}>
            <Box
              role="status"
              aria-label={localSaveStatusLabel}
              minW={9}
              h={9}
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              color={
                localSaveStatus === 'saved' ? 'success' : 'mutedForeground'
              }
            >
              {localSaveStatus === 'saved' ? (
                <CheckCircle
                  width={18}
                  height={18}
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
              ) : (
                <ClockRotateRight
                  width={18}
                  height={18}
                  strokeWidth={1.9}
                  aria-hidden="true"
                />
              )}
            </Box>
          </Tooltip>
        ) : null}
        <Tooltip content={t('projectControl.export')}>
          <IconButton
            aria-label={t('projectControl.export')}
            size="sm"
            minW={9}
            h={9}
            px={0}
            borderRadius="full"
            variant="ghost"
            color="foreground"
            _hover={{ bg: 'foreground', color: 'background' }}
            onClick={onOpenExportModal}
            disabled={isSavingToLocal}
          >
            <Download
              width={18}
              height={18}
              strokeWidth={1.9}
              aria-hidden="true"
            />
          </IconButton>
        </Tooltip>
      </HStack>
      <AppSettingsModal
        isOpen={appSettingsModal.open}
        onClose={appSettingsModal.onClose}
      />
    </>
  )
}
