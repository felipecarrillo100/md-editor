import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import Editor from '@monaco-editor/react'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import {
  usePanelId,
  useFormContainer,
  useColorScheme,
  usePanelContribution,
  PanelOverlayRoot,
  PanelToolbar,
  ToolbarButton,
  ToolbarToggle,
  PanelToolbarSeparator,
  ToolbarSpacer,
  startPointerDrag,
  type PanelSidebarSection,
} from 'react-dockable-desktop'
import { useDocument, updateContent } from '../documentStore'
import { MarkdownContent } from './MarkdownContent'
import { getPreviewThemeCss, getPreviewBackground } from '../styles/previewTheme'
import { VersionHistoryDialog } from './VersionHistoryDialog'
import { TocList, type HeadingInfo } from './TocSection'
import { SearchReplaceSection } from './SearchReplaceSection'
import {
  getTaggedElements,
  getEditorTopFractionalLine,
  computePreviewScrollTopForLine,
  getLineForPreviewOffset,
  computeEditorScrollTopForLine,
  type TaggedElement,
} from './scrollSync'
import {
  toggleWrapSelection,
  toggleHeading,
  toggleBlockquote,
  toggleBulletedList,
  toggleNumberedList,
  insertLink,
  insertCodeBlock,
  insertTable,
  insertHorizontalRule,
} from './markdownFormatting'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough'
import CodeIcon from '@mui/icons-material/Code'
import InsertLinkIcon from '@mui/icons-material/InsertLink'
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import TableChartIcon from '@mui/icons-material/TableChart'
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ArticleIcon from '@mui/icons-material/Article'
import CheckIcon from '@mui/icons-material/Check'
import HistoryIcon from '@mui/icons-material/History'
import EditIcon from '@mui/icons-material/Edit'
import VerticalSplitIcon from '@mui/icons-material/VerticalSplit'
import PreviewIcon from '@mui/icons-material/Preview'
import WrapTextIcon from '@mui/icons-material/WrapText'
import TocIcon from '@mui/icons-material/Toc'
import FindReplaceIcon from '@mui/icons-material/FindReplace'

type ViewMode = 'edit' | 'split' | 'preview'
const TOOLBAR_HEIGHT = 44
// Matches PanelToolbar's recommended 16x16 icon sizing.
const ICON_SX = { fontSize: 16 }

// Small, serializable view-state — never the document's filename/content, which stay in
// documentStore (keyed by panelId) since they're content-sized and change on every keystroke.
// Bundling those into openPanel's props would recouple layout-save cadence with content-save
// cadence, which is exactly what that external store was built to avoid.
export interface MarkdownDocumentPanelProps {
  viewMode?: ViewMode
  wrapLines?: boolean
  splitRatio?: number
}

export function MarkdownDocumentPanel({
  viewMode: initialViewMode,
  wrapLines: initialWrapLines,
  splitRatio: initialSplitRatio,
}: MarkdownDocumentPanelProps = {}) {
  const panelId = usePanelId()
  const doc = useDocument(panelId)
  const container = useFormContainer()
  const scheme = useColorScheme()
  const mermaidTheme = scheme === 'dark' ? 'dark' : 'default'
  const abcScheme = scheme === 'dark' ? 'dark' : 'light'

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode ?? 'split')
  const [wrapLines, setWrapLines] = useState(initialWrapLines ?? true)
  const [splitRatio, setSplitRatio] = useState(initialSplitRatio ?? 0.5)
  const [copiedFlag, setCopiedFlag] = useState<'source' | 'rendered' | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Reports this panel's current view-state to react-dockable-desktop's saveLayout(), pulled
  // fresh on every save — this is exactly the "state accumulated after opening that static props
  // alone can't capture" case registerStateProvider exists for. A ref keeps the callback (which
  // is only registered once) always reading the latest values rather than a stale closure.
  const viewStateRef = useRef<MarkdownDocumentPanelProps>({ viewMode, wrapLines, splitRatio })
  useEffect(() => {
    viewStateRef.current = { viewMode, wrapLines, splitRatio }
  }, [viewMode, wrapLines, splitRatio])

  useEffect(() => {
    return container.registerStateProvider?.(() => viewStateRef.current)
  }, [container])

  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Editor<->preview scroll-sync — ported from react-dockable-desktop's own reference demo.
  // taggedElementsRef caches data-source-line positions rebuilt whenever content/view changes;
  // the four expected*/*.SyncFrameRef refs are the echo-guard/RAF-coalescing that stops each
  // side's own sync-driven scroll from re-triggering the other side in an infinite loop.
  const taggedElementsRef = useRef<TaggedElement[]>([])
  const expectedEditorScrollTopRef = useRef<number | null>(null)
  const expectedPreviewScrollTopRef = useRef<number | null>(null)
  const previewSyncFrameRef = useRef<number | null>(null)
  const editorSyncFrameRef = useRef<number | null>(null)
  const [headings, setHeadings] = useState<HeadingInfo[]>([])

  const previewCss = useMemo(() => getPreviewThemeCss(scheme === 'dark' ? 'dark' : 'light'), [scheme])

  useEffect(() => {
    if (!doc) return
    container.setDirty(doc.dirty)
    container.setTitle(doc.dirty ? `${doc.filename} •` : doc.filename)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- container methods are stable per instance
  }, [doc?.dirty, doc?.filename])

  useEffect(() => () => clearTimeout(copiedTimerRef.current), [])

  // Re-scan the rendered preview for headings whenever the source changes (or the preview comes
  // back into view after "Edit only" mode) — reads the real DOM ids rehype-slug already
  // assigned, rather than re-deriving our own slugs, so Table of Contents links always resolve to
  // the right element in THIS instance. Piggybacks the scroll-sync tagged-element cache rebuild
  // in the same effect, same timing, as the reference this was ported from.
  useEffect(() => {
    const previewEl = previewRef.current
    if (!previewEl) return
    const els = previewEl.querySelectorAll('h1, h2, h3, h4, h5, h6')
    setHeadings(
      Array.from(els)
        // Excludes the visually-hidden "Footnotes" section label GFM footnotes inject
        // (<h2 class="sr-only" id="footnote-label">) — a real heading for screen readers, but
        // not something a sighted ToC click should be able to "jump" to.
        .filter((el) => !el.classList.contains('sr-only'))
        .map((el) => ({
          level: Number(el.tagName[1]),
          text: el.textContent || '',
          id: el.id,
        })),
    )
    taggedElementsRef.current = getTaggedElements(previewEl)
  }, [doc?.content, viewMode])

  function flashCopied(which: 'source' | 'rendered') {
    setCopiedFlag(which)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedFlag(null), 1500)
  }

  function scrollToHeading(id: string) {
    previewRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // The editor follows automatically via the preview's own onScroll sync handler below —
    // exactly how the reference demo this was ported from behaves; no separate editor-jump
    // logic needed once scroll-sync exists.
  }

  function getEditor() {
    return editorRef.current
  }

  function handleEditorMount(editorInstance: MonacoEditorNS.IStandaloneCodeEditor) {
    editorRef.current = editorInstance

    editorInstance.onDidScrollChange(() => {
      const current = editorInstance.getScrollTop()
      const expected = expectedEditorScrollTopRef.current
      expectedEditorScrollTopRef.current = null
      if (expected !== null && Math.abs(current - expected) < 2) return // our own echo
      if (editorSyncFrameRef.current != null) {
        cancelAnimationFrame(editorSyncFrameRef.current)
        editorSyncFrameRef.current = null
      }
      if (previewSyncFrameRef.current != null) return // a sync is already queued for this frame
      previewSyncFrameRef.current = requestAnimationFrame(() => {
        previewSyncFrameRef.current = null
        const previewEl = previewRef.current
        if (!previewEl) return
        const targetLine = getEditorTopFractionalLine(editorInstance)
        const targetTop = computePreviewScrollTopForLine(previewEl, taggedElementsRef.current, targetLine)
        if (targetTop == null) return
        expectedPreviewScrollTopRef.current = targetTop
        previewEl.scrollTop = targetTop
      })
    })
  }

  function handlePreviewScroll() {
    const previewEl = previewRef.current
    if (!previewEl) return
    const current = previewEl.scrollTop
    const expected = expectedPreviewScrollTopRef.current
    expectedPreviewScrollTopRef.current = null
    if (expected !== null && Math.abs(current - expected) < 2) return // our own echo
    if (previewSyncFrameRef.current != null) {
      cancelAnimationFrame(previewSyncFrameRef.current)
      previewSyncFrameRef.current = null
    }
    if (editorSyncFrameRef.current != null) return // a sync is already queued for this frame
    editorSyncFrameRef.current = requestAnimationFrame(() => {
      editorSyncFrameRef.current = null
      const previewElNow = previewRef.current
      const editorInstance = editorRef.current
      if (!previewElNow || !editorInstance) return
      const targetLine = getLineForPreviewOffset(previewElNow, taggedElementsRef.current, previewElNow.scrollTop)
      const targetTop = targetLine == null ? null : computeEditorScrollTopForLine(editorInstance, targetLine)
      if (targetTop == null) return
      expectedEditorScrollTopRef.current = targetTop
      editorInstance.setScrollTop(targetTop)
    })
  }

  const sidebarSections = useMemo<PanelSidebarSection[]>(
    () => [
      { id: 'toc', label: 'Table of Contents', icon: <TocIcon fontSize="small" />, content: <TocList headings={headings} onSelect={scrollToHeading} /> },
      {
        id: 'search',
        label: 'Search & Replace',
        icon: <FindReplaceIcon fontSize="small" />,
        content: <SearchReplaceSection getEditor={getEditor} content={doc?.content ?? ''} />,
      },
    ],
    [headings, doc?.content],
  )

  // usePanelContribution's own effect is keyed on this argument by reference — passing a fresh
  // object literal here (even though sidebarSections itself is already memoized) would re-publish
  // the contribution on every render, for any reason at all, notifying every subscriber
  // (useMergedSidebarTabs in App.tsx) and forcing them to re-render every single time — a tight,
  // self-perpetuating loop with no new information ever entering it. The reference demo this was
  // ported from wraps this exact call in its own useMemo for the same reason; missing that here
  // was the actual bug behind the "Maximum update depth exceeded" crash.
  const contribution = useMemo(() => ({ sidebarSections }), [sidebarSections])
  usePanelContribution(contribution)

  function withEditor(action: (editor: MonacoEditorNS.IStandaloneCodeEditor) => void) {
    return () => {
      if (editorRef.current) action(editorRef.current)
    }
  }

  function handleDividerPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const bar = event.currentTarget
    const startClientX = event.clientX
    const startRatio = splitRatio
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    startPointerDrag({
      element: bar,
      pointerId: event.pointerId,
      startClientX,
      startClientY: event.clientY,
      captureStart: () => startRatio,
      activeClasses: [{ el: bar, classes: ['md-editor-divider-active'] }],
      onMove: (dx) => {
        const rect = splitContainerRef.current?.getBoundingClientRect()
        if (!rect) return
        const next = (startClientX + dx - rect.left) / rect.width
        setSplitRatio(Math.min(0.85, Math.max(0.15, next)))
      },
      onEnd: () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      },
    })
  }

  async function copySource() {
    if (!doc) return
    await navigator.clipboard.writeText(doc.content)
    flashCopied('source')
  }

  async function copyRendered() {
    if (!previewRef.current) return
    const html = previewRef.current.innerHTML
    const text = previewRef.current.innerText
    try {
      if (typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(text)
      }
      flashCopied('rendered')
    } catch {
      try {
        await navigator.clipboard.writeText(text)
        flashCopied('rendered')
      } catch {
        // Clipboard access denied — nothing more we can do here.
      }
    }
  }

  if (!doc) {
    return <div style={{ padding: 16 }}>Loading…</div>
  }

  const showEditor = viewMode !== 'preview'
  const showPreview = viewMode !== 'edit'

  return (
    <PanelOverlayRoot style={{ width: '100%', height: '100%', position: 'relative' }}>
      <PanelToolbar position="top" variant="solid">
        <ToolbarButton icon={<FormatBoldIcon sx={ICON_SX} />} title="Bold" onClick={withEditor((e) => toggleWrapSelection(e, '**'))} />
        <ToolbarButton icon={<FormatItalicIcon sx={ICON_SX} />} title="Italic" onClick={withEditor((e) => toggleWrapSelection(e, '*'))} />
        <ToolbarButton icon={<FormatStrikethroughIcon sx={ICON_SX} />} title="Strikethrough" onClick={withEditor((e) => toggleWrapSelection(e, '~~'))} />
        <ToolbarButton icon={<CodeIcon sx={ICON_SX} />} title="Inline code" onClick={withEditor((e) => toggleWrapSelection(e, '`'))} />
        <PanelToolbarSeparator />
        <ToolbarButton icon="H1" title="Heading 1" onClick={withEditor((e) => toggleHeading(e, 1))} />
        <ToolbarButton icon="H2" title="Heading 2" onClick={withEditor((e) => toggleHeading(e, 2))} />
        <ToolbarButton icon="H3" title="Heading 3" onClick={withEditor((e) => toggleHeading(e, 3))} />
        <PanelToolbarSeparator />
        <ToolbarButton icon={<InsertLinkIcon sx={ICON_SX} />} title="Link" onClick={withEditor(insertLink)} />
        <ToolbarButton icon={<FormatQuoteIcon sx={ICON_SX} />} title="Blockquote" onClick={withEditor(toggleBlockquote)} />
        <ToolbarButton icon={<CodeIcon sx={ICON_SX} />} title="Code block" onClick={withEditor(insertCodeBlock)} />
        <ToolbarButton icon={<FormatListBulletedIcon sx={ICON_SX} />} title="Bulleted list" onClick={withEditor(toggleBulletedList)} />
        <ToolbarButton icon={<FormatListNumberedIcon sx={ICON_SX} />} title="Numbered list" onClick={withEditor(toggleNumberedList)} />
        <ToolbarButton icon={<TableChartIcon sx={ICON_SX} />} title="Table" onClick={withEditor(insertTable)} />
        <ToolbarButton icon={<HorizontalRuleIcon sx={ICON_SX} />} title="Horizontal rule" onClick={withEditor(insertHorizontalRule)} />

        <ToolbarSpacer />

        <ToolbarButton
          icon={copiedFlag === 'source' ? <CheckIcon sx={ICON_SX} /> : <ContentCopyIcon sx={ICON_SX} />}
          title="Copy source"
          onClick={() => void copySource()}
        />
        <ToolbarButton
          icon={copiedFlag === 'rendered' ? <CheckIcon sx={ICON_SX} /> : <ArticleIcon sx={ICON_SX} />}
          title="Copy rendered"
          onClick={() => void copyRendered()}
        />
        <ToolbarButton icon={<HistoryIcon sx={ICON_SX} />} title="Version history" onClick={() => setHistoryOpen(true)} />
        <PanelToolbarSeparator />
        <ToolbarToggle icon={<EditIcon sx={ICON_SX} />} active={viewMode === 'edit'} title="Edit only" onToggle={() => setViewMode('edit')} />
        <ToolbarToggle icon={<VerticalSplitIcon sx={ICON_SX} />} active={viewMode === 'split'} title="Split view" onToggle={() => setViewMode('split')} />
        <ToolbarToggle icon={<PreviewIcon sx={ICON_SX} />} active={viewMode === 'preview'} title="Preview only" onToggle={() => setViewMode('preview')} />
        <ToolbarToggle icon={<WrapTextIcon sx={ICON_SX} />} active={wrapLines} title="Wrap lines" onToggle={() => setWrapLines((w) => !w)} />
      </PanelToolbar>

      <div
        ref={splitContainerRef}
        style={{ position: 'absolute', inset: 0, paddingTop: TOOLBAR_HEIGHT, display: 'flex', overflow: 'hidden' }}
      >
        {showEditor && (
          <div style={{ width: viewMode === 'split' ? `${splitRatio * 100}%` : '100%', height: '100%' }}>
            <Editor
              height="100%"
              defaultLanguage="markdown"
              theme={scheme === 'dark' ? 'vs-dark' : 'light'}
              value={doc.content}
              onChange={(value) => updateContent(panelId, value ?? '')}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: wrapLines ? 'on' : 'off',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        )}

        {viewMode === 'split' && <div className="md-editor-divider" onPointerDown={handleDividerPointerDown} />}

        {showPreview && (
          <div
            ref={previewRef}
            onScroll={handlePreviewScroll}
            style={{
              width: viewMode === 'split' ? `${(1 - splitRatio) * 100}%` : '100%',
              height: '100%',
              overflow: 'auto',
              overscrollBehavior: 'contain',
              padding: '0 1.5rem',
              backgroundColor: getPreviewBackground(scheme === 'dark' ? 'dark' : 'light'),
            }}
          >
            <style>{previewCss}</style>
            <MarkdownContent
              source={doc.content}
              mermaidTheme={mermaidTheme}
              abcScheme={abcScheme}
              tagSourceLines
            />
          </div>
        )}
      </div>

      <VersionHistoryDialog open={historyOpen} docId={panelId} onClose={() => setHistoryOpen(false)} />
    </PanelOverlayRoot>
  )
}
