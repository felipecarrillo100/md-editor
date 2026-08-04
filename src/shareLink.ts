import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'

const HASH_PREFIX = 'doc='

// Real-world safe threshold: browsers cap URL length somewhere in the 2000–8000 character range
// depending on vendor. Staying well under that keeps the link reliable everywhere it gets pasted
// (chat apps, email clients, etc. often clip or mangle very long URLs even before the browser cap).
const MAX_SHARE_PAYLOAD_LENGTH = 6000

export interface SharedDocumentPayload {
  filename: string
  content: string
}

export class DocumentTooLargeToShareError extends Error {
  constructor() {
    super('This document is too large to share as a link — export and send the file instead.')
    this.name = 'DocumentTooLargeToShareError'
  }
}

/** Builds a self-contained share URL. Throws DocumentTooLargeToShareError if it won't fit safely. */
export function buildShareUrl(filename: string, content: string): string {
  const payload: SharedDocumentPayload = { filename, content }
  const compressed = compressToEncodedURIComponent(JSON.stringify(payload))
  if (compressed.length > MAX_SHARE_PAYLOAD_LENGTH) {
    throw new DocumentTooLargeToShareError()
  }
  const url = new URL(window.location.href)
  url.hash = `${HASH_PREFIX}${compressed}`
  return url.toString()
}

/**
 * Reads a shared document out of the current URL hash, if present, and clears the hash
 * immediately so a manual refresh restores the normal saved layout instead of re-importing the
 * same link as a duplicate document.
 */
export function consumeSharedDocumentFromLocation(): SharedDocumentPayload | null {
  const { hash } = window.location
  if (!hash.startsWith(`#${HASH_PREFIX}`)) return null

  const compressed = hash.slice(1 + HASH_PREFIX.length)
  window.history.replaceState(null, '', window.location.pathname + window.location.search)

  try {
    const json = decompressFromEncodedURIComponent(compressed)
    if (!json) return null
    const payload = JSON.parse(json) as Partial<SharedDocumentPayload>
    if (typeof payload.filename !== 'string' || typeof payload.content !== 'string') return null
    return { filename: payload.filename, content: payload.content }
  } catch {
    return null
  }
}
