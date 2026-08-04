import type { editor as MonacoEditorNS } from 'monaco-editor'

/** A rendered preview element tagged with the markdown source line it came from. */
export interface TaggedElement {
  line: number
  el: HTMLElement
}

/** Scans a preview container for `data-source-line`-tagged elements, sorted ascending by line. */
export function getTaggedElements(container: HTMLElement): TaggedElement[] {
  const out: TaggedElement[] = []
  container.querySelectorAll<HTMLElement>('[data-source-line]').forEach((el) => {
    const line = Number(el.getAttribute('data-source-line'))
    if (!Number.isNaN(line)) out.push({ line, el })
  })
  out.sort((a, b) => a.line - b.line)
  return out
}

// Position of a tagged element relative to previewEl's scrollable content origin
// (independent of the current scroll offset).
function contentTop(previewRect: DOMRect, previewScrollTop: number, target: HTMLElement): number {
  return target.getBoundingClientRect().top - previewRect.top + previewScrollTop
}

// Largest index whose `.line` is <= targetLine (tagged is sorted ascending by line).
function findLineIndex(tagged: TaggedElement[], targetLine: number): number {
  let lo = 0
  let hi = tagged.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (tagged[mid].line <= targetLine) lo = mid
    else hi = mid - 1
  }
  return lo
}

// Largest index whose measured top is <= offset. Unlike findLineIndex, this must measure
// (not just compare numbers), so it costs one getBoundingClientRect() per probed candidate
// — O(log N) of them, not one per element in `tagged`.
function findOffsetIndex(previewRect: DOMRect, scrollTop: number, tagged: TaggedElement[], offset: number): number {
  let lo = 0
  let hi = tagged.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (contentTop(previewRect, scrollTop, tagged[mid].el) <= offset) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Fractional top-of-viewport line, using Monaco's own pixel/line APIs for the sub-line offset. */
export function getEditorTopFractionalLine(editorInstance: MonacoEditorNS.IStandaloneCodeEditor | null): number {
  if (!editorInstance) return 1
  const visible = editorInstance.getVisibleRanges()
  if (!visible || visible.length === 0) return 1
  const topLine = visible[0].startLineNumber
  const scrollTop = editorInstance.getScrollTop()
  const lineTop = editorInstance.getTopForLineNumber(topLine)
  const nextLineTop = editorInstance.getTopForLineNumber(topLine + 1)
  const lineHeight = nextLineTop - lineTop || 1
  return topLine + Math.max(0, (scrollTop - lineTop) / lineHeight)
}

export function computePreviewScrollTopForLine(previewEl: HTMLElement, tagged: TaggedElement[], targetLine: number): number | null {
  if (tagged.length === 0) return null
  if (targetLine <= tagged[0].line) return 0
  const previewRect = previewEl.getBoundingClientRect()
  const scrollTop = previewEl.scrollTop
  const idx = findLineIndex(tagged, targetLine)
  const prev = tagged[idx]
  const prevTop = contentTop(previewRect, scrollTop, prev.el)
  const next = tagged[idx + 1]
  if (!next) return prevTop
  const nextTop = contentTop(previewRect, scrollTop, next.el)
  const progress = next.line === prev.line ? 0 : (targetLine - prev.line) / (next.line - prev.line)
  return prevTop + progress * (nextTop - prevTop)
}

export function getLineForPreviewOffset(previewEl: HTMLElement, tagged: TaggedElement[], offset: number): number | null {
  if (tagged.length === 0) return null
  const previewRect = previewEl.getBoundingClientRect()
  const scrollTop = previewEl.scrollTop
  const firstTop = contentTop(previewRect, scrollTop, tagged[0].el)
  if (offset <= firstTop) return tagged[0].line
  const idx = findOffsetIndex(previewRect, scrollTop, tagged, offset)
  const prev = tagged[idx]
  const prevTop = contentTop(previewRect, scrollTop, prev.el)
  const next = tagged[idx + 1]
  if (!next) return prev.line
  const nextTop = contentTop(previewRect, scrollTop, next.el)
  const progress = nextTop === prevTop ? 0 : (offset - prevTop) / (nextTop - prevTop)
  return prev.line + progress * (next.line - prev.line)
}

export function computeEditorScrollTopForLine(editorInstance: MonacoEditorNS.IStandaloneCodeEditor | null, targetLine: number): number {
  if (!editorInstance) return 0
  const floorLine = Math.max(1, Math.floor(targetLine))
  const fraction = targetLine - floorLine
  const lineTop = editorInstance.getTopForLineNumber(floorLine)
  const nextLineTop = editorInstance.getTopForLineNumber(floorLine + 1)
  return Math.max(0, lineTop + fraction * (nextLineTop - lineTop))
}
