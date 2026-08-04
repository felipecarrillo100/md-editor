import { PAGE_SIZES, PRINT_MARGIN, type PageSizeKey } from './printPageSizes'

export type PreviewScheme = 'light' | 'dark'

interface PreviewPalette {
  text: string
  heading: string
  muted: string
  link: string
  border: string
  codeBg: string
  codeText: string
  blockquoteBorder: string
  tableStripe: string
  background: string
}

const PALETTES: Record<PreviewScheme, PreviewPalette> = {
  light: {
    text: '#1f2328',
    heading: '#1f2328',
    muted: '#59636e',
    link: '#0969da',
    border: '#d1d9e0',
    codeBg: '#f6f8fa',
    codeText: '#1f2328',
    blockquoteBorder: '#d1d9e0',
    tableStripe: '#f6f8fa',
    background: '#ffffff',
  },
  dark: {
    text: '#e6edf3',
    heading: '#f0f6fc',
    muted: '#9198a1',
    link: '#4493f8',
    border: '#3d444d',
    codeBg: '#161b22',
    codeText: '#e6edf3',
    blockquoteBorder: '#3d444d',
    tableStripe: '#161b22',
    background: '#0d1117',
  },
}

// A compact, hand-picked highlight.js token palette (not an imported hljs theme stylesheet) —
// same approach as the reference demo, kept small and legible rather than pulling in a full theme.
const HIGHLIGHT_TOKENS: Record<PreviewScheme, Record<string, string>> = {
  light: {
    keyword: '#cf222e',
    string: '#0a3069',
    comment: '#6e7781',
    number: '#0550ae',
    title: '#8250df',
    attr: '#116329',
  },
  dark: {
    keyword: '#ff7b72',
    string: '#a5d6ff',
    comment: '#8b949e',
    number: '#79c0ff',
    title: '#d2a8ff',
    attr: '#7ee787',
  },
}

/**
 * Canonical rendered-markdown CSS, as a string, shared by three consumers: the live preview pane
 * (injected inline), the PDF PrintView (with print.css layered on top), and the standalone HTML
 * export (inlined verbatim into the exported file's <head>). Keeping this in one place guarantees
 * all three can never visually drift apart.
 */
export function getPreviewThemeCss(scheme: PreviewScheme): string {
  const p = PALETTES[scheme]
  const h = HIGHLIGHT_TOKENS[scheme]

  return `
.md-preview {
  color: ${p.text};
  background: ${p.background};
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  /* The workspace root disables selection for drag interactions — rendered prose opts back in. */
  user-select: text;
}
.md-preview h1, .md-preview h2, .md-preview h3,
.md-preview h4, .md-preview h5, .md-preview h6 {
  color: ${p.heading};
  font-weight: 600;
  margin: 1.4em 0 0.6em;
  line-height: 1.25;
}
.md-preview h1 { font-size: 1.9em; border-bottom: 1px solid ${p.border}; padding-bottom: 0.3em; }
.md-preview h2 { font-size: 1.5em; border-bottom: 1px solid ${p.border}; padding-bottom: 0.3em; }
.md-preview h3 { font-size: 1.25em; }
.md-preview p { margin: 0.8em 0; }
.md-preview a { color: ${p.link}; text-decoration: none; }
.md-preview a:hover { text-decoration: underline; }
.md-preview strong { font-weight: 600; }
.md-preview hr { border: none; border-top: 1px solid ${p.border}; margin: 2em 0; }
.md-preview img { max-width: 100%; }

.md-preview blockquote {
  margin: 0.8em 0;
  padding: 0 1em;
  color: ${p.muted};
  border-left: 0.25em solid ${p.blockquoteBorder};
}

.md-preview ul, .md-preview ol { padding-left: 1.6em; margin: 0.8em 0; }
.md-preview li { margin: 0.25em 0; }
.md-preview li input[type="checkbox"] { margin-right: 0.4em; }

.md-preview code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.875em;
  background: ${p.codeBg};
  color: ${p.codeText};
  padding: 0.2em 0.4em;
  border-radius: 4px;
}
.md-preview pre {
  background: ${p.codeBg};
  border-radius: 6px;
  padding: 1em;
  overflow: auto;
}
.md-preview pre code {
  background: none;
  padding: 0;
  font-size: 0.85em;
}
.md-preview .hljs-keyword, .md-preview .hljs-built_in { color: ${h.keyword}; }
.md-preview .hljs-string { color: ${h.string}; }
.md-preview .hljs-comment { color: ${h.comment}; font-style: italic; }
.md-preview .hljs-number { color: ${h.number}; }
.md-preview .hljs-title, .md-preview .hljs-section { color: ${h.title}; }
.md-preview .hljs-attr, .md-preview .hljs-attribute { color: ${h.attr}; }

.md-preview table { border-collapse: collapse; width: 100%; margin: 0.8em 0; overflow: auto; display: block; }
.md-preview table th, .md-preview table td {
  border: 1px solid ${p.border};
  padding: 0.5em 0.9em;
  text-align: left;
}
.md-preview table tr:nth-child(even) { background: ${p.tableStripe}; }

.md-preview .md-mermaid { margin: 1em 0; text-align: center; }
.md-preview .md-mermaid svg { max-width: 100%; height: auto; }
.md-preview .md-mermaid-error {
  color: #cf222e;
  background: ${p.codeBg};
  border-radius: 6px;
  padding: 1em;
  font-size: 0.85em;
}
.md-preview .md-mermaid-placeholder {
  color: ${p.muted};
  font-size: 0.85em;
  padding: 0.5em 0;
}
`
}

/**
 * Print-only additions layered on top of getPreviewThemeCss's output, for the PDF export path
 * only (renderStandaloneHtml's `forPrint` option) — never used by the live preview or the plain
 * .html download, both of which are meant to be viewed in a scrollable browser window rather than
 * fit onto a fixed physical page.
 *
 * Constrains `.md-preview` to the page's actual printable width (same page-size config as the
 * `@page` rule, so what's laid out matches what physically prints), and replaces the on-screen
 * scroll affordances for wide tables/code — meaningless in print, since there's no scrollbar — with
 * reflow instead: wrapping code lines and shrinking table columns to fit rather than letting
 * either get silently clipped at the page edge.
 */
export function getPrintOnlyCss(pageSize: PageSizeKey): string {
  const { width, height } = PAGE_SIZES[pageSize]

  return `
@page {
  size: ${width} ${height};
  margin: ${PRINT_MARGIN};
}

.md-preview {
  max-width: calc(${width} - 2 * ${PRINT_MARGIN});
  margin: 0 auto;
}

.md-preview pre {
  white-space: pre-wrap;
  word-break: break-word;
  overflow: visible;
}

.md-preview table {
  table-layout: fixed;
  overflow: visible;
}
.md-preview table td,
.md-preview table th {
  overflow-wrap: break-word;
  word-break: break-word;
}
.md-table-wrap {
  overflow: visible;
}
`
}
