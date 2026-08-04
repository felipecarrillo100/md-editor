import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import ToggleButton from '@mui/material/ToggleButton'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import FindReplaceIcon from '@mui/icons-material/FindReplace'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'

// Monaco's own well-known default word-separator punctuation set — used only when "whole word"
// is enabled; the other branch passes `null`, disabling word-boundary restriction entirely.
const WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?'

// How much of the surrounding line to keep on each side of a match when building the
// expandable results list's preview snippet.
const SNIPPET_CONTEXT_CHARS = 30

// Defensive-only ceiling on how many rows the expandable match list renders — a markdown
// document's realistic match counts never get close to this; it just guards against a
// pathological one-character query on an unusually large file.
const MAX_LIST_ROWS = 300

type MonacoModel = NonNullable<ReturnType<MonacoEditorNS.IStandaloneCodeEditor['getModel']>>
type FindMatch = ReturnType<MonacoModel['findMatches']>[number]
type DecorationsCollection = ReturnType<MonacoEditorNS.IStandaloneCodeEditor['createDecorationsCollection']>

interface MatchRow {
  range: FindMatch['range']
  lineNumber: number
  before: string
  matchText: string
  after: string
}

export interface SearchReplaceSectionProps {
  getEditor: () => MonacoEditorNS.IStandaloneCodeEditor | null
  /** The active document's current content — recomputes matches as it changes. */
  content: string
}

/** Contributed to the app Sidebar's "Search & Replace" tab per-document — see
 * MarkdownDocumentPanel's usePanelContribution call. Monaco's own Ctrl+F/Ctrl+H already work
 * today; this is the discoverable, sidebar-hosted equivalent, not a replacement for it. */
export function SearchReplaceSection({ getEditor, content }: SearchReplaceSectionProps) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  // Explicit mode switch rather than inferring Find-vs-Replace from whether the Replace field
  // has text — inference makes "replace every match with nothing" inexpressible, since an empty
  // Replace field would look identical to "not replacing." Stating the mode outright removes the
  // ambiguity, and lets the Replace field's emptiness mean exactly what it says.
  const [replaceMode, setReplaceMode] = useState(false)
  const [listExpanded, setListExpanded] = useState(false)

  // Lazily created once per editor instance and reused via .set() on every reveal — a fresh
  // collection per call would leave the previous match's highlight stuck since nothing would
  // ever clear it.
  const currentMatchDecorationsRef = useRef<DecorationsCollection | null>(null)

  const wordSeparators = wholeWord ? WORD_SEPARATORS : null

  const matches = useMemo<MatchRow[]>(() => {
    if (!query) return []
    const model = getEditor()?.getModel()
    if (!model) return []
    return model.findMatches(query, false, false, matchCase, wordSeparators, false).map((match) => {
      const { range } = match
      const lineContent = model.getLineContent(range.startLineNumber)
      const matchStart = range.startColumn - 1
      const matchEnd = range.endColumn - 1
      const windowStart = Math.max(0, matchStart - SNIPPET_CONTEXT_CHARS)
      const windowEnd = Math.min(lineContent.length, matchEnd + SNIPPET_CONTEXT_CHARS)
      const before = (windowStart > 0 ? '…' : '') + lineContent.slice(windowStart, matchStart)
      const matchText = lineContent.slice(matchStart, matchEnd)
      const after = lineContent.slice(matchEnd, windowEnd) + (windowEnd < lineContent.length ? '…' : '')
      return { range, lineNumber: range.startLineNumber, before, matchText, after }
    })
    // getEditor is a stable-enough derived value; content is the real trigger for "the document
    // changed, matches (and their snippets) may have too."
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matchCase, wholeWord, content])

  const totalMatches = matches.length
  const hasMatches = totalMatches > 0
  const visibleMatches = matches.slice(0, MAX_LIST_ROWS)
  const hiddenCount = totalMatches - visibleMatches.length

  function revealMatch(range: MatchRow['range']) {
    const editor = getEditor()
    if (!editor) return
    editor.setSelection(range)
    editor.revealRangeInCenterIfOutsideViewport(range)
    // Selection alone is too low-contrast to reliably read as "look here" — it's a translucent
    // tint meant for ordinary text selection, not a call-out, and disappears against some
    // syntax-highlighted token colors. A decoration painted on top, styled the same as the
    // matched-text highlight in the results list below, fixes the contrast and reads as one
    // consistent "this is a match" color across both places.
    if (!currentMatchDecorationsRef.current) {
      currentMatchDecorationsRef.current = editor.createDecorationsCollection([])
    }
    currentMatchDecorationsRef.current.set([{ range, options: { inlineClassName: 'md-search-current-match' } }])
  }

  // Auto-jump as you type, the same way VS Code's and the browser's own Find do — otherwise
  // there's nothing on screen confirming a match exists until you deliberately press Enter or an
  // arrow, which isn't how find boxes are expected to behave. Searches forward from the current
  // cursor/selection (wrapping to the top if nothing matches after it, Monaco's own default), so
  // it lands on the nearest match — the first one, when the cursor is still at the document start.
  useEffect(() => {
    const editor = getEditor()
    if (!query || !editor) {
      currentMatchDecorationsRef.current?.clear()
      return
    }
    const model = editor.getModel()
    if (!model) return
    const from = editor.getSelection()?.getStartPosition() ?? { lineNumber: 1, column: 1 }
    const match = model.findNextMatch(query, from, false, matchCase, wordSeparators, false)
    if (match) revealMatch(match.range)
    else currentMatchDecorationsRef.current?.clear()
    // getEditor/wordSeparators/revealMatch are stable-enough derived values for this effect's
    // purpose; query/matchCase/wholeWord are what should actually re-trigger the jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matchCase, wholeWord])

  useEffect(() => {
    return () => currentMatchDecorationsRef.current?.clear()
  }, [])

  // Deliberately never call editor.focus() from these — VS Code, IntelliJ, and Word's
  // Find/Replace all keep focus in the search field itself, precisely so pressing Enter
  // repeatedly cycles through matches instead of landing a keystroke in the document.
  function findNext() {
    const editor = getEditor()
    const model = editor?.getModel()
    if (!editor || !model || !query) return
    const from = editor.getSelection()?.getEndPosition() ?? { lineNumber: 1, column: 1 }
    const match = model.findNextMatch(query, from, false, matchCase, wordSeparators, false)
    if (match) revealMatch(match.range)
  }

  function findPrevious() {
    const editor = getEditor()
    const model = editor?.getModel()
    if (!editor || !model || !query) return
    const from = editor.getSelection()?.getStartPosition() ?? { lineNumber: 1, column: 1 }
    const match = model.findPreviousMatch(query, from, false, matchCase, wordSeparators, false)
    if (match) revealMatch(match.range)
  }

  function replaceOne() {
    const editor = getEditor()
    const model = editor?.getModel()
    const selection = editor?.getSelection()
    if (!editor || !model || !selection || !query) return
    // Only replace if the current selection actually is a match for the query — guards against
    // replacing arbitrary selected text if the user clicked elsewhere in the editor in between.
    const selectedText = model.getValueInRange(selection)
    const isCurrentMatch = matchCase
      ? selectedText === query
      : selectedText.toLowerCase() === query.toLowerCase()
    if (isCurrentMatch) {
      editor.executeEdits('search-replace', [{ range: selection, text: replacement }])
    }
    findNext()
  }

  function replaceAll() {
    const editor = getEditor()
    if (!editor || !query || matches.length === 0) return
    // One executeEdits call for the whole batch — Monaco applies a non-overlapping edit list
    // correctly in one pass, giving one single undo step rather than N.
    editor.executeEdits('search-replace-all', matches.map((m) => ({ range: m.range, text: replacement })))
  }

  function handleQueryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) findPrevious()
      else findNext()
    }
  }

  function toggleList() {
    if (!hasMatches) return
    setListExpanded((v) => !v)
  }

  function handleToggleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (hasMatches && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      toggleList()
    }
  }

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField
        size="small"
        placeholder="Find"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleQueryKeyDown}
        autoFocus
      />

      {replaceMode && (
        <TextField
          size="small"
          placeholder="Replace"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
        />
      )}

      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <Tooltip title="Match case">
          <ToggleButton size="small" value="case" selected={matchCase} onChange={() => setMatchCase((v) => !v)}>
            Aa
          </ToggleButton>
        </Tooltip>
        <Tooltip title="Whole word">
          <ToggleButton size="small" value="word" selected={wholeWord} onChange={() => setWholeWord((v) => !v)}>
            W
          </ToggleButton>
        </Tooltip>
        <FormControlLabel
          sx={{ ml: 'auto', mr: 0 }}
          control={
            <Switch size="small" checked={replaceMode} onChange={(e) => setReplaceMode(e.target.checked)} />
          }
          label={<Typography variant="caption">Replace</Typography>}
        />
      </Box>

      <Box
        role="button"
        tabIndex={hasMatches ? 0 : -1}
        onClick={toggleList}
        onKeyDown={handleToggleListKeyDown}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          minHeight: 24,
          cursor: hasMatches ? 'pointer' : 'default',
          color: hasMatches ? 'text.primary' : 'text.secondary',
          userSelect: 'none',
        }}
      >
        {hasMatches ? (
          listExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />
        ) : (
          <Box sx={{ width: 20 }} />
        )}
        <Typography variant="caption">
          {query ? `${totalMatches} match${totalMatches === 1 ? '' : 'es'}` : ''}
        </Typography>
      </Box>

      {listExpanded && hasMatches && (
        <Box
          sx={{
            maxHeight: 220,
            overflowY: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          {visibleMatches.map((m, i) => (
            <Box
              key={i}
              role="button"
              tabIndex={0}
              onClick={() => revealMatch(m.range)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  revealMatch(m.range)
                }
              }}
              sx={{
                px: 1,
                py: 0.5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Typography
                component="span"
                variant="caption"
                sx={{ color: 'text.secondary', mr: 0.75, fontFamily: 'monospace' }}
              >
                {m.lineNumber}
              </Typography>
              <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace' }}>
                {m.before}
              </Typography>
              <Typography
                component="span"
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  bgcolor: 'warning.light',
                  color: 'warning.contrastText',
                }}
              >
                {m.matchText}
              </Typography>
              <Typography component="span" variant="caption" sx={{ fontFamily: 'monospace' }}>
                {m.after}
              </Typography>
            </Box>
          ))}
          {hiddenCount > 0 && (
            <Typography variant="caption" sx={{ display: 'block', px: 1, py: 0.5, color: 'text.secondary' }}>
              +{hiddenCount} more not shown
            </Typography>
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Tooltip title="Find previous (Shift+Enter)">
          <IconButton size="small" onClick={findPrevious} disabled={!hasMatches}>
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Find next (Enter)">
          <IconButton size="small" onClick={findNext} disabled={!hasMatches}>
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {replaceMode && (
          <>
            <Box sx={{ flexGrow: 1 }} />
            <Tooltip title="Replace">
              <IconButton size="small" onClick={replaceOne} disabled={!hasMatches}>
                <FindReplaceIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      {replaceMode && (
        <Button size="small" variant="outlined" onClick={replaceAll} disabled={!hasMatches}>
          Replace All
        </Button>
      )}
    </Box>
  )
}
