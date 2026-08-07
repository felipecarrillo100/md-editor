import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownContent } from './MarkdownContent'

/**
 * Regression coverage for the rehype-sanitize insertion in MarkdownContent.tsx. This is the one
 * canonical pipeline shared by the live preview, the PDF print view, and the standalone HTML
 * export — a crafted share link (see shareLink.ts) can put arbitrary markdown, including raw
 * HTML, in front of this component with no other gate in between, so these payloads are real
 * attack shapes, not synthetic ones.
 */

function render(source: string): string {
  return renderToStaticMarkup(<MarkdownContent source={source} />)
}

describe('MarkdownContent sanitization', () => {
  it('strips <script> tags', () => {
    expect(render('<script>alert(1)</script>')).not.toContain('<script')
  })

  it('strips event-handler attributes', () => {
    const html = render('<img src="x" onerror="alert(1)">')
    expect(html).not.toContain('onerror')
  })

  it('strips javascript: hrefs', () => {
    const html = render('<a href="javascript:alert(1)">click</a>')
    expect(html).not.toContain('javascript:')
  })

  it('strips data: hrefs', () => {
    const html = render('<a href="data:text/html,<script>alert(1)</script>">click</a>')
    expect(html).not.toContain('data:text/html')
  })

  it('strips <iframe>/<object>/<embed>/<form>', () => {
    const html = render(`
<iframe src="https://evil.example"></iframe>
<object data="evil.swf"></object>
<embed src="evil.swf">
<form action="https://evil.example"><input></form>
`)
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<object')
    expect(html).not.toContain('<embed')
    expect(html).not.toContain('<form')
  })

  it('strips inline style attributes', () => {
    const html = render('<div style="background:url(javascript:alert(1))">hi</div>')
    expect(html).not.toContain('style=')
  })
})

describe('MarkdownContent legitimate rendering, unaffected by sanitization', () => {
  it('renders GFM tables, task lists, and headings with ids', () => {
    const html = render(`
## Heading

- [x] done
- [ ] todo

| a | b |
| - | - |
| 1 | 2 |
`)
    expect(html).toContain('id="heading"')
    expect(html).toContain('task-list-item')
    expect(html).toContain('<table>')
  })

  it('renders math via KaTeX', () => {
    const html = render('Inline math $A = \\pi r^2$.')
    expect(html).toContain('class="katex"')
  })

  it('syntax-highlights fenced code blocks', () => {
    const html = render('```ts\nfunction greet(name: string) { return name }\n```')
    expect(html).toContain('language-ts')
    expect(html).toContain('hljs-keyword')
  })
})
