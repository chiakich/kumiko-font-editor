import { Box, Divider, Grid, VStack } from '@chakra-ui/react'
import { GitHubImportCard } from 'src/features/home/GitHubImportCard'
import { HomeHeader } from 'src/features/home/HomeHeader'
import { LocalImportCard } from 'src/features/home/LocalImportCard'
import { PendingGitHubImportModal } from 'src/features/home/PendingGitHubImportModal'
import { RecentProjectsList } from 'src/features/home/RecentProjectsList'
import { useHomeProjects } from 'src/features/home/useHomeProjects'

export function Home() {
  const {
    githubRefInput,
    githubRepoInput,
    isLoadingGitHub,
    isLoadingLocal,
    isDraggingLocal,
    folderInputRef,
    fileInputRef,
    pendingGitHubImport,
    projects,
    setGithubRefInput,
    setGithubRepoInput,
    setShowGitHubRefInput,
    showGitHubRefInput,
    handleCancelPendingGitHubImport,
    handleConfirmPendingGitHubImport,
    handleDeleteProject,
    handleLocalDragEnter,
    handleLocalDragLeave,
    handleLocalDragOver,
    handleGitHubImport,
    handleOpenProject,
    handleFolderUpload,
    handleFileUpload,
    handleDropUpload,
  } = useHomeProjects()

  return (
    <Box
      w="100vw"
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px={{ base: 4, md: 8 }}
      py={{ base: 6, md: 10 }}
      bg="field.paper"
      backgroundImage="var(--field-plus-pattern)"
      backgroundSize="26px 26px"
      backgroundRepeat="repeat"
    >
      <PendingGitHubImportModal
        importRequest={pendingGitHubImport}
        isLoading={isLoadingGitHub}
        onCancel={handleCancelPendingGitHubImport}
        onConfirm={handleConfirmPendingGitHubImport}
      />

      <Box
        p={{ base: 5, md: 8 }}
        borderRadius="sm"
        boxShadow="lg"
        w="100%"
        maxW="880px"
        bg="field.panel"
        position="relative"
        _before={{
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          h: '7px',
          bg: 'field.yellow.400',
          borderBottom: '1px solid',
          borderColor: 'field.ink',
        }}
      >
        <HomeHeader />

        <VStack spacing={6} align="stretch">
          <Grid templateColumns="1fr 1fr" gap={6}>
            <LocalImportCard
              folderInputRef={folderInputRef}
              fileInputRef={fileInputRef}
              isDragging={isDraggingLocal}
              isLoading={isLoadingLocal}
              onDragEnter={handleLocalDragEnter}
              onDragLeave={handleLocalDragLeave}
              onDragOver={handleLocalDragOver}
              onFolderUpload={handleFolderUpload}
              onFileUpload={handleFileUpload}
              onDropUpload={handleDropUpload}
            />

            <GitHubImportCard
              isLoading={isLoadingGitHub}
              refInput={githubRefInput}
              repoInput={githubRepoInput}
              showRefInput={showGitHubRefInput}
              onImport={handleGitHubImport}
              onRefInputChange={setGithubRefInput}
              onRepoInputChange={setGithubRepoInput}
              onToggleRefInput={() =>
                setShowGitHubRefInput((current) => !current)
              }
            />
          </Grid>

          <Divider borderColor="field.line" />

          <RecentProjectsList
            projects={projects}
            onDeleteProject={handleDeleteProject}
            onOpenProject={handleOpenProject}
          />
        </VStack>
      </Box>
    </Box>
  )
}
