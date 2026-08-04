import { WorkspaceClient } from 'react-dockable-desktop'
import { MarkdownDocumentPanel } from './components/MarkdownDocumentPanel'
import { createDocument, flushPendingSaves, primeFromStorage, removeDocument } from './documentStore'
import { consumeSharedDocumentFromLocation } from './shareLink'

const LAYOUT_KEY = 'md-editor:layout'
const LAYOUT_SAVE_DEBOUNCE_MS = 500

export const WELCOME_MARKDOWN = `# Welcome to md-editor

A markdown editor and viewer with **live preview**, built for beginners and professionals alike.

## What you can do here

- Open one or more \`.md\` files from disk, or just drag and drop them onto this window
- Edit with a full-featured editor and see the rendered result update as you type, scrolled in sync
- Use the sidebar on the left for a per-document **Table of Contents** and **Search & Replace**
- Export back to \`.md\`, a self-contained \`.html\` file, or a real, selectable-text PDF
- Copy the source or the rendered result to paste into Slack, Gmail, or Word
- Share a document with a link — the content lives in the URL itself, nothing is uploaded anywhere
- Every edit autosaves locally, with version history to fall back to a previous draft

## A few things to try

1. Click the toolbar's **Bold**/*Italic* buttons on some selected text — click again to toggle it off
2. Open the command palette with \`Cmd/Ctrl+K\` (or the ⌘ button, top right)
3. Click the "md-editor" logo in the navbar to see this again, plus what's built underneath it
4. Click a heading in the sidebar's Table of Contents to jump straight to it

## Math

This editor renders LaTeX via KaTeX. Inline: the area of a circle is $A = \\pi r^2$.

A block equation:

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$

## Code

Fenced code blocks get real syntax highlighting:

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`

## Diagrams

A flowchart:

\`\`\`mermaid
graph TD
  Write[Write markdown] --> Preview[Live preview]
  Preview --> Export[Export as .md / HTML / PDF]
  Export --> Share[Share a link]
\`\`\`

A sequence diagram:

\`\`\`mermaid
sequenceDiagram
  participant You
  participant Editor
  participant Preview
  You->>Editor: Type markdown
  Editor->>Preview: Live update
  Preview-->>You: Rendered result
\`\`\`

| Feature | Status |
| --- | --- |
| Live preview | ✅ |
| Multiple documents | ✅ |
| Offline-safe exports | ✅ |
| Table of Contents & Search/Replace | ✅ |
| Math (LaTeX) & syntax-highlighted code | ✅ |

Delete this text and start writing — or open your own file from the navbar above.
`

primeFromStorage()

const sharedDocument = consumeSharedDocumentFromLocation()
const persistedLayout = localStorage.getItem(LAYOUT_KEY)
const initialState = sharedDocument ? null : persistedLayout

export const workspace = new WorkspaceClient({
  panels: {
    markdownDocument: { component: MarkdownDocumentPanel, defaultOptions: { icon: '📝' } },
  },
  initialState,
})

if (sharedDocument) {
  const id = createDocument(sharedDocument.filename, sharedDocument.content)
  workspace.openPanel(id, 'markdownDocument', { title: sharedDocument.filename, initialTarget: 'docked' })
} else if (!persistedLayout) {
  // Genuinely first-ever visit — no saved layout, nothing shared. Show a welcome document
  // instead of a blank canvas.
  const id = createDocument('Welcome.md', WELCOME_MARKDOWN)
  workspace.openPanel(id, 'markdownDocument', { title: 'Welcome.md', initialTarget: 'docked' })
}

let layoutSaveTimer: ReturnType<typeof setTimeout> | undefined

function saveLayoutNow(): void {
  localStorage.setItem(LAYOUT_KEY, workspace.saveLayout())
}

function scheduleLayoutSave(): void {
  if (layoutSaveTimer) clearTimeout(layoutSaveTimer)
  layoutSaveTimer = setTimeout(saveLayoutNow, LAYOUT_SAVE_DEBOUNCE_MS)
}

// onLayoutChanged (5.1.0) coalesces open/close/minimize/restore into one signal — still doesn't
// cover resize/split-ratio-drag/tab-reorder (no hooks for those yet), so this remains debounced
// rather than treated as a complete change feed; the unload-time flush below is the backstop.
workspace.onLayoutChanged(scheduleLayoutSave)
workspace.onPanelClose((id) => removeDocument(id))

// Dev-time safety net: nothing in this app currently passes non-serializable props to
// openPanel (view-state via registerStateProvider is a small plain object), so this should
// never fire — but if a future change accidentally does, surface it instead of silently
// losing a panel from the next reload.
workspace.onPanelsExcluded((panels) => {
  console.warn('[md-editor] saveLayout excluded non-serializable panel(s):', panels)
})

/**
 * Forgets the saved window arrangement (which tabs were open, and where) so the next reload
 * starts fresh — including showing the welcome document again, since that's gated on this exact
 * key being unset. Does NOT delete any document content: documents live under their own
 * `md-editor:doc:<id>` keys, entirely separate from the layout. Callers are expected to reload
 * the page afterward (this only clears the stored value — the running app doesn't re-derive its
 * boot-time "is this a first visit" decision on its own).
 */
export function clearPersistedLayout(): void {
  localStorage.removeItem(LAYOUT_KEY)
}

window.addEventListener('beforeunload', () => {
  flushPendingSaves()
  saveLayoutNow()
})
