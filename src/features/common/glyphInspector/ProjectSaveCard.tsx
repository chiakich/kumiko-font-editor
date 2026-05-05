import { Box, Button, Heading, Menu, MenuButton, MenuItem, MenuList, Stack } from '@chakra-ui/react'

interface ProjectSaveCardProps {
  canSaveDraft: boolean
  canSaveLocal: boolean
  hasUfoSource: boolean
  hasGitHubSource: boolean
  isSavingToLocal: boolean
  loadingText: string
  onOpenGitHubModal: () => void
  onSaveLocal: (format: 'zip' | 'ttf' | 'otf' | 'woff') => void
  onSaveProject: () => void
}

export function ProjectSaveCard({
  canSaveDraft,
  canSaveLocal,
  hasUfoSource,
  hasGitHubSource,
  isSavingToLocal,
  loadingText,
  onOpenGitHubModal,
  onSaveLocal,
  onSaveProject,
}: ProjectSaveCardProps) {
  return (
    <Box p={4} bg="field.panel" borderRadius="sm">
      <Stack spacing={3}>
        <Heading size="sm" textTransform="uppercase" color="field.ink">
          專案儲存
        </Heading>
        {hasUfoSource ? (
          <>
            <Menu>
              <MenuButton
                as={Button}
                isDisabled={!canSaveLocal}
                isLoading={isSavingToLocal}
                loadingText={loadingText}
              >
                匯出字型
              </MenuButton>
              <MenuList>
                <MenuItem onClick={() => onSaveLocal('zip')}>UFO (ZIP)</MenuItem>
                <MenuItem onClick={() => onSaveLocal('ttf')}>TTF</MenuItem>
                <MenuItem onClick={() => onSaveLocal('otf')}>OTF</MenuItem>
                <MenuItem onClick={() => onSaveLocal('woff')}>WOFF</MenuItem>
              </MenuList>
            </Menu>
            <Button
              variant="outline"
              onClick={onSaveProject}
              isDisabled={!canSaveDraft || isSavingToLocal}
            >
              儲存草稿
            </Button>
            {hasGitHubSource ? (
              <Button variant="outline" onClick={onOpenGitHubModal}>
                GitHub / Commit
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button onClick={onSaveProject} isDisabled={!canSaveDraft}>
              儲存目前專案
            </Button>
            <Button
              variant="outline"
              onClick={onSaveProject}
              isDisabled={!canSaveDraft}
            >
              儲存草稿
            </Button>
          </>
        )}
      </Stack>
    </Box>
  )
}
