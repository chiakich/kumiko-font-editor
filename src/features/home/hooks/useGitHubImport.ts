import { useCallback, useState } from 'react'
import {
  importPreparedGitHubUfoRepo,
  prepareGitHubUfoImport,
  type PreparedGitHubUfoImport,
} from 'src/lib/github/githubImport'
import type { KumikoProjectSummary } from 'src/lib/project/projectTypes'
import {
  clearGitHubUrlParams,
  getGitHubRepoUrl,
} from 'src/features/home/utils/githubRepoUrl'
import type { PendingGitHubImport } from 'src/features/home/types'
import { saveImportedUfoWorkspaceAsProject } from 'src/features/home/utils/projectImport'
import type { LoadedKumikoProject } from 'src/features/home/hooks/useProjectList'

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
  const [pendingGitHubDesignspaceImport, setPendingGitHubDesignspaceImport] =
    useState<{
      prepared: PreparedGitHubUfoImport
      clearUrlParamsOnImport: boolean
    } | null>(null)

  const finishPreparedGitHubImport = useCallback(
    async (
      prepared: PreparedGitHubUfoImport,
      options: {
        designspacePath?: string | null
        clearUrlParamsOnImport?: boolean
      } = {}
    ) => {
      const importedUfoProject = await importPreparedGitHubUfoRepo(prepared, {
        designspacePath: options.designspacePath,
      })
      const importedProject =
        await saveImportedUfoWorkspaceAsProject(importedUfoProject)
      input.onProjectSummarySaved(importedProject.summary)
      await input.onProjectImported(importedProject)
      if (options.clearUrlParamsOnImport) {
        clearGitHubUrlParams()
      }
    },
    [input]
  )

  const importGitHubProject = useCallback(
    async (request: {
      repo: string
      ref: string
      errorLabel: string
      clearUrlParamsOnImport?: boolean
    }) => {
      if (!request.repo.trim() || isLoadingGitHub) {
        return
      }

      setIsLoadingGitHub(true)
      try {
        const prepared = await prepareGitHubUfoImport({
          repo: request.repo,
          ref: request.ref,
        })
        if (prepared.designspaceCandidates.length > 1) {
          setPendingGitHubDesignspaceImport({
            prepared,
            clearUrlParamsOnImport: Boolean(request.clearUrlParamsOnImport),
          })
          return
        }

        await finishPreparedGitHubImport(prepared, {
          clearUrlParamsOnImport: request.clearUrlParamsOnImport,
        })
      } catch (error: unknown) {
        console.error(error)
        alert(`${request.errorLabel}: ${getErrorMessage(error)}`)
      } finally {
        setIsLoadingGitHub(false)
      }
    },
    [finishPreparedGitHubImport, isLoadingGitHub]
  )

  const handleGitHubImport = async () => {
    if (!githubRepoInput.trim()) {
      return
    }

    await importGitHubProject({
      repo: githubRepoInput,
      ref: githubRefInput,
      errorLabel: '讀取 GitHub 專案失敗',
      clearUrlParamsOnImport: false,
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
      clearUrlParamsOnImport: true,
    })
  }

  const handleCancelGitHubDesignspaceImport = () => {
    if (pendingGitHubDesignspaceImport?.clearUrlParamsOnImport) {
      clearGitHubUrlParams()
    }
    setPendingGitHubDesignspaceImport(null)
  }

  const handleConfirmGitHubDesignspaceImport = async (
    designspacePath: string
  ) => {
    const pending = pendingGitHubDesignspaceImport
    if (!pending || isLoadingGitHub) {
      return
    }

    setPendingGitHubDesignspaceImport(null)
    setIsLoadingGitHub(true)
    try {
      await finishPreparedGitHubImport(pending.prepared, {
        designspacePath,
        clearUrlParamsOnImport: pending.clearUrlParamsOnImport,
      })
    } catch (error: unknown) {
      console.error(error)
      alert(`讀取 GitHub 專案失敗: ${getErrorMessage(error)}`)
    } finally {
      setIsLoadingGitHub(false)
    }
  }

  return {
    githubRefInput,
    githubRepoInput,
    isLoadingGitHub,
    pendingGitHubImport,
    pendingGitHubDesignspaceImport,
    setGithubRefInput: setGitHubRefInput,
    setGithubRepoInput: setGitHubRepoInput,
    setShowGitHubRefInput,
    showGitHubRefInput,
    handleCancelPendingGitHubImport,
    handleConfirmPendingGitHubImport,
    handleCancelGitHubDesignspaceImport,
    handleConfirmGitHubDesignspaceImport,
    handleGitHubImport,
  }
}
