let editorLayoutPromise: Promise<
  typeof import('@/features/editor/EditorLayout')
> | null = null

export function preloadEditorLayout(): Promise<
  typeof import('@/features/editor/EditorLayout')
> {
  if (!editorLayoutPromise) {
    editorLayoutPromise = import('@/features/editor/EditorLayout')
  }
  return editorLayoutPromise
}
