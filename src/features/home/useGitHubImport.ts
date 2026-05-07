import { useCallback, useState } from 'react'
import { importGitHubUfoRepo } from 'src/lib/githubImport'
import type { KumikoProjectSummary } from 'src/lib/projectTypes'
import {
  clearGitHubUrlParams,
  getGitHubRepoUrl,
} from 'src/features/home/githubRepoUrl'
import type { PendingGitHubImport } from 'src/features/home/types'
import { saveImportedUfoWorkspaceAsProject } from 'src/features/home/projectImport'
import type { LoadedKumikoProject } from 'src/features/home/useProjectList'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '未知錯誤'

const getGitHubImportRequestFromUrl = (): PendingGitHubImport | null => {
  const url = new URL(window.location.href)
  const repo = url.searchParams.get('repo')?.trim()
  const ref = url.searchParams.get('ref')?.trim() ?? ''

  if (!repo) {
    return null
  }

  return {
    repo,
    ref,
    repoUrl: getGitHubRepoUrl(repo),
  }
}

export const useGitHubImport = (input: {
  onProjectImported: (project: LoadedKumikoProject) => Promise<void> | void
  onProjectSummarySaved: (summary: KumikoProjectSummary) => void
}) => {
  const initialGitHubImportRequest = useState(getGitHubImportRequestFromUrl)[0]
  const [isLoadingGitHub, setIsLoadingGitHub] = useState(false)
  const [githubRepoInput, setGitHubRepoInput] = useState(
    initialGitHubImportRequest?.repo ?? ''
  )
  const [githubRefInput, setGitHubRefInput] = useState(
    initialGitHubImportRequest?.ref ?? ''
  )
  const [showGitHubRefInput, setShowGitHubRefInput] = useState(
    Boolean(initialGitHubImportRequest?.ref)
  )
  const [pendingGitHubImport, setPendingGitHubImport] =
    useState<PendingGitHubImport | null>(initialGitHubImportRequest)

  const importGitHubProject = useCallback(
    async (request: { repo: string; ref: string; errorLabel: string }) => {
      if (!request.repo.trim() || isLoadingGitHub) {
        return
      }

      setIsLoadingGitHub(true)
      try {
        const importedUfoProject = await importGitHubUfoRepo({
          repo: request.repo,
          ref: request.ref,
        })
        const importedProject =
          await saveImportedUfoWorkspaceAsProject(importedUfoProject)
        input.onProjectSummarySaved(importedProject.summary)
        await input.onProjectImported(importedProject)
        clearGitHubUrlParams()
      } catch (error: unknown) {
        console.error(error)
        alert(`${request.errorLabel}: ${getErrorMessage(error)}`)
      } finally {
        setIsLoadingGitHub(false)
      }
    },
    [input, isLoadingGitHub]
  )

  const handleGitHubImport = async () => {
    if (!githubRepoInput.trim()) {
      return
    }

    await importGitHubProject({
      repo: githubRepoInput,
      ref: githubRefInput,
      errorLabel: '讀取 GitHub 專案失敗',
    })
  }

  const handleCancelPendingGitHubImport = () => {
    setPendingGitHubImport(null)
    clearGitHubUrlParams()
  }

  const handleConfirmPendingGitHubImport = async () => {
    if (!pendingGitHubImport) {
      return
    }

    const { repo, ref } = pendingGitHubImport
    setPendingGitHubImport(null)
    await importGitHubProject({
      repo,
      ref,
      errorLabel: '載入 GitHub 專案失敗',
    })
  }

  return {
    githubRefInput,
    githubRepoInput,
    isLoadingGitHub,
    pendingGitHubImport,
    setGithubRefInput: setGitHubRefInput,
    setGithubRepoInput: setGitHubRepoInput,
    setShowGitHubRefInput,
    showGitHubRefInput,
    handleCancelPendingGitHubImport,
    handleConfirmPendingGitHubImport,
    handleGitHubImport,
  }
}
