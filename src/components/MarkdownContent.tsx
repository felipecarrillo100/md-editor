import type { ReactNode, ElementType } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import { MermaidBlock } from './MermaidBlock'

export interface MarkdownContentProps {
  source: string
  /**
   * Overrides how ```mermaid fences render. Defaults to the live MermaidBlock (real DOM,
   * useEffect-driven). Swap this for a pre-resolved static-SVG lookup when server-rendering via
   * renderToStaticMarkup — see fileIO.ts's renderStandaloneHtml, which can't run effects.
   */
  renderMermaid?: (code: string) => ReactNode
  mermaidTheme?: 'default' | 'dark'
  /**
   * Tags rendered headings/paragraphs/lists/etc. with `data-source-line`, read by
   * MarkdownDocumentPanel's editor<->preview scroll-sync. Opt-in and off by default: this
   * component is also used for the PDF PrintView and the standalone HTML export, and those must
   * not leak app-internal data attributes into exported files.
   */
  tagSourceLines?: boolean
}

function extractText(children: ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(extractText).join('')
  return ''
}

// react-markdown passes `node` (the mdast/hast node, carrying `.position.start.line`) to every
// component override alongside the usual element props — there's no exported prop type covering
// "any tag's props plus this extra node field," and a precise per-tag generic here previously
// cascaded into unrelated JSX.IntrinsicElements/ElementType errors when attempted (same tradeoff
// hit and reverted for this exact pattern in react-dockable-desktop's own reference demo).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withSourceLine(tag: string): (props: any) => ReactNode {
  // `tag as ElementType`, not `keyof JSX.IntrinsicElements` — the latter hits an
  // unresolvable JSX-namespace reference in this project's TS setup (same tradeoff hit and
  // fixed this exact way in react-dockable-desktop's own reference demo).
  const Tag = tag as ElementType
  return ({ node, ...rest }) => {
    const line = node?.position?.start.line
    return <Tag {...rest} data-source-line={line} />
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TableWithScroll({ node, ...rest }: any): ReactNode {
  const line = node?.position?.start.line
  return (
    <div style={{ overflowX: 'auto' }} data-source-line={line}>
      <table {...rest} />
    </div>
  )
}

// react-markdown's Components type gives each key its own specific per-tag signature, which a
// dynamically-built record can't satisfy without a cast — spelled out explicitly instead.
const sourceLineComponents: Partial<Components> = {
  h1: withSourceLine('h1'),
  h2: withSourceLine('h2'),
  h3: withSourceLine('h3'),
  h4: withSourceLine('h4'),
  h5: withSourceLine('h5'),
  h6: withSourceLine('h6'),
  p: withSourceLine('p'),
  li: withSourceLine('li'),
  blockquote: withSourceLine('blockquote'),
  pre: withSourceLine('pre'),
  table: TableWithScroll,
}

/**
 * The one canonical react-markdown pipeline, shared by the live preview pane, the PDF print
 * view, and the standalone HTML export — so none of the three can silently drift out of sync
 * with the others (GFM tables/task-lists, math, syntax highlighting, heading anchors, raw HTML,
 * and mermaid diagrams all behave identically everywhere this component is used).
 */
export function MarkdownContent({ source, renderMermaid, mermaidTheme = 'default', tagSourceLines = false }: MarkdownContentProps) {
  const components: Components = {
    code(props) {
      const { className, children, ...rest } = props
      const isMermaid = /language-mermaid\b/.test(className ?? '')
      if (isMermaid) {
        const code = extractText(children).trim()
        return renderMermaid ? renderMermaid(code) : <MermaidBlock code={code} theme={mermaidTheme} />
      }
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      )
    },
    ...(tagSourceLines ? sourceLineComponents : {}),
  }

  return (
    <div className="md-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeSlug, rehypeHighlight, rehypeKatex]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
