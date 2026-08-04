import { useState, type MouseEvent } from 'react'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Tooltip from '@mui/material/Tooltip'
import Divider from '@mui/material/Divider'
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import KeyboardCommandKeyIcon from '@mui/icons-material/KeyboardCommandKey'

export interface AppNavbarProps {
  mode: 'light' | 'dark'
  onToggleTheme: () => void
  onNew: () => void
  onOpen: () => void
  onSaveMarkdown: () => void
  onSaveMarkdownCopy: () => void
  onExportHtml: () => void
  onExportPdf: () => void
  onShare: () => void
  onOpenCommandPalette: () => void
  onOpenAbout: () => void
  hasActiveDocument: boolean
}

export function AppNavbar({
  mode,
  onToggleTheme,
  onNew,
  onOpen,
  onSaveMarkdown,
  onSaveMarkdownCopy,
  onExportHtml,
  onExportPdf,
  onShare,
  onOpenCommandPalette,
  onOpenAbout,
  hasActiveDocument,
}: AppNavbarProps) {
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null)

  const openExportMenu = (event: MouseEvent<HTMLElement>) => setExportAnchor(event.currentTarget)
  const closeExportMenu = () => setExportAnchor(null)

  const withClose = (action: () => void) => () => {
    closeExportMenu()
    action()
  }

  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Tooltip title="About md-editor">
          <Box
            onClick={onOpenAbout}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mr: 2,
              cursor: 'pointer',
              borderRadius: 1,
              px: 0.5,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <DescriptionOutlinedIcon color="primary" />
            <Typography variant="h6" component="div" sx={{ fontWeight: 600, fontSize: '1.05rem' }}>
              md-editor
            </Typography>
          </Box>
        </Tooltip>

        <Button startIcon={<NoteAddOutlinedIcon />} onClick={onNew} size="small">
          New
        </Button>
        <Button startIcon={<FolderOpenOutlinedIcon />} onClick={onOpen} size="small">
          Open
        </Button>
        <Button
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={openExportMenu}
          size="small"
          disabled={!hasActiveDocument}
        >
          Export
        </Button>
        <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={closeExportMenu}>
          <MenuItem onClick={withClose(onSaveMarkdown)}>
            <ListItemIcon>
              <DescriptionOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Save as .md</ListItemText>
          </MenuItem>
          <MenuItem onClick={withClose(onSaveMarkdownCopy)}>
            <ListItemIcon>
              <ContentCopyOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Save a copy (.md)</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem onClick={withClose(onExportHtml)}>
            <ListItemIcon>
              <CodeOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Export as HTML</ListItemText>
          </MenuItem>
          <MenuItem onClick={withClose(onExportPdf)}>
            <ListItemIcon>
              <PictureAsPdfOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Export for printing (.pdf)</ListItemText>
          </MenuItem>
        </Menu>

        <Button
          startIcon={<ShareOutlinedIcon />}
          onClick={onShare}
          size="small"
          disabled={!hasActiveDocument}
        >
          Share
        </Button>

        <div style={{ flexGrow: 1 }} />

        <Tooltip title="Command palette (Cmd/Ctrl+K)">
          <IconButton onClick={onOpenCommandPalette} size="small">
            <KeyboardCommandKeyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
          <IconButton onClick={onToggleTheme} size="small">
            {mode === 'dark' ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  )
}
