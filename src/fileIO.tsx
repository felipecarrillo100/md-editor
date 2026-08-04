import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownContent } from './components/MarkdownContent'
import { resolveMermaidDiagrams } from './components/MermaidBlock'
import { getPreviewThemeCss, type PreviewScheme } from './styles/previewTheme'
import katexCss from 'katex/dist/katex.min.css?raw'
import type { MarkdownDocument } from './documentStore'
import { markSaved } from './documentStore'

export interface OpenedFile {
  filename: string
  content: string
  fileHandle?: FileSystemFileHandle
}

const supportsFileSystemAccess = typeof window !== 'undefined' && 'showOpenFilePicker' in window

function isMarkdownFilename(name: string): boolean {
  return /\.(md|markdown)$/i.test(name)
}

async function readFileList(files: Iterable<File>): Promise<OpenedFile[]> {
  const opened: OpenedFile[] = []
  for (const file of files) {
    if (!isMarkdownFilename(file.name)) continue
    opened.push({ filename: file.name, content: await file.text() })
  }
  return opened
}

function pickFilesViaInput(): Promise<OpenedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown'
    input.multiple = true
    input.style.display = 'none'
    input.addEventListener(
      'change',
      () => {
        void readFileList(input.files ?? []).then(resolve)
        input.remove()
      },
      { once: true },
    )
    document.body.appendChild(input)
    input.click()
  })
}

/** Reads dropped/selected File objects into openable documents. Shared by drag-and-drop and Open. */
export async function readFilesAsDocuments(files: Iterable<File>): Promise<OpenedFile[]> {
  return readFileList(files)
}

/** Opens one or more .md files from disk. Prefers the File System Access API (keeps a handle for
 * true in-place Save); falls back to a hidden <input type="file"> where unsupported. */
export async function openFilesFromDisk(): Promise<OpenedFile[]> {
  if (!supportsFileSystemAccess) return pickFilesViaInput()

  try {
    const handles = await showOpenFilePicker({
      multiple: true,
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
    })
    const opened: OpenedFile[] = []
    for (const handle of handles) {
      const file = await handle.getFile()
      opened.push({ filename: file.name, content: await file.text(), fileHandle: handle })
    }
    return opened
  } catch (err) {
    // AbortError — the user cancelled the picker. Anything else, fall back rather than fail silently.
    if (err instanceof DOMException && err.name === 'AbortError') return []
    return pickFilesViaInput()
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Saves a document as .md — writes in-place via its FileSystemFileHandle if it has one,
 * otherwise falls back to a plain download (the universal path, always available). */
export async function saveDocumentAsMarkdown(doc: MarkdownDocument): Promise<void> {
  if (doc.fileHandle) {
    const writable = await doc.fileHandle.createWritable()
    await writable.write(doc.content)
    await writable.close()
    markSaved(doc.id)
    return
  }
  downloadBlob(new Blob([doc.content], { type: 'text/markdown' }), doc.filename)
  markSaved(doc.id)
}

/** Always downloads a fresh copy, regardless of whether the document has a file handle. */
export function saveDocumentCopyAsMarkdown(doc: MarkdownDocument): void {
  downloadBlob(new Blob([doc.content], { type: 'text/markdown' }), doc.filename)
}

function htmlFilenameFor(filename: string): string {
  return filename.replace(/\.(md|markdown)$/i, '') + '.html'
}

/**
 * Renders a document to a self-contained standalone HTML string — no external stylesheet links
 * or CDN fonts, so the file is safe to open offline, email, or archive. Mermaid diagrams are
 * pre-resolved to static inline SVG (this path has no bundled JS runtime, by design), so the
 * exported file has no script dependency at all.
 *
 * Known v1 limitation: remote images (`![alt](https://...)`) remain external URLs and won't
 * render offline; KaTeX's own CSS is inlined but its custom math fonts are not embedded, so
 * math-heavy documents render with correct layout/spacing but plainer glyphs when opened with no
 * network access.
 */
export async function renderStandaloneHtml(doc: MarkdownDocument, scheme: PreviewScheme): Promise<string> {
  const mermaidTheme = scheme === 'dark' ? 'dark' : 'default'
  const resolvedMermaid = await resolveMermaidDiagrams(doc.content, mermaidTheme)

  const bodyHtml = renderToStaticMarkup(
    <MarkdownContent
      source={doc.content}
      mermaidTheme={mermaidTheme}
      renderMermaid={(code) => (
        // eslint-disable-next-line react/no-danger -- svg is produced locally by mermaid.render
        <div className="md-mermaid" dangerouslySetInnerHTML={{ __html: resolvedMermaid.get(code) ?? '' }} />
      )}
    />,
  )

  const css = `${katexCss}\n${getPreviewThemeCss(scheme)}\nbody { margin: 0; padding: 2rem; }`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${doc.filename}</title>
<style>${css}</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`
}

export async function exportDocumentAsHtml(doc: MarkdownDocument, scheme: PreviewScheme): Promise<void> {
  const html = await renderStandaloneHtml(doc, scheme)
  downloadBlob(new Blob([html], { type: 'text/html' }), htmlFilenameFor(doc.filename))
}
