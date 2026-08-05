# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- `MdEditorLogoIcon` — a proper icon component reusing the favicon's "M + downward chevron" mark
  (minus its dark background tile), now used for the navbar brand and the About dialog instead of
  the generic `DescriptionOutlinedIcon`, so the browser tab, the brand, and the About dialog all
  agree on one identity.
- Chrome/Edge-only custom PDF page headers/footers via `@page` margin boxes: the document's own
  filename top-left, "Powered by md-editor" bottom-left, and a real `counter(page)`/`counter(pages)`
  page count bottom-right — replacing Chrome's automatic date/URL/page-count for browsers that
  support it (Chrome/Edge 131+; Safari and Firefox don't support margin boxes at all and fall
  back to their own native print header/footer, unaffected).
- A custom favicon (`public/favicon.svg`) and a descriptive `<title>` in `index.html`, replacing
  the default Vite icon/title the project had never actually replaced. The mark is a bold "M" with
  a downward chevron — the same silhouette language as the well-known, CC0 Markdown Mark — in the
  app's own accent blue on a dark tile, so the browser tab reads as md-editor's own instead of a
  generic scaffold leftover.
- An "OK" button in the About dialog, closing it via `useFormContainer().requestClose()` — the
  same react-dockable-desktop API its own built-in `ConfirmationForm` uses to close itself.
- A live demo link in `README.md`.
- PDF export now declares a real, defined page size (A4 by default; Letter ready in config) via
  `@page`, with print-only CSS so content actually fits the page — code blocks wrap instead of
  overflowing, and tables use `table-layout: fixed` with word-wrap instead of clipping at the
  margin.
- The GitHub Pages deploy workflow now passes a `VITE_PDF_SERVER_URL` repository variable through
  to `npm run build`, so the deployed site (not just local dev, via `.env.local`) can enable the
  experimental server-rendered PDF export. Left unset, `isPdfServerConfigured()` still resolves to
  `false` and the export entry simply doesn't appear, same as before.

### Changed
- The command palette's document switcher now only lists documents with a currently open panel,
  instead of every document ever created — previously, documents whose panel closed without going
  through a normal close (e.g. clearing the layout, or a session ending) stayed listed forever
  with nothing left to actually switch to.
- Renamed "Export as PDF" to "Export for printing (.pdf)" (navbar menu and command palette) — the
  action opens the browser's print dialog rather than downloading a file directly like "Export as
  HTML" does, and the previous label implied the latter.
- PDF export now builds on the same self-contained HTML render used for the `.html` download,
  printed inside a hidden iframe, instead of a separate live-DOM print path — one pipeline for
  both exports, so they can't visually drift apart.
- Exports (`.html` and PDF) always render in the light theme now, independent of the app's own
  live dark/light toggle — the app's viewing preference isn't part of a document meant to be
  shared or printed.
- The experimental server-rendered PDF export now starts decompressing its bundled Chromium binary
  and reading its emoji font at module load (i.e. as soon as a cold container boots) instead of
  waiting until the first request's handler runs, and caches the in-flight work so a second request
  landing on the same still-warm container never repeats it. Shaves real time off a cold request by
  overlapping this work with the rest of the container's own startup, though it can't eliminate that
  cost entirely — nothing runs before some request causes the container to boot in the first place.

### Fixed
- PDF export could produce a blank page. The previous path rendered through the live DOM and
  waited a hardcoded 600ms hoping Mermaid/KaTeX had finished before calling `window.print()`; the
  new pipeline `await`s that resolution properly before ever building the HTML, so there's no
  timing race to lose.
- The experimental server-rendered PDF export (`api/render-pdf.ts`) could fail entirely, including
  its `OPTIONS` preflight — surfacing in the browser as a misleading "CORS error" with no signal
  about the real cause. The emoji font's path was resolved via `import.meta.resolve()` at module
  load time, unwrapped; a failure there took down the whole function before any request could be
  handled. Resolution now happens lazily inside the handler, wrapped in try/catch, and `vercel.json`
  explicitly `includeFiles`s the font path Vercel's static file-tracer can't detect on its own
  (it's only computed at runtime, not a static string literal it can trace).
- The experimental server-rendered PDF export's emoji font had no `unicode-range` set, which
  defaults to claiming coverage of all of Unicode regardless of what the font file actually
  contains — since it sat in the fallback stack before the generic `sans-serif`, Chromium matched
  it for every character, not just emoji, and rendered ordinary text as nothing (Noto Color Emoji
  has no Latin glyphs at all). Now declares the font's real emoji-only range, reusing
  `@fontsource/noto-color-emoji`'s own precomputed range data instead of a hand-typed one.
- The experimental server-rendered PDF export's emoji font range (above) also covers bare `#`,
  `*`, and `0`-`9` — needed for keycap emoji like 1️⃣/#️⃣/*️⃣ — which meant every plain digit/`#`/`*`
  in a document matched the emoji font instead of the text font; its different character spacing
  broke multi-digit numbers apart (e.g. "15" rendered as "1 5", "502" as "5 0 2"). The font is now
  declared twice: a generic face (used everywhere via the `.md-preview` fallback stack) with those
  three tokens excluded, plus a second, full-range face reserved for real keycap sequences, which
  the export now detects and wraps explicitly so they still opt into it — a keycap emoji is its
  digit/`#`/`*` plus a separate combining "enclosing keycap" mark, and the two only fuse into the
  rounded badge glyph when a single font shapes both, so simply excluding the digit everywhere
  would have fixed plain numbers while breaking every keycap emoji instead.
- The experimental server-rendered PDF export's emoji font could intermittently fail to render at
  all — not just the keycap/digit edge cases above, but every emoji missing. `page.setContent`'s
  `load` wait doesn't cover font downloads, which resolve asynchronously on their own schedule, so
  nothing was blocking `page.pdf()` until the font had actually finished decoding; whether it made
  it in time came down to raw timing luck, confirmed by emoji rendering correctly once the
  function's process was already warm but disappearing on a fresh cold start. The font is now
  loaded via the Font Loading API instead of CSS `@font-face` plus a base64 data URI — both faces
  (see above) are constructed directly from the font's raw bytes and explicitly `load()`ed and
  awaited before the PDF is captured, so this is now deterministic instead of a race. This also
  removes the redundant base64 re-encoding of the same ~5.7MB font file into two separate ~7.6MB
  text payloads that the two-face fix above had introduced.

### Removed
- `PrintView.tsx` and `print.css`, superseded by the unified export pipeline above.
