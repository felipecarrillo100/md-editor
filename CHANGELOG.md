# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- An "OK" button in the About dialog, closing it via `useFormContainer().requestClose()` — the
  same react-dockable-desktop API its own built-in `ConfirmationForm` uses to close itself.
- A live demo link in `README.md`.
- PDF export now declares a real, defined page size (A4 by default; Letter ready in config) via
  `@page`, with print-only CSS so content actually fits the page — code blocks wrap instead of
  overflowing, and tables use `table-layout: fixed` with word-wrap instead of clipping at the
  margin.

### Changed
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
