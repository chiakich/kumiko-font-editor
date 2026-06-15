import {
  Box,
  Button,
  Heading,
  HStack,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react'
import { useState } from 'react'
import type { KumikoProjectSummary } from 'src/lib/project/projectTypes'
import type { ProjectOpenHandler } from 'src/features/home/types'
import { useTranslation } from 'react-i18next'

interface RecentProjectsListProps {
  projects: KumikoProjectSummary[]
  onRenameProject: (id: string, title: string) => void | Promise<void>
  onDeleteProject: (id: string, event: React.MouseEvent) => void
  onOpenProject: ProjectOpenHandler
}

export function RecentProjectsList({
  projects,
  onRenameProject,
  onDeleteProject,
  onOpenProject,
}: RecentProjectsListProps) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const startEditing = (project: KumikoProjectSummary) => {
    setEditingId(project.id)
    setEditingTitle(project.title)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  const commitEditing = async () => {
    if (!editingId) {
      return
    }
    await onRenameProject(editingId, editingTitle)
    cancelEditing()
  }

  return (
    <Box>
      <Heading size="sm" mb={4}>
        {t('home.recentProjectsTitle')}
      </Heading>
      {projects.length === 0 ? (
        <Text fontSize="sm" color="field.muted" textAlign="center">
          {t('home.noRecentProjects')}
        </Text>
      ) : (
        <VStack align="stretch" spacing={2} maxHeight="300px" overflowY="auto">
          {projects.map((project) => {
            const isEditing = editingId === project.id
            return (
              <HStack
                key={project.id}
                p={3}
                border="1px solid"
                borderColor="field.line"
                borderRadius="sm"
                justify="space-between"
                bg="field.paper"
                _hover={{ bg: isEditing ? 'field.paper' : 'field.yellow.300' }}
              >
                <Box flex="1" minW={0}>
                  {isEditing ? (
                    <Input
                      size="sm"
                      autoFocus
                      value={editingTitle}
                      placeholder={t('home.renameProjectPlaceholder')}
                      bg="field.panel"
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void commitEditing()
                        } else if (event.key === 'Escape') {
                          cancelEditing()
                        }
                      }}
                    />
                  ) : (
                    <Text fontWeight="900" fontSize="lg" isTruncated>
                      {project.title}
                    </Text>
                  )}
                  <Text fontSize="xs" color="field.muted" fontFamily="mono">
                    {project.sourceType === 'github'
                      ? `GitHub: ${project.githubSource?.owner}/${project.githubSource?.repo}${project.githubSource?.ref ? ` @ ${project.githubSource.ref}` : ''}`
                      : `本地匯入: ${project.sourceName ?? project.projectSourceFormat ?? 'Kumiko project'}`}
                  </Text>
                  <Text fontSize="xs" color="field.muted" fontFamily="mono">
                    {new Date(project.updatedAt).toLocaleString()}
                  </Text>
                </Box>
                {isEditing ? (
                  <HStack>
                    <Button size="sm" variant="ghost" onClick={cancelEditing}>
                      {t('home.cancel')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void commitEditing()}
                      isDisabled={!editingTitle.trim()}
                    >
                      {t('home.save')}
                    </Button>
                  </HStack>
                ) : (
                  <HStack>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEditing(project)}
                    >
                      {t('home.rename')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(event) => onDeleteProject(project.id, event)}
                    >
                      {t('home.delete')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void onOpenProject(project)}
                    >
                      {t('home.openProject')}
                    </Button>
                  </HStack>
                )}
              </HStack>
            )
          })}
        </VStack>
      )}
    </Box>
  )
}
