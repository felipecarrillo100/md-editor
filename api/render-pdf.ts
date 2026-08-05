import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import chromium from '@sparticuz/chromium'
import { chromium as playwrightChromium } from 'playwright-core'

// Experimental — see the plan for context. Reuses renderStandaloneHtml's output verbatim; the
// client sends already-fully-rendered, self-contained HTML (KaTeX math, Mermaid pre-resolved to
// static SVG, no client JS at all), so page.setContent's own 'load' wait is fully deterministic —
// there's nothing async left to race against, unlike the old window.print()-based timing bug.

const ALLOWED_ORIGIN = process.env.PDF_CORS_ORIGIN ?? '*'

// @sparticuz/chromium's minimal Linux Chromium build has no emoji font installed at all —
// confirmed by testing (even plain-outline Dingbat characters failed, not just color emoji). The
// live preview, plain .html download, and client-side print export don't have this problem since
// they render in the viewer's own browser/OS, which already has a real emoji font.
//
// This font is attached HERE, server-side, rather than by the client embedding it into the HTML
// it sends: that was the first attempt, and it broke the request entirely — Vercel serverless
// functions have a hard, non-configurable 4.5MB request body limit, and the base64-encoded font
// alone is ~7.6MB, well past it. Reading the same font file from this function's own bundled
// node_modules avoids the request/response payload entirely — it never travels over the network
// as part of any individual request. It also needs an explicit `includeFiles` entry in
// vercel.json: Vercel's static-analysis-based file tracer generally can't tell this font file is
// needed, since the path here is only computed at runtime via import.meta.resolve(), not a static
// string literal it can trace.
//
// Deliberately lazy and wrapped in try/catch, not resolved at module load time: an earlier
// version resolved the path as a top-level const, which — if it throws for any reason (e.g. the
// includeFiles glob not matching, or any other packaging surprise) — took down the *entire*
// module, failing every request including trivial OPTIONS preflights. A broken emoji font must
// degrade to "no emoji" for this one export, never to "the whole endpoint is down."
interface EmojiFontResources {
  bytes: Buffer
  // Excludes bare '#', '*', and '0'-'9' — see the comment below — for the generic .md-preview
  // fallback stack, so plain text/numbers render through the real text font instead.
  genericRange: string
  // The font's real, full, unmodified range — reserved for actual keycap sequences (see
  // wrapKeycapEmoji below), which need those bare characters to ligature with the combining mark.
  fullRange: string
}

let cachedEmojiFontResources: EmojiFontResources | null | undefined // undefined = not yet attempted

function getEmojiFontResources(): EmojiFontResources | null {
  if (cachedEmojiFontResources !== undefined) return cachedEmojiFontResources
  try {
    const emojiFontPath = fileURLToPath(
      import.meta.resolve('@fontsource/noto-color-emoji/files/noto-color-emoji-emoji-400-normal.woff2'),
    )
    // Without an explicit unicode-range, a font declaration defaults to claiming coverage of
    // *all* of Unicode, regardless of what glyphs the font file actually contains. Since this
    // font is a fallback before the generic `sans-serif` in the stack below, that default made
    // Chromium match it for every character, not just emoji — and since Noto Color Emoji has no
    // Latin glyphs at all, ordinary text rendered as nothing (confirmed: this is exactly what
    // happened). Fontsource ships the correct emoji-only range precomputed; reusing it directly
    // rather than hand-typing something this easy to get subtly wrong.
    const unicodeJsonPath = fileURLToPath(import.meta.resolve('@fontsource/noto-color-emoji/unicode.json'))
    const unicodeRanges = JSON.parse(readFileSync(unicodeJsonPath, 'utf-8')) as Record<string, string>
    const fullRange = Object.values(unicodeRanges).join(',')

    // One subset (needed for keycap emoji like 1️⃣/#️⃣/*️⃣) also claims bare '#', '*', and '0'-'9' —
    // characters that appear constantly in ordinary prose/code (version numbers, sizes, prices).
    // Matching those to this font instead of the text font doesn't lose the glyph, but its
    // different advance width breaks kerning between them: confirmed in a real-world document,
    // multi-digit numbers like "15" and "502" rendered as "1 5" and "5 0 2".
    const EXCLUDED_RANGE_TOKENS = new Set(['U+23', 'U+2a', 'U+30-39'])
    const genericRange = fullRange
      .split(',')
      .filter((token) => !EXCLUDED_RANGE_TOKENS.has(token))
      .join(',')

    cachedEmojiFontResources = { bytes: readFileSync(emojiFontPath), genericRange, fullRange }
  } catch (err) {
    console.error('[render-pdf] Failed to load emoji font — continuing without emoji support:', err)
    cachedEmojiFontResources = null
  }
  return cachedEmojiFontResources
}

// @sparticuz/chromium ships its browser binary compressed and decompresses it to os.tmpdir() on
// first use per container — real, one-time disk/CPU work. Caching the promise (not just the
// resolved path) means a second request landing on the same still-warm container, possibly
// arriving before the first request's decompression has even finished, awaits the *same* in-flight
// work instead of kicking off a redundant second decompression.
let chromiumExecutablePathPromise: Promise<string> | undefined

function getChromiumExecutablePath(): Promise<string> {
  if (!chromiumExecutablePathPromise) chromiumExecutablePathPromise = chromium.executablePath()
  return chromiumExecutablePathPromise
}

// Both kicked off here, at module scope, rather than waiting until the handler runs for whatever
// request happens to trigger this container's cold start: this overlaps the decompression/font-read
// work with the rest of the container's own boot time instead of only starting once the request has
// already been routed in. It can't make that first request free — nothing runs before some request
// causes the module to load in the first place — but it does shave real time off it.
void getChromiumExecutablePath().catch(() => {
  // Swallowed here only so an early failure doesn't surface as an unhandled rejection before any
  // request exists to await it; the handler's own await of this same cached promise still sees
  // and handles the real error normally.
})
getEmojiFontResources()

// Matches a keycap emoji's base character(s): digit/#/*, an optional variation selector, then the
// combining enclosing keycap mark itself. Wrapping just this in .md-keycap-emoji (see above) is
// scoped narrowly enough that it can safely run over the whole HTML string, tags included — U+20E3
// practically never appears outside an actual keycap sequence.
const KEYCAP_SEQUENCE = /[0-9#*]\uFE0F?\u20E3/g

function wrapKeycapEmoji(html: string): string {
  return html.replace(KEYCAP_SEQUENCE, (match) => `<span class="md-keycap-emoji">${match}</span>`)
}

interface RenderPdfRequestBody {
  html: string
  pageSize?: 'a4' | 'letter'
  title?: string
}

// tsconfig.api.json has no DOM lib (this file is Node-context code); page.evaluate() callbacks
// run in the browser, so anything touching document/window/FontFace needs a hand-rolled minimal
// type instead of lib.dom.d.ts's real ones.
interface BrowserFontFace {
  load: () => Promise<unknown>
}
interface BrowserWindow {
  document: { fonts: { add: (face: BrowserFontFace) => void } }
  FontFace: new (family: string, source: Uint8Array, descriptors?: { unicodeRange?: string }) => BrowserFontFace
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// headerTemplate/footerTemplate don't inherit the page's own stylesheet, so these are self-styled.
// pageNumber/totalPages are Playwright's own placeholder classes — real, live page counters,
// unlike the Chromium-only `@page` margin-box CSS counters used by the window.print() path.
function buildHeaderTemplate(title: string): string {
  return `<div style="font-size:9px; width:100%; padding:0 2cm; box-sizing:border-box; font-family:-apple-system,Helvetica,Arial,sans-serif; color:#333;">
    <span>${escapeHtml(title)}</span>
  </div>`
}

function buildFooterTemplate(): string {
  return `<div style="font-size:9px; width:100%; padding:0 2cm; box-sizing:border-box; font-family:-apple-system,Helvetica,Arial,sans-serif; color:#333; display:flex; justify-content:space-between;">
    <span>Powered by md-editor</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = req.body as RenderPdfRequestBody
  if (!body || typeof body.html !== 'string' || body.html.length === 0) {
    res.status(400).json({ error: 'Missing "html" in request body' })
    return
  }

  const pageSize = body.pageSize === 'letter' ? 'Letter' : 'A4'
  const title = body.title ?? 'Untitled.md'

  const browser = await playwrightChromium.launch({
    executablePath: await getChromiumExecutablePath(),
    args: chromium.args,
    headless: true,
  })

  try {
    const page = await browser.newPage()
    await page.setContent(wrapKeycapEmoji(body.html), { waitUntil: 'load' })

    const emojiFont = getEmojiFontResources()
    if (emojiFont) {
      // Loaded via the Font Loading API with the raw font bytes passed straight through as a
      // Playwright evaluate() argument, rather than as two separate @font-face CSS rules each
      // embedding the *same* font re-encoded as a ~7.6MB base64 data URI: that doubled both the
      // payload size and the decode work for no reason, since both "fonts" are really one file
      // read twice. Explicitly loading and awaiting both FontFace objects here — rather than
      // relying on page.setContent's 'load' event, which doesn't cover font downloads at all —
      // is also what makes emoji rendering deterministic instead of a race against however long
      // that decode happens to take on a given request.
      await page.evaluate(
        async ({ bytes, genericRange, fullRange }) => {
          const win = globalThis as unknown as BrowserWindow
          const generic = new win.FontFace('Noto Color Emoji', bytes, { unicodeRange: genericRange })
          // A real keycap emoji (1️⃣/#️⃣/*️⃣) is its digit/#/* codepoint plus a separate combining
          // "enclosing keycap" mark — they only fuse into the rounded badge glyph when a single
          // font shapes both together. The generic face above excludes those bare characters (see
          // getEmojiFontResources), which would split the pair across two fonts and break the
          // ligature. wrapKeycapEmoji (below) wraps actual keycap sequences in a class that opts
          // them back into this second, full-range face instead.
          const keycap = new win.FontFace('Noto Color Emoji Keycap', bytes, { unicodeRange: fullRange })
          await Promise.all([generic.load(), keycap.load()])
          win.document.fonts.add(generic)
          win.document.fonts.add(keycap)
        },
        { bytes: new Uint8Array(emojiFont.bytes), genericRange: emojiFont.genericRange, fullRange: emojiFont.fullRange },
      )
      await page.addStyleTag({
        content: `
.md-preview {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, "Noto Color Emoji", sans-serif;
}
.md-keycap-emoji {
  font-family: 'Noto Color Emoji Keycap', sans-serif;
}
`,
      })
    }

    const pdf = await page.pdf({
      format: pageSize,
      margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' },
      displayHeaderFooter: true,
      headerTemplate: buildHeaderTemplate(title),
      footerTemplate: buildFooterTemplate(),
      printBackground: true,
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.status(200).send(pdf)
  } finally {
    await browser.close()
  }
}
