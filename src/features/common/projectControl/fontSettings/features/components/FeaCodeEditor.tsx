import { Box } from '@chakra-ui/react'
import { useEffect, useRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import {
  feaLanguage,
  feaSyntaxHighlighting,
} from 'src/features/common/projectControl/fontSettings/features/utils/feaLanguage'

export interface FeaEditorDiagnostic {
  // 1-based line in the shown text.
  line: number
  message: string
  severity: 'error' | 'warning'
}

interface FeaCodeEditorProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  minHeight?: string
  diagnostics?: readonly FeaEditorDiagnostic[]
  placeholder?: string
  'aria-label'?: string
}

const baseTheme = EditorView.theme({
  '&': {
    fontSize: '12px',
    backgroundColor: 'transparent',
  },
  '.cm-content': {
    fontFamily: 'var(--kumiko-fonts-mono, ui-monospace, monospace)',
    caretColor: 'currentColor',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'inherit',
    opacity: 0.45,
  },
  '&.cm-focused': { outline: 'none' },
})

const toLintDiagnostics = (
  state: EditorState,
  diagnostics: readonly FeaEditorDiagnostic[]
) =>
  diagnostics.flatMap((diagnostic) => {
    if (diagnostic.line < 1 || diagnostic.line > state.doc.lines) {
      return []
    }
    const line = state.doc.line(diagnostic.line)
    return [
      {
        from: line.from,
        to: line.to,
        severity: diagnostic.severity,
        message: diagnostic.message,
      },
    ]
  })

// CodeMirror wrapper for `.fea` text: syntax highlighting, line numbers and
// per-line diagnostics. Controlled from the outside — external value changes
// replace the doc, local edits report up through onChange.
export function FeaCodeEditor({
  value,
  onChange,
  readOnly = false,
  minHeight = '360px',
  diagnostics = [],
  'aria-label': ariaLabel,
}: FeaCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const readOnlyCompartment = useRef(new Compartment())

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          feaLanguage,
          feaSyntaxHighlighting,
          lintGutter(),
          baseTheme,
          readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString())
            }
          }),
          EditorView.lineWrapping,
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The view is created once; value/readOnly sync incrementally below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // External value changes (undo from the store, switching selection) replace
  // the doc; edits typed here already match and are left alone.
  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly)
      ),
    })
  }, [readOnly])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }
    view.dispatch(
      setDiagnostics(view.state, toLintDiagnostics(view.state, diagnostics))
    )
  }, [diagnostics, value])

  return (
    <Box
      ref={containerRef}
      role="textbox"
      aria-label={ariaLabel}
      borderWidth="1px"
      borderRadius="md"
      overflow="auto"
      minH={minHeight}
      css={{ '& .cm-editor': { minHeight } }}
    />
  )
}
