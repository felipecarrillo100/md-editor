import { useMemo } from 'react'
import Dialog from '@mui/material/Dialog'
import Box from '@mui/material/Box'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import type { MarkdownDocument } from '../documentStore'

interface CommandOption {
  id: string
  label: string
  group: string
  run: () => void
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  documents: MarkdownDocument[]
  hasActiveDocument: boolean
  onNew: () => void
  onOpen: () => void
  onClearLayout: () => void
  onShowWelcomeGuide: () => void
  onSaveMarkdown: () => void
  onExportHtml: () => void
  onExportPdf: () => void
  onShare: () => void
  onToggleTheme: () => void
  onShowHistory: () => void
  onSwitchTo: (id: string) => void
}

/** App-level quick-action launcher. Open state is controlled by the parent so both a global
 * Cmd/Ctrl+K shortcut and a navbar button can toggle the same instance. */
export function CommandPalette({
  open,
  onClose,
  documents,
  hasActiveDocument,
  onNew,
  onOpen,
  onClearLayout,
  onShowWelcomeGuide,
  onSaveMarkdown,
  onExportHtml,
  onExportPdf,
  onShare,
  onToggleTheme,
  onShowHistory,
  onSwitchTo,
}: CommandPaletteProps) {
  const options = useMemo<CommandOption[]>(() => {
    const actions: CommandOption[] = [
      { id: 'new', label: 'New document', group: 'Actions', run: onNew },
      { id: 'open', label: 'Open from file…', group: 'Actions', run: onOpen },
      { id: 'toggle-theme', label: 'Toggle light/dark theme', group: 'Actions', run: onToggleTheme },
      { id: 'clear-layout', label: 'Clear saved layout and reload…', group: 'Actions', run: onClearLayout },
      { id: 'show-welcome', label: 'Show welcome guide…', group: 'Actions', run: onShowWelcomeGuide },
    ]
    if (hasActiveDocument) {
      actions.push(
        { id: 'save', label: 'Save as .md', group: 'Active document', run: onSaveMarkdown },
        { id: 'export-html', label: 'Export as HTML', group: 'Active document', run: onExportHtml },
        { id: 'export-pdf', label: 'Export as PDF', group: 'Active document', run: onExportPdf },
        { id: 'share', label: 'Share link', group: 'Active document', run: onShare },
        { id: 'history', label: 'Show version history', group: 'Active document', run: onShowHistory },
      )
    }
    const switchers: CommandOption[] = documents.map((doc) => ({
      id: `switch-${doc.id}`,
      label: `Switch to: ${doc.filename}`,
      group: 'Documents',
      run: () => onSwitchTo(doc.id),
    }))
    return [...actions, ...switchers]
  }, [
    documents,
    hasActiveDocument,
    onNew,
    onOpen,
    onClearLayout,
    onShowWelcomeGuide,
    onToggleTheme,
    onSaveMarkdown,
    onExportHtml,
    onExportPdf,
    onShare,
    onShowHistory,
    onSwitchTo,
  ])

  function runAndClose(option: CommandOption | null) {
    if (!option) return
    option.run()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
      slotProps={{
        // A quick-access launcher, not a modal you need pulled out of your workspace to use —
        // VS Code's own Quick Access barely dims the editor behind it. A near-transparent
        // backdrop (rather than MUI's default heavy scrim) keeps that "still in your workspace"
        // feel instead of reading as a blocking dialog.
        backdrop: { sx: { backgroundColor: 'rgba(0, 0, 0, 0.15)' } },
        paper: {
          sx: {
            marginTop: '10vh',
            borderRadius: '10px',
            border: '1px solid',
            borderColor: 'divider',
            // Border-forward, not shadow-forward — a defined edge does most of the work here,
            // the same way VS Code's widget reads mainly via its outline against the editor
            // behind it, with only a light shadow as secondary support.
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          },
        },
      }}
    >
      <Box sx={{ p: 0.75 }}>
        <Autocomplete
          autoHighlight
          openOnFocus
          size="small"
          options={options}
          groupBy={(option) => option.group}
          getOptionLabel={(option) => option.label}
          onChange={(_event, value) => runAndClose(value)}
          renderInput={(params) => (
            <TextField {...params} autoFocus placeholder="Type a command…" variant="outlined" />
          )}
        />
      </Box>
    </Dialog>
  )
}
