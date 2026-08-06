import { useEffect, useRef, useState } from 'react'
import { getAbcForegroundColor, type PreviewScheme } from '../styles/previewTheme'

export interface AbcBlockProps {
  code: string
  scheme?: PreviewScheme
}

/**
 * Renders a single ABC-notation tune to SVG on mount and whenever `code`/`scheme` change. Used
 * only for the live preview and the PDF print view — both are real mounted DOM trees. The
 * standalone HTML export can't use this (no bundled JS runtime there); it pre-resolves tunes to
 * static SVG strings instead — see resolveAbcNotation below and fileIO.ts's renderStandaloneHtml.
 *
 * No isolated-iframe render target needed here, unlike MermaidBlock: abcjs has no mutable global
 * singleton whose state could leak between concurrent renders — every call is self-contained.
 *
 * `abcjs` is loaded via a dynamic import rather than a static one, purely to keep it out of the
 * main bundle — most documents never use a ```abc fence, so it ships as its own lazy chunk, same
 * treatment as katex/each Mermaid diagram type.
 */
export function AbcBlock({ code, scheme = 'light' }: AbcBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    import('abcjs')
      .then(({ renderAbc }) => {
        if (cancelled || !containerRef.current) return
        renderAbc(containerRef.current, code, { responsive: 'resize', foregroundColor: getAbcForegroundColor(scheme) })
        setError(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render score')
      })
    return () => {
      cancelled = true
    }
  }, [code, scheme])

  if (error) {
    return (
      <pre className="md-abc-error" role="alert">
        ABC notation error: {error}
      </pre>
    )
  }

  return <div className="md-abc" ref={containerRef} />
}

/**
 * Resolves every distinct ```abc code block found in `source` to a static SVG string. Used by the
 * standalone HTML export and both PDF export paths to avoid shipping the abcjs runtime in a
 * self-contained file.
 */
export async function resolveAbcNotation(source: string, scheme: PreviewScheme = 'light'): Promise<Map<string, string>> {
  const blocks = Array.from(source.matchAll(/```abc\r?\n([\s\S]*?)```/g)).map((match) => match[1].trim())
  const uniqueBlocks = Array.from(new Set(blocks))

  const resolved = new Map<string, string>()
  if (uniqueBlocks.length === 0) return resolved

  const { renderAbc } = await import('abcjs')
  const container = document.createElement('div')
  for (const code of uniqueBlocks) {
    try {
      renderAbc(container, code, { responsive: 'resize', foregroundColor: getAbcForegroundColor(scheme) })
      resolved.set(code, container.innerHTML)
    } catch {
      resolved.set(code, '<pre>ABC notation error</pre>')
    }
  }
  return resolved
}
