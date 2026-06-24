interface ShortcutTargetOptions {
  ignoreKumikoHiddenTextInput?: boolean
}

const isKumikoHiddenTextInput = (target: EventTarget | null) =>
  target instanceof HTMLTextAreaElement &&
  target.dataset.kumikoHiddenTextInput === 'true'

export const isTextShortcutTarget = (
  target: EventTarget | null,
  options: ShortcutTargetOptions = {}
) => {
  if (options.ignoreKumikoHiddenTextInput && isKumikoHiddenTextInput(target)) {
    return false
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

export const isGlobalShortcutBoundaryTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(
    target.closest('[role="dialog"], [data-kumiko-shortcut-boundary="true"]')
  )
}

export const shouldIgnoreGlobalShortcut = (
  target: EventTarget | null,
  options: ShortcutTargetOptions = {}
) =>
  isTextShortcutTarget(target, options) ||
  isGlobalShortcutBoundaryTarget(target)
