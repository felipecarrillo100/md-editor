import mermaid from 'mermaid'

// The entire point of this file: it's a separate Vite entry (mermaid-render.html), loaded into a
// hidden same-origin iframe by mermaidIsolatedRenderer.ts. That gives it its own window/document
// and therefore its own independent copy of the `mermaid` module — mermaid.initialize() here can
// never affect (or be affected by) the main page's own mermaid instance, which the live preview's
// MermaidBlock components use. Without this isolation, the export path forcing a light theme via
// mermaid.initialize() would transiently flip the live preview's own diagrams to that same theme
// if they happened to re-render during the export — confirmed to actually happen.

interface RenderRequest {
  requestId: string
  code: string
  theme: 'default' | 'dark'
}

interface RenderSuccess {
  requestId: string
  svg: string
}

interface RenderFailure {
  requestId: string
  error: string
}

let renderCounter = 0

function isRenderRequest(value: unknown): value is RenderRequest {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.requestId === 'string' && typeof v.code === 'string' && typeof v.theme === 'string'
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== window.location.origin) return
  if (!isRenderRequest(event.data)) return

  const { requestId, code, theme } = event.data
  mermaid.initialize({ startOnLoad: false, theme })
  mermaid
    .render(`mermaid-export-${++renderCounter}`, code)
    .then(({ svg }) => {
      const response: RenderSuccess = { requestId, svg }
      window.parent.postMessage(response, window.location.origin)
    })
    .catch((err: unknown) => {
      const response: RenderFailure = {
        requestId,
        error: err instanceof Error ? err.message : 'Failed to render diagram',
      }
      window.parent.postMessage(response, window.location.origin)
    })
})

window.parent.postMessage({ ready: true }, window.location.origin)
