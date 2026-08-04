import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

let renderCounter = 0

export interface MermaidBlockProps {
  code: string
  theme?: 'default' | 'dark'
}

/**
 * Renders a single mermaid diagram to SVG on mount and whenever `code`/`theme` change. Used only
 * for the live preview and the PDF print view — both are real mounted DOM trees. The standalone
 * HTML export can't use this (no bundled JS runtime there); it pre-resolves diagrams to static
 * SVG strings instead — see fileIO.ts's renderStandaloneHtml.
 */
export function MermaidBlock({ code, theme = 'default' }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${++renderCounter}`)

  useEffect(() => {
    let cancelled = false
    mermaid.initialize({ startOnLoad: false, theme })
    mermaid
      .render(idRef.current, code)
      .then(({ svg: renderedSvg }) => {
        if (!cancelled) {
          setSvg(renderedSvg)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render diagram')
      })
    return () => {
      cancelled = true
    }
  }, [code, theme])

  if (error) {
    return (
      <pre className="md-mermaid-error" role="alert">
        Mermaid diagram error: {error}
      </pre>
    )
  }

  if (!svg) return <div className="md-mermaid-placeholder">Rendering diagram…</div>

  // eslint-disable-next-line react/no-danger -- svg is produced locally by mermaid.render, not user HTML
  return <div className="md-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
}

/** Resolves every distinct mermaid code block found in `source` to a static SVG string. Used by
 * the standalone HTML export to avoid shipping the mermaid runtime in a self-contained file. */
export async function resolveMermaidDiagrams(
  source: string,
  theme: 'default' | 'dark' = 'default',
): Promise<Map<string, string>> {
  const blocks = Array.from(source.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)).map((match) => match[1].trim())
  const uniqueBlocks = Array.from(new Set(blocks))

  mermaid.initialize({ startOnLoad: false, theme })
  const resolved = new Map<string, string>()
  for (const code of uniqueBlocks) {
    try {
      const { svg } = await mermaid.render(`mermaid-export-${++renderCounter}`, code)
      resolved.set(code, svg)
    } catch {
      resolved.set(code, `<pre>Mermaid diagram error</pre>`)
    }
  }
  return resolved
}
