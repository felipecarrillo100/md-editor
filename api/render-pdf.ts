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
// as part of any individual request.
const emojiFontPath = fileURLToPath(
  import.meta.resolve('@fontsource/noto-color-emoji/files/noto-color-emoji-emoji-400-normal.woff2'),
)
let cachedEmojiFontCss: string | null = null

function getEmojiFontCss(): string {
  if (!cachedEmojiFontCss) {
    const base64 = readFileSync(emojiFontPath).toString('base64')
    cachedEmojiFontCss = `
@font-face {
  font-family: 'Noto Color Emoji';
  font-style: normal;
  font-weight: 400;
  src: url(data:font/woff2;base64,${base64}) format('woff2');
}
.md-preview {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, "Noto Color Emoji", sans-serif;
}
`
  }
  return cachedEmojiFontCss
}

interface RenderPdfRequestBody {
  html: string
  pageSize?: 'a4' | 'letter'
  title?: string
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
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  })

  try {
    const page = await browser.newPage()
    await page.setContent(body.html, { waitUntil: 'load' })
    await page.addStyleTag({ content: getEmojiFontCss() })
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
