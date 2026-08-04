import { useEffect, useRef } from 'react'
import { MarkdownContent } from './MarkdownContent'
import { getPreviewThemeCss, type PreviewScheme } from '../styles/previewTheme'
import type { MarkdownDocument } from '../documentStore'

export interface PrintViewProps {
  doc: MarkdownDocument
  scheme: PreviewScheme
  onReady: () => void
}

/**
 * Off-screen (per print.css's .md-print-view rules — hidden on screen, the only visible thing
 * during print) rendering of a document for the PDF export flow: render through the real DOM
 * (so Mermaid can do its normal async, effect-driven rendering), then call onReady, which the
 * caller uses to trigger window.print() — the browser's native "Save as PDF" produces real
 * vector text, unlike a rasterized html2canvas capture.
 */
export function PrintView({ doc, scheme, onReady }: PrintViewProps) {
  const firedRef = useRef(false)

  useEffect(() => {
    firedRef.current = false
    // A fixed delay rather than tracking every Mermaid promise — pragmatic for v1: gives
    // diagrams time to finish their own async render before printing. A diagram slower than
    // this simply still shows its "Rendering diagram…" placeholder text on the printed page,
    // not a crash.
    const timer = setTimeout(() => {
      if (!firedRef.current) {
        firedRef.current = true
        onReady()
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [doc.id, doc.content, onReady])

  return (
    <div className="md-print-view">
      <style>{getPreviewThemeCss(scheme)}</style>
      <MarkdownContent source={doc.content} mermaidTheme={scheme === 'dark' ? 'dark' : 'default'} />
    </div>
  )
}
