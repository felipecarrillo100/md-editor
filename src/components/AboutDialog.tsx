import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'

const FEATURES = [
  'Live markdown preview, side-by-side with the source',
  'Multiple documents at once, in a dockable, tabbed workspace',
  'Export to .md, a self-contained .html file, or a real, selectable-text PDF',
  'Share a document as a link — the content lives in the URL, nothing is uploaded',
  'Autosave with version history',
  'A sidebar with a per-document Table of Contents and Search & Replace, kept in sync with the editor',
  'A VS Code–style command palette (Cmd/Ctrl+K)',
]

/** Content for the "About" modal, opened via react-dockable-desktop's `openModal` from the
 * navbar brand — see AppShell's `handleOpenAbout` in App.tsx. The modal shell itself provides
 * the title bar and close button, so this renders content only. */
export function AboutDialog() {
  return (
    <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <DescriptionOutlinedIcon color="primary" fontSize="large" />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            md-editor
          </Typography>
          <Typography variant="body2" color="text.secondary">
            A markdown editor and viewer with live preview, built for beginners and professionals
            alike.
          </Typography>
        </Box>
      </Stack>

      <Divider />

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          What it does
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {FEATURES.map((feature) => (
            <Typography key={feature} component="li" variant="body2">
              {feature}
            </Typography>
          ))}
        </Box>
      </Box>

      <Divider />

      <Box>
        <Typography variant="body2">
          Built on{' '}
          <Link
            href="https://github.com/felipecarrillo100/react-dockable-desktop"
            target="_blank"
            rel="noopener noreferrer"
          >
            react-dockable-desktop
          </Link>
          , an open-source docking window-manager for React — it's what provides this app's tabbed
          workspace, this sidebar, and this very dialog.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
          md-editor's own source is at{' '}
          <Link href="https://github.com/felipecarrillo100/md-editor" target="_blank" rel="noopener noreferrer">
            github.com/felipecarrillo100/md-editor
          </Link>
          .
        </Typography>
      </Box>
    </Box>
  )
}
