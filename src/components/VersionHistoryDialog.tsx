import { useMemo, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { DiffEditor } from '@monaco-editor/react'
import { useColorScheme } from 'react-dockable-desktop'
import { readHistory, updateContent, useDocument, type HistorySnapshot } from '../documentStore'

export interface VersionHistoryDialogProps {
  open: boolean
  docId: string
  onClose: () => void
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function VersionHistoryDialog({ open, docId, onClose }: VersionHistoryDialogProps) {
  const doc = useDocument(docId)
  const scheme = useColorScheme()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [confirmingRestore, setConfirmingRestore] = useState(false)

  // Re-read on every open rather than subscribing — history snapshots are write-once/append-only
  // and only change as a side effect of edits this same dialog isn't making.
  const history: HistorySnapshot[] = useMemo(() => (open ? readHistory(docId) : []), [open, docId])
  const selected = history[selectedIndex]

  function handleRestore() {
    if (!selected) return
    updateContent(docId, selected.content)
    setConfirmingRestore(false)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Version history — {doc?.filename}</DialogTitle>
      <DialogContent sx={{ display: 'flex', gap: 2, height: '60vh', p: 0 }}>
        <Box sx={{ width: 240, borderRight: 1, borderColor: 'divider', overflow: 'auto' }}>
          {history.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No snapshots yet — keep editing and they'll appear here.
            </Typography>
          ) : (
            <List dense>
              {history.map((snapshot, index) => (
                <ListItemButton
                  key={snapshot.timestamp}
                  selected={index === selectedIndex}
                  onClick={() => setSelectedIndex(index)}
                >
                  <ListItemText
                    primary={formatRelativeTime(snapshot.timestamp)}
                    secondary={new Date(snapshot.timestamp).toLocaleString()}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {selected && (
            <DiffEditor
              height="100%"
              language="markdown"
              theme={scheme === 'dark' ? 'vs-dark' : 'light'}
              original={selected.content}
              modified={doc?.content ?? ''}
              options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false } }}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        {confirmingRestore ? (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto', ml: 2 }}>
              Replace the current content with this version?
            </Typography>
            <Button onClick={() => setConfirmingRestore(false)}>Cancel</Button>
            <Button onClick={handleRestore} color="warning" variant="contained">
              Restore
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button onClick={() => setConfirmingRestore(true)} disabled={!selected} variant="contained">
              Restore this version
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
