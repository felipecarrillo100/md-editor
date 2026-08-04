import type { editor as MonacoEditorNS, IRange } from 'monaco-editor'

type CodeEditor = MonacoEditorNS.IStandaloneCodeEditor

function rangeOf(startLine: number, startCol: number, endLine: number, endCol: number): IRange {
  return { startLineNumber: startLine, startColumn: startCol, endLineNumber: endLine, endColumn: endCol }
}

/**
 * Toggle-aware wrap for symmetric markers (bold **, italic *, strikethrough ~~, inline code `).
 *
 * Fixes a real bug in the reference implementation this was adapted from: blindly wrapping the
 * selection every time meant clicking Italic on already-italicized text didn't toggle it off —
 * it silently double-wrapped (`*text*` -> `**text**`), which markdown renders as *bold*, changing
 * the meaning rather than being a harmless no-op. This checks both ways a marker can already be
 * present — inside the selection itself, or just outside its bounds — before deciding to wrap.
 */
export function toggleWrapSelection(editor: CodeEditor, marker: string): void {
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (!model || !selection) return

  const markerLen = marker.length
  const selectedText = model.getValueInRange(selection)

  // Case A: the selection includes the markers themselves (user selected "*hello*").
  if (selectedText.length >= markerLen * 2 && selectedText.startsWith(marker) && selectedText.endsWith(marker)) {
    const unwrapped = selectedText.slice(markerLen, selectedText.length - markerLen)
    editor.executeEdits('toggle-wrap-unwrap', [{ range: selection, text: unwrapped }])
    editor.setSelection(rangeOf(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn - markerLen * 2))
    return
  }

  // Case B: the markers sit just outside the selection (user selected "hello" inside "*hello*").
  const beforeRange = rangeOf(
    selection.startLineNumber,
    Math.max(1, selection.startColumn - markerLen),
    selection.startLineNumber,
    selection.startColumn,
  )
  const afterRange = rangeOf(
    selection.endLineNumber,
    selection.endColumn,
    selection.endLineNumber,
    selection.endColumn + markerLen,
  )
  const before = model.getValueInRange(beforeRange)
  const after = model.getValueInRange(afterRange)
  if (before === marker && after === marker) {
    const outerRange = rangeOf(
      selection.startLineNumber,
      selection.startColumn - markerLen,
      selection.endLineNumber,
      selection.endColumn + markerLen,
    )
    editor.executeEdits('toggle-wrap-unwrap', [{ range: outerRange, text: selectedText }])
    editor.setSelection(
      rangeOf(selection.startLineNumber, selection.startColumn - markerLen, selection.endLineNumber, selection.endColumn - markerLen),
    )
    return
  }

  // Not wrapped — wrap it. With no selection, the cursor lands between the markers.
  editor.executeEdits('toggle-wrap-wrap', [{ range: selection, text: `${marker}${selectedText}${marker}` }])
  if (selectedText.length === 0) {
    const cursorCol = selection.startColumn + markerLen
    editor.setSelection(rangeOf(selection.startLineNumber, cursorCol, selection.startLineNumber, cursorCol))
  } else {
    editor.setSelection(
      rangeOf(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn + markerLen * 2),
    )
  }
  editor.focus()
}

/** Toggles/replaces a Markdown heading prefix (#, ##, ###...) on the current line. Clicking the
 * level that's already applied reverts to a plain paragraph; clicking a different level replaces
 * the existing prefix instead of stacking a second one. */
export function toggleHeading(editor: CodeEditor, level: 1 | 2 | 3 | 4 | 5 | 6): void {
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (!model || !selection) return

  const lineNumber = selection.startLineNumber
  const lineText = model.getLineContent(lineNumber)
  const match = /^(#{1,6})\s+/.exec(lineText)
  const targetPrefix = `${'#'.repeat(level)} `

  const replaceRange = rangeOf(lineNumber, 1, lineNumber, (match?.[0].length ?? 0) + 1)
  const newPrefix = match && match[1].length === level ? '' : targetPrefix
  editor.executeEdits('toggle-heading', [{ range: replaceRange, text: newPrefix }])
  editor.focus()
}

/** Toggles a `> ` blockquote prefix across every line the selection spans. */
export function toggleBlockquote(editor: CodeEditor): void {
  applyLinePrefixToggle(editor, /^>\s?/, '> ')
}

/** Toggles a `- ` bulleted-list prefix across every non-empty line the selection spans. */
export function toggleBulletedList(editor: CodeEditor): void {
  applyLinePrefixToggle(editor, /^[-*]\s+/, '- ')
}

/** Toggles a numbered-list prefix (renumbered sequentially) across every non-empty line the
 * selection spans. Not a full renumbering engine — good enough for the common case of converting
 * a fresh block of lines, not for renumbering an existing, already-numbered list. */
export function toggleNumberedList(editor: CodeEditor): void {
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (!model || !selection) return

  const startLine = selection.startLineNumber
  const endLine = selection.endLineNumber
  const lines: string[] = []
  for (let line = startLine; line <= endLine; line++) lines.push(model.getLineContent(line))

  const alreadyNumbered = lines.every((line) => line.trim() === '' || /^\d+\.\s+/.test(line))
  let counter = 1
  const rewritten = lines.map((line) => {
    if (line.trim() === '') return line
    const withoutPrefix = line.replace(/^\d+\.\s+/, '').replace(/^[-*]\s+/, '')
    if (alreadyNumbered) return withoutPrefix
    return `${counter++}. ${withoutPrefix}`
  })

  const fullRange = rangeOf(startLine, 1, endLine, model.getLineMaxColumn(endLine))
  editor.executeEdits('toggle-numbered-list', [{ range: fullRange, text: rewritten.join('\n') }])
  editor.focus()
}

function applyLinePrefixToggle(editor: CodeEditor, prefixPattern: RegExp, prefix: string): void {
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (!model || !selection) return

  const startLine = selection.startLineNumber
  const endLine = selection.endLineNumber
  const lines: string[] = []
  for (let line = startLine; line <= endLine; line++) lines.push(model.getLineContent(line))

  const allPrefixed = lines.every((line) => line.trim() === '' || prefixPattern.test(line))
  const rewritten = lines.map((line) => {
    if (line.trim() === '') return line
    return allPrefixed ? line.replace(prefixPattern, '') : line.replace(prefixPattern, '').replace(/^/, prefix)
  })

  const fullRange = rangeOf(startLine, 1, endLine, model.getLineMaxColumn(endLine))
  editor.executeEdits('toggle-line-prefix', [{ range: fullRange, text: rewritten.join('\n') }])
  editor.focus()
}

/** Simple insertions — not toggle-aware, matching every commercial editor's behavior for these
 * (there's no sensible "undo" interpretation for inserting a table or a horizontal rule twice). */
export function insertLink(editor: CodeEditor): void {
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (!model || !selection) return
  const selectedText = model.getValueInRange(selection)
  const label = selectedText || 'link text'
  editor.executeEdits('insert-link', [{ range: selection, text: `[${label}](url)` }])
  editor.focus()
}

export function insertCodeBlock(editor: CodeEditor): void {
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (!model || !selection) return
  const selectedText = model.getValueInRange(selection)
  editor.executeEdits('insert-code-block', [{ range: selection, text: `\n\`\`\`\n${selectedText}\n\`\`\`\n` }])
  editor.focus()
}

export function insertTable(editor: CodeEditor): void {
  const selection = editor.getSelection()
  if (!selection) return
  const table = '\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| | | |\n'
  editor.executeEdits('insert-table', [{ range: selection, text: table }])
  editor.focus()
}

export function insertHorizontalRule(editor: CodeEditor): void {
  const selection = editor.getSelection()
  if (!selection) return
  editor.executeEdits('insert-hr', [{ range: selection, text: '\n---\n' }])
  editor.focus()
}
