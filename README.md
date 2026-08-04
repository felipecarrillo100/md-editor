# md-editor

A markdown editor and live-preview viewer for the browser, built for beginners and professionals
alike — multiple documents at once, real exports, and a sidebar for navigation and search, all
running client-side.

## Features

- **Live preview** — edit on one side, see the rendered result update on the other, scrolled in sync
- **Multiple documents** in a dockable, tabbed workspace — drag, split, and rearrange freely
- **Table of Contents & Search / Replace**, in a sidebar, per document
- **Export** to `.md`, a self-contained `.html` file, or a real, selectable-text PDF
- **Share a document as a link** — the content lives in the URL itself, nothing is uploaded anywhere
- **Autosave with version history**, so you can fall back to an earlier draft
- **Math (LaTeX via KaTeX)**, syntax-highlighted code blocks, and Mermaid diagrams in the preview
- A **VS Code–style command palette** (`Cmd`/`Ctrl`+`K`)
- Light and dark themes

## Built with react-dockable-desktop

md-editor's tabbed, dockable workspace — the sidebar, the panels, the About dialog you get from
clicking the logo — all of it comes from
[react-dockable-desktop](https://github.com/felipecarrillo100/react-dockable-desktop), an
open-source docking window-manager for React. This app doubles as a real, non-trivial usage
example of that library: multi-document panels, per-panel sidebar contributions, and modals, all
wired up in one place. If you're evaluating `react-dockable-desktop` for your own project, this is
a good place to see it actually used.

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and build for production
```

## Source

This project's own source is at
[github.com/felipecarrillo100/md-editor](https://github.com/felipecarrillo100/md-editor).
