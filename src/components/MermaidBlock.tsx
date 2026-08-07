import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { renderMermaidIsolated } from '../mermaidIsolatedRenderer'

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
    // securityLevel: 'strict' is mermaid's own default — set explicitly (rather than relying on
    // that default silently) so this app's safety doesn't depend on mermaid never changing its
    // default, and so a future change to 'loose'/'sandbox' (e.g. to enable clickable-node links)
    // can't happen by accident. In 'strict' mode mermaid runs its own SVG output through DOMPurify
    // internally before returning it, so diagram source (```mermaid fences, including ones that
    // arrive via a shared link — see shareLink.ts) can't inject scripts/event handlers this way.
    mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict' })
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

/**
 * Resolves every distinct mermaid code block found in `source` to a static SVG string. Used by
 * the standalone HTML export and both PDF export paths to avoid shipping the mermaid runtime in a
 * self-contained file. Renders inside an isolated iframe (see mermaidIsolatedRenderer.ts) rather
 * than using the main thread's own `mermaid` module directly — that module is a single shared
 * global singleton, and mutating its theme here (exports always force a specific theme,
 * independent of the live app theme) would otherwise transiently affect MermaidBlock's own
 * live-preview diagrams if they happened to re-render during an export — confirmed to actually
 * happen (a visible flash to the wrong theme).
 */
export async function resolveMermaidDiagrams(
  source: string,
  theme: 'default' | 'dark' = 'default',
): Promise<Map<string, string>> {
  const blocks = Array.from(source.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)).map((match) => match[1].trim())
  const uniqueBlocks = Array.from(new Set(blocks))

  const resolved = new Map<string, string>()
  for (const code of uniqueBlocks) {
    try {
      resolved.set(code, await renderMermaidIsolated(code, theme))
    } catch {
      resolved.set(code, `<pre>Mermaid diagram error</pre>`)
    }
  }
  return resolved
}
