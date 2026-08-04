import { useEffect, useMemo, useState, type DragEvent } from 'react'
import Box from '@mui/material/Box'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import {
  DockableDesktopProvider,
  WindowManager,
  Sidebar,
  SidePanelRenderer,
  ModalStackRenderer,
  useWindowManagerState,
  useMergedSidebarTabs,
  usePanelActions,
} from 'react-dockable-desktop'
import { workspace, clearPersistedLayout, WELCOME_MARKDOWN } from './workspace'
import { createAppTheme, ACCENT_COLOR } from './theme'
import { AppNavbar } from './components/AppNavbar'
import { AboutDialog } from './components/AboutDialog'
import { DropZoneOverlay } from './components/DropZoneOverlay'
import { CommandPalette } from './components/CommandPalette'
import { VersionHistoryDialog } from './components/VersionHistoryDialog'
import { createDocument, useAllDocuments, useDocument } from './documentStore'
import {
  openFilesFromDisk,
  readFilesAsDocuments,
  saveDocumentAsMarkdown,
  saveDocumentCopyAsMarkdown,
  exportDocumentAsHtml,
  exportDocumentAsPdf,
  type OpenedFile,
} from './fileIO'
import { buildShareUrl, DocumentTooLargeToShareError } from './shareLink'

type ThemeMode = 'light' | 'dark'

export default function App() {
  const [mode, setMode] = useState<ThemeMode>('dark')
  const theme = useMemo(() => createAppTheme(mode), [mode])

  useEffect(() => {
    document.documentElement.setAttribute('data-color-scheme', mode)
    document.documentElement.style.setProperty('--rdd-accent-color', ACCENT_COLOR)
    // Mirrors the exact same theme color the results list uses (warning.light/contrastText via
    // sx) onto the Monaco decoration in index.css — one color for "this is a match" everywhere,
    // read from the theme itself rather than a second hardcoded copy that could drift from it.
    document.documentElement.style.setProperty('--md-search-match-bg', theme.palette.warning.light)
    document.documentElement.style.setProperty('--md-search-match-color', theme.palette.warning.contrastText)
    document.documentElement.style.setProperty('--md-search-match-border', theme.palette.warning.dark)
  }, [mode, theme])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DockableDesktopProvider client={workspace}>
        <AppShell mode={mode} onToggleTheme={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))} />
      </DockableDesktopProvider>
    </ThemeProvider>
  )
}

interface AppShellProps {
  mode: ThemeMode
  onToggleTheme: () => void
}

interface FeedbackMessage {
  text: string
  severity: 'success' | 'error'
}

function AppShell({ mode, onToggleTheme }: AppShellProps) {
  const { activePanelId, panels } = useWindowManagerState()
  const activeDoc = useDocument(activePanelId ?? '')
  const allDocuments = useAllDocuments()
  // useAllDocuments() includes every document ever created, including ones whose panel was
  // closed without going through a normal close (e.g. the tab's browser session just ending) —
  // those never get pruned from the store, so they'd otherwise show up here as "Switch to: X"
  // entries with no actual panel left to switch to. Only list documents with a live panel.
  const openDocuments = useMemo(
    () => allDocuments.filter((doc) => doc.id in panels),
    [allDocuments, panels],
  )
  const { openModal } = usePanelActions()

  // No static tabs — Table of Contents / Search & Replace are contributed per-document by
  // MarkdownDocumentPanel itself; with no active document there's nothing meaningful to show for
  // either anyway, and this app always has at least the welcome document open by default.
  const sidebarTabs = useMergedSidebarTabs([])

  const [dragActive, setDragActive] = useState(false)
  const [historyDocId, setHistoryDocId] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function dockDocuments(files: OpenedFile[]): void {
    for (const file of files) {
      const id = createDocument(file.filename, file.content, file.fileHandle)
      workspace.openPanel(id, 'markdownDocument', { title: file.filename, initialTarget: 'docked' })
    }
  }

  function handleNew(): void {
    const id = createDocument('Untitled.md', '')
    workspace.openPanel(id, 'markdownDocument', { title: 'Untitled.md', initialTarget: 'docked' })
  }

  function handleShowWelcomeGuide(): void {
    const id = createDocument('Welcome.md', WELCOME_MARKDOWN)
    workspace.openPanel(id, 'markdownDocument', { title: 'Welcome.md', initialTarget: 'docked' })
  }

  function handleOpenAbout(): void {
    openModal(AboutDialog, {}, { title: 'About md-editor', size: 'medium' })
  }

  async function handleOpen(): Promise<void> {
    const files = await openFilesFromDisk()
    dockDocuments(files)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    setDragActive(true)
  }

  function handleDragLeave(): void {
    setDragActive(false)
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault()
    setDragActive(false)
    const files = await readFilesAsDocuments(event.dataTransfer.files)
    dockDocuments(files)
  }

  async function handleSaveMarkdown(): Promise<void> {
    if (!activeDoc) return
    await saveDocumentAsMarkdown(activeDoc)
    setFeedback({ text: 'Saved.', severity: 'success' })
  }

  function handleSaveMarkdownCopy(): void {
    if (!activeDoc) return
    saveDocumentCopyAsMarkdown(activeDoc)
  }

  async function handleExportHtml(): Promise<void> {
    if (!activeDoc) return
    await exportDocumentAsHtml(activeDoc, 'light')
  }

  async function handleExportPdf(): Promise<void> {
    if (!activeDoc) return
    await exportDocumentAsPdf(activeDoc)
  }

  async function handleShare(): Promise<void> {
    if (!activeDoc) return
    try {
      const url = buildShareUrl(activeDoc.filename, activeDoc.content)
      await navigator.clipboard.writeText(url)
      setFeedback({ text: 'Link copied to clipboard!', severity: 'success' })
    } catch (err) {
      const text = err instanceof DocumentTooLargeToShareError ? err.message : 'Could not create a share link.'
      setFeedback({ text, severity: 'error' })
    }
  }

  function handleClearLayout(): void {
    const confirmed = window.confirm(
      'Clear the saved window layout and reload?\n\nYour documents themselves are not deleted — only the remembered arrangement of open tabs is forgotten, and the welcome guide will show again.',
    )
    if (!confirmed) return
    clearPersistedLayout()
    window.location.reload()
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <AppNavbar
        mode={mode}
        onToggleTheme={onToggleTheme}
        onNew={handleNew}
        onOpen={() => void handleOpen()}
        onSaveMarkdown={() => void handleSaveMarkdown()}
        onSaveMarkdownCopy={handleSaveMarkdownCopy}
        onExportHtml={() => void handleExportHtml()}
        onExportPdf={() => void handleExportPdf()}
        onShare={() => void handleShare()}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onOpenAbout={handleOpenAbout}
        hasActiveDocument={Boolean(activeDoc)}
      />

      <Box
        sx={{ position: 'relative', flexGrow: 1, overflow: 'hidden' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(event) => void handleDrop(event)}
      >
        <Sidebar position="left" tabs={sidebarTabs}>
          <WindowManager skin="vscode" taskbarVisibility="always" />
        </Sidebar>
        <SidePanelRenderer />
        {dragActive && <DropZoneOverlay />}
      </Box>

      <ModalStackRenderer />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        documents={openDocuments}
        hasActiveDocument={Boolean(activeDoc)}
        onNew={handleNew}
        onOpen={() => void handleOpen()}
        onClearLayout={handleClearLayout}
        onShowWelcomeGuide={handleShowWelcomeGuide}
        onSaveMarkdown={() => void handleSaveMarkdown()}
        onExportHtml={() => void handleExportHtml()}
        onExportPdf={() => void handleExportPdf()}
        onShare={() => void handleShare()}
        onToggleTheme={onToggleTheme}
        onShowHistory={() => activeDoc && setHistoryDocId(activeDoc.id)}
        onSwitchTo={(id) => workspace.focusPanel(id)}
      />

      {historyDocId && (
        <VersionHistoryDialog open docId={historyDocId} onClose={() => setHistoryDocId(null)} />
      )}

      <Snackbar
        open={Boolean(feedback)}
        autoHideDuration={4000}
        onClose={() => setFeedback(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {feedback ? (
          <Alert severity={feedback.severity} onClose={() => setFeedback(null)} variant="filled">
            {feedback.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}
