import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

// Self-hosts Monaco instead of @monaco-editor/react's default of loading it from
// cdn.jsdelivr.net at runtime — that CDN dependency was a real CSP script-src exception (removed
// in index.html alongside this file). Only the generic editor worker is registered: this app only
// ever creates a `defaultLanguage="markdown"` model (MarkdownDocumentPanel.tsx), and markdown is a
// basic, Monarch-grammar-only language with no dedicated language-service worker of its own,
// unlike TypeScript/JSON/CSS/HTML.
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

// Providing `monaco` here makes @monaco-editor/loader's init() resolve immediately from it,
// skipping its CDN script-injection path entirely (confirmed from the loader's own source).
loader.config({ monaco })
