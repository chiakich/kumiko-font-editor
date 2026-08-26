import { toaster } from '@/components/ui/toaster'
import {
  Box,
  HStack,
  IconButton,
  Spinner,
  Text,
  useDisclosure,
} from '@chakra-ui/react'
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
import {
  ProjectVersionMenu,
  type ProjectVersionMenuProps,
} from 'src/features/common/projectControl/ProjectVersionMenu'
import { useFlushCurrentDraft } from 'src/hooks/useFlushCurrentDraft'
import { useStore } from 'src/store'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface GitStatusIndicator {
  // Unsent items, mirroring the receipt's own count.
  pendingChangeCount: number
  conflictCount: number
  hasSubmitError: boolean
  isSubmitting: boolean
  isSignedIn: boolean
}

interface ProjectControlActionsProps {
  hasGitHubSource: boolean
  gitStatus?: GitStatusIndicator
  versionMenu?: ProjectVersionMenuProps
  isSavingToLocal: boolean
  onOpenExportModal: () => void
  onOpenFontSettingsModal: () => void
  onOpenGitHubModal: () => void
  onOpenQualityCheckModal: () => void
}

export function ProjectControlActions({
  hasGitHubSource,
  gitStatus,
  versionMenu,
  isSavingToLocal,
  onOpenExportModal,
  onOpenFontSettingsModal,
  onOpenGitHubModal,
  onOpenQualityCheckModal,
}: ProjectControlActionsProps) {
  const appSettingsModal = useDisclosure()
  const { t } = useTranslation()
  const persistenceStatus = useStore((state) => state.persistenceStatus)
  const persistenceError = useStore((state) => state.persistenceError)
  const retryLocalSave = useFlushCurrentDraft({ allowErrorRetry: true })
  const saveToLocalNow = useFlushCurrentDraft()
  const [isRetryingLocalSave, setIsRetryingLocalSave] = useState(false)
  const [isSavingToLocalNow, setIsSavingToLocalNow] = useState(false)
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
  // while queued the control is actionable, so it is labelled by what it does
  const localSaveActionLabel =
    localSaveStatus === 'queued'
      ? t('projectControl.localSaveNow')
      : localSaveStatusLabel

  // The 10s autosave debounce restarts on every edit, so a long editing burst
  // never reaches it — this is the way to force the write.
  const handleSaveToLocalNow = async () => {
    if (isSavingToLocalNow) {
      return
    }

    setIsSavingToLocalNow(true)
    try {
      await saveToLocalNow()
    } catch (error) {
      toaster.create({
        title: t('projectControl.localSaveFailedFallback'),
        description:
          error instanceof Error ? error.message : localSaveErrorMessage,
        type: 'error',
        duration: 3600,
        closable: true,
      })
    } finally {
      setIsSavingToLocalNow(false)
    }
  }

  const handleRetryLocalSave = async () => {
    if (isRetryingLocalSave) {
      return
    }

    setIsRetryingLocalSave(true)
    try {
      await retryLocalSave()
      toaster.create({
        title: t('projectControl.localSaveRetrySucceeded'),
        type: 'success',
        duration: 1800,
        closable: true,
      })
    } catch (error) {
      toaster.create({
        title: t('projectControl.localSaveRetryFailed'),
        description:
          error instanceof Error ? error.message : localSaveErrorMessage,
        type: 'error',
        duration: 3600,
        closable: true,
      })
    } finally {
      setIsRetryingLocalSave(false)
    }
  }

  // Priority order: a conflict blocks sending, so it outranks the count; a
  // failure outranks a quiet "all synced"; no badge at all means synced.
  const gitBadge = !gitStatus
    ? null
    : gitStatus.isSubmitting
      ? { kind: 'spinner' as const, bg: 'cyan.400', fg: 'cyan.900', label: '' }
      : gitStatus.conflictCount > 0
        ? { kind: 'alert' as const, bg: 'orange.400', fg: 'white', label: '!' }
        : gitStatus.hasSubmitError
          ? {
              kind: 'alert' as const,
              bg: 'destructive',
              fg: 'white',
              label: '!',
            }
          : !gitStatus.isSignedIn
            ? {
                kind: 'muted' as const,
                bg: 'gray.300',
                fg: 'gray.700',
                label: '',
              }
            : gitStatus.pendingChangeCount > 0
              ? {
                  kind: 'count' as const,
                  bg: 'primary',
                  fg: 'primaryForeground',
                  label:
                    gitStatus.pendingChangeCount > 99
                      ? '99+'
                      : String(gitStatus.pendingChangeCount),
                }
              : null

  return (
    <>
      <HStack gap={2} justify="space-between" align="center" width="100%">
        {hasGitHubSource && versionMenu ? (
          <ProjectVersionMenu {...versionMenu} />
        ) : null}
        <HStack
          gap={1}
          justify="flex-end"
          ml="auto"
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
                position="relative"
                _hover={{ bg: 'foreground', color: 'background' }}
                onClick={onOpenGitHubModal}
              >
                <Github
                  width={18}
                  height={18}
                  strokeWidth={1.9}
                  aria-hidden="true"
                  opacity={gitBadge?.kind === 'muted' ? 0.42 : 1}
                />
                {gitBadge ? (
                  <Box
                    className="corner-round"
                    position="absolute"
                    top="-1px"
                    right="-2px"
                    minWidth="17px"
                    height="17px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    px={1}
                    borderWidth="2px"
                    borderColor="muted"
                    borderRadius="full"
                    bg={gitBadge.bg}
                    color={gitBadge.fg}
                    aria-hidden="true"
                  >
                    {gitBadge.kind === 'spinner' ? (
                      <Spinner size="xs" borderWidth="1.5px" />
                    ) : (
                      <Text fontFamily="mono" fontSize="9px" fontWeight={600}>
                        {gitBadge.label}
                      </Text>
                    )}
                  </Box>
                ) : null}
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
            <Tooltip content={localSaveActionLabel}>
              <IconButton
                aria-label={localSaveActionLabel}
                size="sm"
                minW={9}
                h={9}
                px={0}
                borderRadius="full"
                variant="ghost"
                color={
                  localSaveStatus === 'saved' ? 'success' : 'mutedForeground'
                }
                _hover={{ bg: 'foreground', color: 'background' }}
                onClick={() => void handleSaveToLocalNow()}
                disabled={localSaveStatus !== 'queued'}
                loading={localSaveStatus === 'saving' || isSavingToLocalNow}
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
              </IconButton>
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
      </HStack>
      <AppSettingsModal
        isOpen={appSettingsModal.open}
        onClose={appSettingsModal.onClose}
      />
    </>
  )
}
