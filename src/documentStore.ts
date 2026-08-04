import { useSyncExternalStore } from 'react'

export interface MarkdownDocument {
  id: string
  filename: string
  content: string
  /** True when content differs from what was last written to a real file (Save/export). */
  dirty: boolean
  /** Present only when opened via the File System Access API — enables in-place Save. */
  fileHandle?: FileSystemFileHandle
}

export interface HistorySnapshot {
  timestamp: number
  content: string
}

interface StoredDocumentRecord {
  filename: string
  content: string
}

const DOC_INDEX_KEY = 'md-editor:doc-index'
const docKey = (id: string) => `md-editor:doc:${id}`
const historyKey = (id: string) => `md-editor:history:${id}`
const MAX_HISTORY_SNAPSHOTS = 20
const AUTOSAVE_DEBOUNCE_MS = 500

const documents = new Map<string, MarkdownDocument>()
const listeners = new Set<() => void>()
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

let allDocsSnapshot: MarkdownDocument[] = []
let allDocsSnapshotStale = true

function notify(): void {
  allDocsSnapshotStale = true
  for (const listener of listeners) listener()
}

function readDocIndex(): string[] {
  try {
    const raw = localStorage.getItem(DOC_INDEX_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function writeDocIndex(ids: string[]): void {
  localStorage.setItem(DOC_INDEX_KEY, JSON.stringify(ids))
}

export function readHistory(id: string): HistorySnapshot[] {
  try {
    const raw = localStorage.getItem(historyKey(id))
    return raw ? (JSON.parse(raw) as HistorySnapshot[]) : []
  } catch {
    return []
  }
}

function persistDocument(id: string): void {
  const doc = documents.get(id)
  if (!doc) return
  const record: StoredDocumentRecord = { filename: doc.filename, content: doc.content }
  localStorage.setItem(docKey(id), JSON.stringify(record))

  const history = readHistory(id)
  history.unshift({ timestamp: Date.now(), content: doc.content })
  localStorage.setItem(historyKey(id), JSON.stringify(history.slice(0, MAX_HISTORY_SNAPSHOTS)))
}

function schedulePersist(id: string): void {
  const existing = saveTimers.get(id)
  if (existing) clearTimeout(existing)
  saveTimers.set(
    id,
    setTimeout(() => {
      saveTimers.delete(id)
      persistDocument(id)
    }, AUTOSAVE_DEBOUNCE_MS),
  )
}

/** Flushes any pending debounced autosave immediately — call on unmount/beforeunload. */
export function flushPendingSaves(): void {
  for (const [id, timer] of saveTimers) {
    clearTimeout(timer)
    persistDocument(id)
  }
  saveTimers.clear()
}

export function createDocument(filename: string, content: string, fileHandle?: FileSystemFileHandle): string {
  const id = crypto.randomUUID()
  documents.set(id, { id, filename, content, dirty: false, fileHandle })
  writeDocIndex([...readDocIndex(), id])
  persistDocument(id) // a brand-new doc shouldn't wait for the debounce
  notify()
  return id
}

export function updateContent(id: string, content: string): void {
  const doc = documents.get(id)
  if (!doc || doc.content === content) return
  documents.set(id, { ...doc, content, dirty: true })
  schedulePersist(id)
  notify()
}

/** Marks a document as saved to a real file — clears the dirty indicator. */
export function markSaved(id: string, fileHandle?: FileSystemFileHandle): void {
  const doc = documents.get(id)
  if (!doc) return
  documents.set(id, { ...doc, dirty: false, fileHandle: fileHandle ?? doc.fileHandle })
  notify()
}

export function renameDocument(id: string, filename: string): void {
  const doc = documents.get(id)
  if (!doc) return
  documents.set(id, { ...doc, filename })
  schedulePersist(id)
  notify()
}

export function getDocument(id: string): MarkdownDocument | undefined {
  return documents.get(id)
}

export function removeDocument(id: string): void {
  documents.delete(id)
  localStorage.removeItem(docKey(id))
  localStorage.removeItem(historyKey(id))
  writeDocIndex(readDocIndex().filter((existingId) => existingId !== id))
  const timer = saveTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    saveTimers.delete(id)
  }
  notify()
}

/** Reads every persisted document record into memory. Call once, before the workspace mounts. */
export function primeFromStorage(): void {
  for (const id of readDocIndex()) {
    try {
      const raw = localStorage.getItem(docKey(id))
      if (!raw) continue
      const record = JSON.parse(raw) as StoredDocumentRecord
      documents.set(id, { id, filename: record.filename, content: record.content, dirty: false })
    } catch {
      // Corrupt record — skip it rather than crash boot.
    }
  }
}

function getAllDocumentsSnapshot(): MarkdownDocument[] {
  if (allDocsSnapshotStale) {
    allDocsSnapshot = Array.from(documents.values())
    allDocsSnapshotStale = false
  }
  return allDocsSnapshot
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDocument(id: string): MarkdownDocument | undefined {
  return useSyncExternalStore(subscribe, () => documents.get(id))
}

export function useAllDocuments(): MarkdownDocument[] {
  return useSyncExternalStore(subscribe, getAllDocumentsSnapshot)
}
