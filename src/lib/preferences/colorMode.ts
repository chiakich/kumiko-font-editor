import { useSyncExternalStore } from 'react'

const COLOR_MODE_STORAGE_KEY = 'kumiko.app.colorMode.v1'

/** User-facing preference. `system` follows the OS color scheme. */
export type ColorModePreference = 'light' | 'dark' | 'system'
/** The actually-applied mode after resolving `system`. */
export type ResolvedColorMode = 'light' | 'dark'

const DEFAULT_COLOR_MODE: ColorModePreference = 'system'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const getLocalStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const normalizeColorMode = (
  value: string | null | undefined
): ColorModePreference =>
  value === 'light' || value === 'dark' || value === 'system'
    ? value
    : DEFAULT_COLOR_MODE

const prefersDark = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export const resolveColorMode = (
  preference: ColorModePreference
): ResolvedColorMode =>
  preference === 'system' ? (prefersDark() ? 'dark' : 'light') : preference

export const loadColorMode = (
  storage: StorageLike | null = getLocalStorage()
): ColorModePreference => {
  if (!storage) {
    return DEFAULT_COLOR_MODE
  }
  try {
    return normalizeColorMode(storage.getItem(COLOR_MODE_STORAGE_KEY))
  } catch {
    return DEFAULT_COLOR_MODE
  }
}

const colorModeListeners = new Set<() => void>()

/**
 * Reflect the resolved mode onto <html> via the `.dark` class that Chakra's
 * `_dark` condition targets. Called on every change and on system-scheme shifts.
 */
export const applyResolvedColorMode = (preference: ColorModePreference) => {
  if (typeof document === 'undefined') {
    return
  }
  const resolved = resolveColorMode(preference)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
}

export const saveColorMode = (
  preference: ColorModePreference,
  storage: StorageLike | null = getLocalStorage()
) => {
  const normalized = normalizeColorMode(preference)
  if (storage) {
    try {
      storage.setItem(COLOR_MODE_STORAGE_KEY, normalized)
    } catch {
      // Keep the in-memory setting responsive even when storage is unavailable.
    }
  }
  applyResolvedColorMode(normalized)
  colorModeListeners.forEach((listener) => listener())
  return normalized
}

const subscribeColorMode = (listener: () => void) => {
  colorModeListeners.add(listener)

  if (typeof window === 'undefined') {
    return () => {
      colorModeListeners.delete(listener)
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === COLOR_MODE_STORAGE_KEY) {
      applyResolvedColorMode(loadColorMode())
      listener()
    }
  }
  // Re-resolve when the OS scheme changes and the preference is `system`.
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  const handleMedia = () => {
    if (loadColorMode() === 'system') {
      applyResolvedColorMode('system')
      listener()
    }
  }

  window.addEventListener('storage', handleStorage)
  media?.addEventListener('change', handleMedia)

  return () => {
    colorModeListeners.delete(listener)
    window.removeEventListener('storage', handleStorage)
    media?.removeEventListener('change', handleMedia)
  }
}

/** Reactive access to the stored preference (light | dark | system). */
export const useColorModePreference = (): ColorModePreference =>
  useSyncExternalStore(
    subscribeColorMode,
    () => loadColorMode(),
    () => DEFAULT_COLOR_MODE
  )

export const useResolvedColorMode = (): ResolvedColorMode =>
  resolveColorMode(useColorModePreference())

/**
 * Mount once near the app root: applies the stored preference on load and keeps
 * <html> in sync as the preference or OS scheme changes.
 */
export const useApplyColorMode = () => {
  const preference = useColorModePreference()
  // useSyncExternalStore already re-subscribes; apply synchronously on render so
  // the class is correct before paint (avoids a light→dark flash).
  if (typeof document !== 'undefined') {
    applyResolvedColorMode(preference)
  }
}
