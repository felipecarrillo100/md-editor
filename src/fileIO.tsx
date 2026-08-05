import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownContent } from './components/MarkdownContent'
import { resolveMermaidDiagrams } from './components/MermaidBlock'
import { getPreviewThemeCss, getPrintOnlyCss, getPrintPageCss, type PreviewScheme } from './styles/previewTheme'
import type { PageSizeKey } from './styles/printPageSizes'
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

function baseNameFor(filename: string): string {
  return filename.replace(/\.(md|markdown)$/i, '')
}

function htmlFilenameFor(filename: string): string {
  return `${baseNameFor(filename)}.html`
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
export interface RenderStandaloneHtmlOptions {
  /** Adds an @page rule plus print-width-fitting CSS (see previewTheme.ts's getPrintPageCss) —
   * used only by the PDF export paths. The plain .html download omits this and stays unconstrained
   * width/scrollable, as appropriate for something opened in a browser rather than printed. */
  forPrint?: boolean
  pageSize?: PageSizeKey
  /** Only relevant when forPrint is true. Also adds the Chromium-only @page margin-box
   * header/footer content (document title / "Powered by md-editor" / page count) — set to false
   * when the caller supplies its own header/footer mechanism instead (e.g. Playwright's
   * headerTemplate/footerTemplate for the server-rendered export), since both active at once
   * visibly duplicate. Defaults to true, matching the client-side window.print() export's needs. */
  includeMarginBoxHeaderFooter?: boolean
}

export async function renderStandaloneHtml(
  doc: MarkdownDocument,
  scheme: PreviewScheme,
  options: RenderStandaloneHtmlOptions = {},
): Promise<string> {
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

  const printCss = options.forPrint
    ? options.includeMarginBoxHeaderFooter === false
      ? getPrintPageCss(options.pageSize ?? 'a4')
      : getPrintOnlyCss(options.pageSize ?? 'a4', doc.filename)
    : ''
  const css = `${katexCss}\n${getPreviewThemeCss(scheme)}\nbody { margin: 0; padding: 2rem; }\n${printCss}`

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

/**
 * Exports a document as PDF by printing the same self-contained HTML renderStandaloneHtml
 * produces for the .html download, inside a hidden iframe — one export pipeline instead of two,
 * so both stay visually in sync and neither can drift. Always renders in the light theme
 * (independent of the app's own live theme toggle): the app's viewing preference isn't part of a
 * document meant to be shared or printed.
 */
export async function exportDocumentAsPdf(doc: MarkdownDocument, pageSize: PageSizeKey = 'a4'): Promise<void> {
  const html = await renderStandaloneHtml(doc, 'light', { forPrint: true, pageSize })

  const iframe = document.createElement('iframe')
  // Zero-sized and off-screen, but deliberately not display:none — some browsers refuse to print
  // an element with no layout box at all.
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'

  // Chrome's "Save as PDF" suggests a filename from the *top-level tab's* document.title, not
  // anything about the iframe being printed (confirmed — it also reads the top-level tab's URL
  // for the print header, for the same reason: the print/save UI belongs to the outer browsing
  // context, not the iframe). Temporarily renaming the tab for the duration of the print action
  // is the only way to actually influence that suggested name, and is restored right after.
  const originalTitle = document.title
  document.title = baseNameFor(doc.filename)

  let cleanedUp = false
  function cleanup(): void {
    if (cleanedUp) return
    cleanedUp = true
    document.title = originalTitle
    iframe.remove()
  }

  iframe.addEventListener('load', () => {
    const iframeWindow = iframe.contentWindow
    if (!iframeWindow) {
      cleanup()
      return
    }
    iframeWindow.addEventListener('afterprint', cleanup)
    // Fallback in case a browser never fires afterprint (e.g. the user cancels via some
    // non-standard path) — don't leak the iframe forever.
    setTimeout(cleanup, 60_000)
    iframeWindow.focus()
    iframeWindow.print()
  })

  iframe.srcdoc = html
  document.body.appendChild(iframe)
}

const PDF_SERVER_URL = import.meta.env.VITE_PDF_SERVER_URL as string | undefined

function pdfFilenameFor(filename: string): string {
  return `${baseNameFor(filename)}.pdf`
}

/** Whether the experimental server-rendered PDF export is configured — callers should check this
 * before offering it in the UI, since it's inert without a deployed api/render-pdf.ts to call. */
export function isPdfServerConfigured(): boolean {
  return Boolean(PDF_SERVER_URL)
}

/**
 * Experimental alternative to exportDocumentAsPdf: renders via a real backend (Playwright driving
 * headless Chromium — see api/render-pdf.ts) instead of the browser's own print dialog. Produces
 * an identical result regardless of the *viewer's* own browser, with a genuine live page count and
 * a direct one-click download — no print dialog step. exportDocumentAsPdf is untouched; this is a
 * separate, opt-in path for comparison, not a replacement.
 */
export async function exportDocumentAsPdfServerSide(doc: MarkdownDocument, pageSize: PageSizeKey = 'a4'): Promise<void> {
  if (!PDF_SERVER_URL) throw new Error('VITE_PDF_SERVER_URL is not configured')

  const html = await renderStandaloneHtml(doc, 'light', {
    forPrint: true,
    pageSize,
    includeMarginBoxHeaderFooter: false,
  })

  const response = await fetch(PDF_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, pageSize, title: doc.filename }),
  })
  if (!response.ok) {
    throw new Error(`PDF render failed (${response.status})`)
  }
  const blob = await response.blob()
  downloadBlob(blob, pdfFilenameFor(doc.filename))
}
