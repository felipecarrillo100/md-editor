// Main-thread side of the isolated Mermaid renderer — see mermaidRenderEntry.ts for why this
// exists (avoiding a shared-global-state flash in the live preview during export). Lazily creates
// one hidden iframe, reused for the lifetime of the page rather than recreated per export (loading
// mermaid's module fresh each time would add real latency).

const RENDER_TIMEOUT_MS = 20_000

interface PendingRequest {
  resolve: (svg: string) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let iframePromise: Promise<HTMLIFrameElement> | null = null
const pending = new Map<string, PendingRequest>()
let requestCounter = 0
let listenerAttached = false

function ensureListener(): void {
  if (listenerAttached) return
  listenerAttached = true
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return
    const data = event.data as { requestId?: unknown; svg?: unknown; error?: unknown }
    if (!data || typeof data.requestId !== 'string') return
    const request = pending.get(data.requestId)
    if (!request) return
    pending.delete(data.requestId)
    clearTimeout(request.timer)
    if (typeof data.svg === 'string') request.resolve(data.svg)
    else request.reject(new Error(typeof data.error === 'string' ? data.error : 'Failed to render diagram'))
  })
}

function getRenderFrame(): Promise<HTMLIFrameElement> {
  if (iframePromise) return iframePromise

  iframePromise = new Promise((resolve) => {
    const iframe = document.createElement('iframe')
    // Zero-sized and off-screen, but deliberately not display:none — a display:none iframe gets
    // no layout computed for its content document at all, which breaks Mermaid's rendering
    // outright (it depends on real getBBox()/text-measurement calls to compute diagram geometry).
    // Same lesson already applied to the PDF-print iframe in fileIO.tsx, for the same reason.
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.src = `${import.meta.env.BASE_URL}mermaid-render.html`

    function handleReady(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.source !== iframe.contentWindow) return
      const data = event.data as { ready?: unknown }
      if (!data?.ready) return
      window.removeEventListener('message', handleReady)
      resolve(iframe)
    }
    window.addEventListener('message', handleReady)

    document.body.appendChild(iframe)
  })

  return iframePromise
}

/** Renders one Mermaid diagram inside the isolated iframe context, entirely decoupled from the
 * main page's own `mermaid` module (and therefore from the live preview's diagrams). */
export async function renderMermaidIsolated(code: string, theme: 'default' | 'dark'): Promise<string> {
  ensureListener()
  const iframe = await getRenderFrame()
  const contentWindow = iframe.contentWindow
  if (!contentWindow) throw new Error('Mermaid render frame is not available')

  const requestId = `mermaid-req-${++requestCounter}`

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('Mermaid render timed out'))
    }, RENDER_TIMEOUT_MS)

    pending.set(requestId, { resolve, reject, timer })
    contentWindow.postMessage({ requestId, code, theme }, window.location.origin)
  })
}
