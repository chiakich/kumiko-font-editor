import { Box, Button, Heading, HStack, Text, VStack } from '@chakra-ui/react'
import type { KumikoProjectSummary } from 'src/lib/projectTypes'
import type { ProjectOpenHandler } from 'src/features/home/types'

interface RecentProjectsListProps {
  projects: KumikoProjectSummary[]
  onDeleteProject: (id: string, event: React.MouseEvent) => void
  onOpenProject: ProjectOpenHandler
}

export function RecentProjectsList({
  projects,
  onDeleteProject,
  onOpenProject,
}: RecentProjectsListProps) {
  return (
    <Box>
      <Heading size="sm" mb={4}>
        您最近開啟的字體專案 (IndexedDB)
      </Heading>
      {projects.length === 0 ? (
        <Text fontSize="sm" color="field.muted" textAlign="center">
          尚無任何專案紀錄
        </Text>
      ) : (
        <VStack align="stretch" spacing={2} maxHeight="300px" overflowY="auto">
          {projects.map((project) => (
            <HStack
              key={project.id}
              p={3}
              border="1px solid"
              borderColor="field.line"
              borderRadius="sm"
              justify="space-between"
              bg="field.paper"
              _hover={{ bg: 'field.yellow.300' }}
            >
              <Box>
                <Text fontWeight="900" fontSize="lg">
                  {project.title}
                </Text>
                <Text fontSize="xs" color="field.muted" fontFamily="mono">
                  {project.sourceType === 'github'
                    ? `GitHub: ${project.githubSource?.owner}/${project.githubSource?.repo}${project.githubSource?.ref ? ` @ ${project.githubSource.ref}` : ''}`
                    : `本地匯入: ${project.sourceName ?? project.projectSourceFormat ?? 'Kumiko project'}`}
                </Text>
                <Text fontSize="xs" color="field.muted" fontFamily="mono">
                  {new Date(project.updatedAt).toLocaleString()}
                </Text>
              </Box>
              <HStack>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(event) => onDeleteProject(project.id, event)}
                >
                  刪除
                </Button>
                <Button size="sm" onClick={() => void onOpenProject(project)}>
                  開啟此專案
                </Button>
              </HStack>
            </HStack>
          ))}
        </VStack>
      )}
    </Box>
  )
}
