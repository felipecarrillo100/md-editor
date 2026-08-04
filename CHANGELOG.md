# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
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

### Fixed
- PDF export could produce a blank page. The previous path rendered through the live DOM and
  waited a hardcoded 600ms hoping Mermaid/KaTeX had finished before calling `window.print()`; the
  new pipeline `await`s that resolution properly before ever building the HTML, so there's no
  timing race to lose.

### Removed
- `PrintView.tsx` and `print.css`, superseded by the unified export pipeline above.
