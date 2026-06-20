import { useEffect } from 'react'
import {
  PROJECT_WRITE_LOCK_HEARTBEAT_MS,
  releaseProjectWriteLock,
  renewProjectWriteLock,
} from 'src/lib/project/projectWriteLock'
import { useStore } from 'src/store'

export function useProjectWriteLockHeartbeat() {
  const projectId = useStore((state) => state.projectId)

  useEffect(() => {
    if (!projectId) {
      return
    }

    const renew = () => {
      void renewProjectWriteLock(projectId).catch((error) => {
        console.warn('Project write lock heartbeat failed.', error)
      })
    }

    renew()
    const release = () => {
      void releaseProjectWriteLock(projectId).catch((error) => {
        console.warn('Project write lock release failed.', error)
      })
    }
    const intervalId = window.setInterval(
      renew,
      PROJECT_WRITE_LOCK_HEARTBEAT_MS
    )
    window.addEventListener('pagehide', release)
    window.addEventListener('beforeunload', release)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('pagehide', release)
      window.removeEventListener('beforeunload', release)
    }
  }, [projectId])
}
