let editorLayoutPromise: Promise<
  typeof import('src/features/editor/EditorLayout')
> | null = null

export function preloadEditorLayout(): Promise<
  typeof import('src/features/editor/EditorLayout')
> {
  if (!editorLayoutPromise) {
    editorLayoutPromise = import('src/features/editor/EditorLayout')
  }
  return editorLayoutPromise
}
