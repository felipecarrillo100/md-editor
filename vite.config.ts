import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this repo under /<repo-name>/ — update if the repo is renamed.
const GITHUB_PAGES_BASE = '/md-editor/'

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES ? GITHUB_PAGES_BASE : '/',
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // Isolated Mermaid render target, loaded into a hidden iframe by
        // src/mermaidIsolatedRenderer.ts — see that file and mermaidRenderEntry.ts for why this
        // needs to be its own separate JS/DOM context rather than reusing the main page's.
        mermaidRender: fileURLToPath(new URL('./mermaid-render.html', import.meta.url)),
      },
    },
  },
})
