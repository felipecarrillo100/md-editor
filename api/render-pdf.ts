import type { VercelRequest, VercelResponse } from '@vercel/node'
import chromium from '@sparticuz/chromium'
import { chromium as playwrightChromium } from 'playwright-core'

// Experimental — see the plan for context. Reuses renderStandaloneHtml's output verbatim; the
// client sends already-fully-rendered, self-contained HTML (KaTeX math, Mermaid pre-resolved to
// static SVG, no client JS at all), so page.setContent's own 'load' wait is fully deterministic —
// there's nothing async left to race against, unlike the old window.print()-based timing bug.

const ALLOWED_ORIGIN = process.env.PDF_CORS_ORIGIN ?? '*'

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
